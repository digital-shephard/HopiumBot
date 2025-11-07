/**
 * Aster Finance DEX Service Implementation
 * 
 * Implements DexService interface for Aster Finance Futures API
 */

import DexService from '../DexService'
import AsterApiClient from './AsterApiClient'

export class AsterDexService extends DexService {
  constructor() {
    super()
    this.apiClient = null
    this.initialized = false
    this.exchangeInfo = null // Cache exchange info
    this.positionMode = null // Cache position mode (hedge vs one-way)
  }

  /**
   * Initialize with Aster API credentials
   * @param {Object} credentials
   * @param {string} credentials.apiKey - Aster API key
   * @param {string} credentials.secretKey - Aster API secret
   */
  async initialize(credentials) {
    if (!credentials.apiKey || !credentials.secretKey) {
      throw new Error('Aster API key and secret are required')
    }

    this.apiClient = new AsterApiClient(credentials.apiKey, credentials.secretKey)
    this.initialized = true
  }

  /**
   * Validate credentials by checking account balance
   */
  async validateCredentials() {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized. Call initialize() first.')
    }

    try {
      // Try simple endpoint first - only requires timestamp and signature
      // This endpoint is lighter weight and more reliable for validation
      await this.apiClient.get('/fapi/v1/positionSide/dual', {}, { signed: true })
      return true
    } catch (error) {
      // Log the full error for debugging
      console.error('[AsterDexService] Validation error:', {
        message: error.message,
        error: error
      })
      
      // Check for specific error types
      const errorMsg = error.message || String(error)
      
      // API key or signature errors
      if (errorMsg.includes('Invalid API-key') || 
          errorMsg.includes('Signature') || 
          errorMsg.includes('Invalid signature') ||
          errorMsg.includes('Unauthorized') ||
          errorMsg.includes('API-key format invalid') ||
          errorMsg.includes('Invalid API-key, IP')) {
        throw new Error('Invalid API credentials')
      }
      
      // Network errors
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network error')) {
        throw new Error('Network error: Unable to connect to Aster Finance API')
      }
      
      // Pass through the original error with more context
      throw new Error(`Validation failed: ${errorMsg}`)
    }
  }

  /**
   * Fetch exchange info (cached)
   */
  async getExchangeInfo() {
    if (this.exchangeInfo) {
      return this.exchangeInfo
    }

    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    try {
      const response = await this.apiClient.get('/fapi/v1/exchangeInfo', {}, { signed: false })
      this.exchangeInfo = response
      return response
    } catch (error) {
      console.error('[AsterDexService] Failed to fetch exchange info:', error)
      throw error
    }
  }

  /**
   * Get symbol precision info
   */
  async getSymbolPrecision(symbol) {
    const exchangeInfo = await this.getExchangeInfo()
    const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol)
    
    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found in exchange info`)
    }

    // Get LOT_SIZE filter for stepSize
    const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE')
    const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER')

    return {
      quantityPrecision: symbolInfo.quantityPrecision,
      pricePrecision: symbolInfo.pricePrecision,
      stepSize: lotSizeFilter?.stepSize || '1',
      tickSize: priceFilter?.tickSize || '0.01'
    }
  }

  /**
   * Format quantity according to symbol precision
   */
  formatQuantity(quantity, stepSize) {
    const step = parseFloat(stepSize)
    // Use Math.round instead of Math.floor to properly close positions
    // Math.floor would leave small amounts open when closing
    const rounded = Math.round(quantity / step) * step
    
    // Determine decimal places from stepSize
    const decimals = stepSize.includes('.') ? stepSize.split('.')[1].length : 0
    
    return rounded.toFixed(decimals)
  }

  /**
   * Format price according to symbol precision
   */
  formatPrice(price, tickSize) {
    const tick = parseFloat(tickSize)
    const rounded = Math.round(price / tick) * tick
    
    // Determine decimal places from tickSize
    const decimals = tickSize.includes('.') ? tickSize.split('.')[1].length : 0
    
    return rounded.toFixed(decimals)
  }

  /**
   * Get position mode (hedge vs one-way)
   * Caches the result to avoid repeated API calls
   */
  async getPositionMode() {
    if (this.positionMode !== null) {
      return this.positionMode
    }

    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    try {
      const response = await this.apiClient.get('/fapi/v1/positionSide/dual', {}, { signed: true })
      // Response format: { dualSidePosition: true/false }
      // true = Hedge Mode, false = One-way Mode
      this.positionMode = response.dualSidePosition === true
      console.log(`[AsterDexService] Position mode detected: ${this.positionMode ? 'HEDGE' : 'ONE-WAY'}`)
      return this.positionMode
    } catch (error) {
      console.error('[AsterDexService] Failed to get position mode:', error)
      // Default to one-way mode if we can't determine (safer assumption)
      this.positionMode = false
      return false
    }
  }

  /**
   * Place a new order
   */
  async placeOrder(orderParams) {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    const {
      symbol,
      side,
      type,
      quantity,
      price,
      timeInForce = 'GTC',
      newClientOrderId,
      reduceOnly,
      rawQuantity, // If true, skip quantity formatting (for closing positions)
      positionSide // Optional: explicit position side override
    } = orderParams

    // Validate required parameters
    if (!symbol || !side || !type || !quantity) {
      throw new Error('Missing required order parameters')
    }

    // Validate LIMIT order requires price
    if (type === 'LIMIT' && !price) {
      throw new Error('LIMIT orders require a price')
    }

    // Get position mode to determine if we need positionSide parameter
    const isHedgeMode = await this.getPositionMode()

    // Get symbol precision and format values
    const precision = await this.getSymbolPrecision(symbol)
    // If rawQuantity is true, use quantity as-is (it's already formatted from positionAmt)
    // Otherwise format it according to stepSize
    const formattedQuantity = rawQuantity ? String(quantity) : this.formatQuantity(quantity, precision.stepSize)
    const formattedPrice = price ? this.formatPrice(price, precision.tickSize) : undefined

    console.log('[AsterDexService] Formatting order:', {
      rawQuantity: quantity,
      formattedQuantity,
      stepSize: precision.stepSize,
      rawPrice: price,
      formattedPrice,
      tickSize: precision.tickSize,
      positionMode: isHedgeMode ? 'HEDGE' : 'ONE-WAY'
    })

    const params = {
      symbol,
      side,
      type,
      quantity: formattedQuantity,
      newOrderRespType: 'RESULT' // Get full order response
    }

    // Handle positionSide parameter based on position mode
    // In Hedge Mode: positionSide MUST be sent (LONG or SHORT)
    // In One-way Mode: positionSide defaults to BOTH, but we'll set it explicitly to avoid API issues
    if (isHedgeMode) {
      // Hedge mode requires positionSide
      if (positionSide) {
        // Use explicit positionSide if provided
        params.positionSide = positionSide.toUpperCase()
      } else {
        // Map BUY -> LONG, SELL -> SHORT for hedge mode
        params.positionSide = side === 'BUY' ? 'LONG' : 'SHORT'
      }
    } else {
      // One-way mode: explicitly set to BOTH (even though API docs say it defaults)
      // Some API implementations may require this to be explicit
      params.positionSide = 'BOTH'
    }

    // Only add timeInForce for LIMIT orders (MARKET orders don't need it)
    if (type === 'LIMIT') {
      params.timeInForce = timeInForce
    }

    if (formattedPrice) {
      params.price = formattedPrice
    }

    if (newClientOrderId) {
      params.newClientOrderId = newClientOrderId
    }

    // reduceOnly cannot be sent in Hedge Mode per API docs
    // In Hedge Mode, closing positions is done by specifying the correct positionSide
    if (reduceOnly && !isHedgeMode) {
      params.reduceOnly = true
    }

    try {
      const response = await this.apiClient.post('/fapi/v1/order', params, { signed: true })
      return response
    } catch (error) {
      // Handle position side errors specifically
      const errorMsg = error.message
      if (errorMsg.includes('position side') || errorMsg.includes('positionSide') || errorMsg.includes('-4061')) {
        // Clear cached position mode to force re-check on next order
        console.warn('[AsterDexService] Position side error detected, clearing cache')
        this.positionMode = null
        throw new Error('Order position side mismatch. Please check your account position mode settings.')
      }
      
      // Simplify error messages
      if (errorMsg.includes('Insufficient balance')) {
        throw new Error('Insufficient balance')
      } else if (errorMsg.includes('MIN_NOTIONAL')) {
        throw new Error('Order size too small')
      } else if (errorMsg.includes('LOT_SIZE')) {
        throw new Error('Invalid order quantity')
      } else if (errorMsg.includes('PRICE_FILTER')) {
        throw new Error('Invalid order price')
      }
      throw error
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol, orderId) {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    const params = {
      symbol,
      orderId: String(orderId)
    }

    try {
      const response = await this.apiClient.delete('/fapi/v1/order', params, { signed: true })
      return response
    } catch (error) {
      if (error.message.includes('Unknown order')) {
        throw new Error('Order not found')
      }
      throw error
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(symbol, orderId) {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    const params = {
      symbol,
      orderId: String(orderId)
    }

    try {
      const response = await this.apiClient.get('/fapi/v1/order', params, { signed: true })
      return response
    } catch (error) {
      if (error.message.includes('Order does not exist')) {
        throw new Error('Order not found')
      }
      throw error
    }
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(symbol = null) {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    const params = {}
    if (symbol) {
      params.symbol = symbol
    }

    try {
      const response = await this.apiClient.get('/fapi/v1/openOrders', params, { signed: true })
      return Array.isArray(response) ? response : []
    } catch (error) {
      throw error
    }
  }

  /**
   * Get current position for a symbol
   */
  async getPosition(symbol) {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    const params = {
      symbol
    }

    try {
      const positions = await this.apiClient.get('/fapi/v2/positionRisk', params, { signed: true })
      
      // Find position for this symbol (should be only one in One-way mode)
      const position = Array.isArray(positions) 
        ? positions.find(p => p.symbol === symbol && parseFloat(p.positionAmt) !== 0)
        : null

      return position || {
        symbol,
        positionAmt: '0',
        entryPrice: '0',
        markPrice: '0',
        unRealizedProfit: '0',
        leverage: '1',
        liquidationPrice: '0'
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance() {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    try {
      const account = await this.apiClient.get('/fapi/v4/account', {}, { signed: true })
      
      // Extract USDT balance (or first available asset)
      const assets = account.assets || []
      const usdtAsset = assets.find(a => a.asset === 'USDT') || assets[0]

      return {
        totalBalance: account.totalWalletBalance || '0',
        availableBalance: usdtAsset?.availableBalance || '0',
        walletBalance: usdtAsset?.walletBalance || '0',
        unrealizedProfit: account.totalUnrealizedProfit || '0',
        assets: assets
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Get leverage bracket for a symbol
   * Returns max leverage and notional limits for the symbol
   */
  async getLeverageBracket(symbol) {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    const params = { symbol }

    try {
      const response = await this.apiClient.get('/fapi/v1/leverageBracket', params, { signed: true })
      
      // Response format: { symbol: "BTCUSDT", brackets: [...] }
      if (response && response.brackets) {
        return response
      }
      
      throw new Error('Invalid leverage bracket response')
    } catch (error) {
      console.error(`[AsterDexService] Failed to get leverage bracket for ${symbol}:`, error)
      throw error
    }
  }

  /**
   * Set leverage for a symbol
   * @param {string} symbol - Trading pair symbol
   * @param {number} leverage - Leverage value (1-125)
   */
  async setLeverage(symbol, leverage) {
    if (!this.initialized || !this.apiClient) {
      throw new Error('Service not initialized')
    }

    const params = {
      symbol,
      leverage: parseInt(leverage)
    }

    try {
      const response = await this.apiClient.post('/fapi/v1/leverage', params, { signed: true })
      console.log(`[AsterDexService] Set leverage for ${symbol} to ${leverage}x:`, response)
      return response
    } catch (error) {
      console.error(`[AsterDexService] Failed to set leverage for ${symbol}:`, error)
      throw error
    }
  }

  /**
   * Get maximum allowed leverage for a position size
   * @param {string} symbol - Trading pair symbol
   * @param {number} notional - Position size in USD
   * @returns {number} Maximum allowed leverage
   */
  async getMaxLeverageForNotional(symbol, notional) {
    try {
      const brackets = await this.getLeverageBracket(symbol)
      
      // Find the bracket that contains this notional
      for (const bracket of brackets.brackets) {
        if (notional >= bracket.notionalFloor && notional <= bracket.notionalCap) {
          return bracket.initialLeverage
        }
      }
      
      // If notional exceeds all brackets, use the last bracket's leverage
      return brackets.brackets[brackets.brackets.length - 1].initialLeverage
    } catch (error) {
      console.error(`[AsterDexService] Failed to get max leverage for ${symbol}:`, error)
      // Return conservative default
      return 20
    }
  }

  /**
   * Get DEX name
   */
  getName() {
    return 'aster'
  }
}

export default AsterDexService

