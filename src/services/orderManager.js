/**
 * Order Manager Service
 * 
 * Manages order lifecycle:
 * - Subscribes to WebSocket summary messages
 * - Places orders when server recommends entry
 * - Polls order status periodically
 * - Monitors positions for TP/SL triggers
 * - Enforces position size limits
 */

import AsterDexService from './dex/aster/AsterDexService'

// Rate limiting: Poll every 4 seconds (15 requests/minute per order)
// Aster limit: 2400 requests/minute, so we can poll many orders safely
const ORDER_POLL_INTERVAL = 4000 // 4 seconds
const POSITION_CHECK_INTERVAL = 5000 // 5 seconds

export class OrderManager {
  constructor() {
    this.dexService = null
    this.isRunning = false
    this.activeOrders = new Map() // orderId -> order data
    this.activePositions = new Map() // symbol -> position data
    this.settings = null
    
    // Polling intervals
    this.orderPollInterval = null
    this.positionCheckInterval = null
    
    // Error callback
    this.onError = null
  }

  /**
   * Initialize order manager with settings
   * @param {Object} settings
   * @param {string} settings.apiKey - API key
   * @param {string} settings.secretKey - API secret
   * @param {number} settings.capital - Total capital limit
   * @param {number} settings.takeProfit - Take profit percentage
   * @param {number} settings.stopLoss - Stop loss percentage
   * @param {number} settings.positionSize - Position size percentage (1-100)
   */
  async initialize(settings) {
    this.settings = settings

    // Initialize DEX service
    this.dexService = new AsterDexService()
    await this.dexService.initialize({
      apiKey: settings.apiKey,
      secretKey: settings.secretKey
    })

    // Validate credentials
    try {
      await this.dexService.validateCredentials()
    } catch (error) {
      throw new Error(`Invalid credentials: ${error.message}`)
    }
  }

  /**
   * Start order management (polling, monitoring)
   */
  start() {
    if (this.isRunning) {
      return
    }

    this.isRunning = true

    // Start polling open orders
    this.orderPollInterval = setInterval(() => {
      this.pollOpenOrders().catch(error => {
        this.handleError('Failed to poll orders', error)
      })
    }, ORDER_POLL_INTERVAL)

    // Start checking positions for TP/SL
    this.positionCheckInterval = setInterval(() => {
      this.checkPositions().catch(error => {
        this.handleError('Failed to check positions', error)
      })
    }, POSITION_CHECK_INTERVAL)

    // Initial poll
    this.pollOpenOrders().catch(error => {
      this.handleError('Failed to poll orders', error)
    })
  }

  /**
   * Stop order management
   */
  stop() {
    this.isRunning = false

    if (this.orderPollInterval) {
      clearInterval(this.orderPollInterval)
      this.orderPollInterval = null
    }

    if (this.positionCheckInterval) {
      clearInterval(this.positionCheckInterval)
      this.positionCheckInterval = null
    }
  }

  /**
   * Handle WebSocket summary message with entry recommendation
   * @param {Object} summaryData - Summary message data from WebSocket
   */
  async handleSummary(summaryData) {
    if (!this.isRunning || !this.dexService) {
      return
    }

    const { summary } = summaryData
    if (!summary || !summary.entry) {
      return
    }

    const entry = summary.entry
    const symbol = summaryData.symbol || 'BTCUSDT'

    try {
      // Check if we already have an open position for this symbol
      const existingPosition = await this.dexService.getPosition(symbol)
      const positionAmt = parseFloat(existingPosition.positionAmt || '0')

      if (positionAmt !== 0) {
        // Already have a position, skip
        return
      }

      // Check if we have an open order for this symbol
      const openOrders = await this.dexService.getOpenOrders(symbol)
      if (openOrders.length > 0) {
        // Already have open orders, skip
        return
      }

      // Calculate position size based on capital setting
      const accountBalance = await this.dexService.getAccountBalance()
      const availableBalance = parseFloat(accountBalance.availableBalance || '0')
      const positionSizePercent = this.settings.positionSize || 10
      const capitalLimit = parseFloat(this.settings.capital || '0')
      const leverage = this.settings.leverage || 1
      
      // Use capital limit as base for position size calculation
      const targetPositionValue = (capitalLimit * positionSizePercent) / 100
      
      // Check if we have enough margin (position value / leverage must be <= available balance)
      const requiredMargin = targetPositionValue / leverage
      const maxPositionValue = availableBalance >= requiredMargin ? targetPositionValue : availableBalance * leverage

      // Calculate quantity
      const entryPrice = parseFloat(entry.price)
      const quantity = maxPositionValue / entryPrice

      // Convert LONG/SHORT to BUY/SELL for Aster API
      const asterSide = entry.side === 'LONG' ? 'BUY' : entry.side === 'SHORT' ? 'SELL' : entry.side
      console.log(`[OrderManager] Converting side: ${entry.side} → ${asterSide}`)

      // Place LIMIT order (always use LIMIT for safety)
      // Note: DexService will handle precision formatting
      const orderParams = {
        symbol,
        side: asterSide,
        type: 'LIMIT', // Always LIMIT for safety
        quantity: quantity, // DexService will format to correct precision
        price: entry.price,
        timeInForce: 'GTC',
        newClientOrderId: `hopium_${Date.now()}`
      }

      const orderResponse = await this.dexService.placeOrder(orderParams)

      // Store order information
      this.activeOrders.set(orderResponse.orderId, {
        orderId: orderResponse.orderId,
        symbol,
        side: entry.side,
        entryPrice: entry.price,
        quantity: orderResponse.executedQty || orderResponse.origQty, // Use actual filled/original quantity
        status: orderResponse.status,
        takeProfit: this.settings.takeProfit,
        stopLoss: this.settings.stopLoss,
        createdAt: Date.now()
      })

    } catch (error) {
      this.handleError('Failed to place order', error)
    }
  }

  /**
   * Handle scalp indicator signal (high-frequency strategy)
   * @param {Object} scalpData - Normalized scalp indicator data
   * @param {string} scalpData.symbol - Trading pair symbol
   * @param {string} scalpData.side - 'LONG' | 'SHORT' | 'NEUTRAL'
   * @param {number} scalpData.limit_price - Recommended limit entry
   */
  async handleScalpSignal(scalpData) {
    console.log('[OrderManager] handleScalpSignal called with:', scalpData)
    
    if (!this.isRunning || !this.dexService) {
      console.log('[OrderManager] Not running or no dexService')
      return
    }

    // Defensive guards
    if (!scalpData || !scalpData.symbol || !scalpData.side || !scalpData.limit_price) {
      console.log('[OrderManager] Missing required fields:', {
        hasData: !!scalpData,
        hasSymbol: !!scalpData?.symbol,
        hasSide: !!scalpData?.side,
        hasLimitPrice: !!scalpData?.limit_price
      })
      return
    }

    const symbol = scalpData.symbol
    const side = scalpData.side
    const entryPrice = parseFloat(scalpData.limit_price)

    // Ignore NEUTRAL
    if (side === 'NEUTRAL') {
      console.log('[OrderManager] NEUTRAL side, skipping')
      return
    }

    try {
      // Skip if a position already exists
      const existingPosition = await this.dexService.getPosition(symbol)
      const positionAmt = parseFloat(existingPosition.positionAmt || '0')
      console.log('[OrderManager] Position check:', { symbol, positionAmt })
      if (positionAmt !== 0) {
        console.log('[OrderManager] Position already exists, skipping')
        return
      }

      // Skip if there are already open orders
      const openOrders = await this.dexService.getOpenOrders(symbol)
      console.log('[OrderManager] Open orders check:', { symbol, count: openOrders.length })
      if (openOrders.length > 0) {
        console.log('[OrderManager] Open orders exist, skipping')
        return
      }

      // Calculate position size based on capital setting
      const accountBalance = await this.dexService.getAccountBalance()
      const availableBalance = parseFloat(accountBalance.availableBalance || '0')
      const positionSizePercent = this.settings.positionSize || 10
      const capitalLimit = parseFloat(this.settings.capital || '0')
      const leverage = this.settings.leverage || 1
      
      // Use capital limit as base for position size calculation
      const targetPositionValue = (capitalLimit * positionSizePercent) / 100
      
      // Check if we have enough margin (position value / leverage must be <= available balance)
      const requiredMargin = targetPositionValue / leverage
      const maxPositionValue = availableBalance >= requiredMargin ? targetPositionValue : availableBalance * leverage

      if (entryPrice <= 0) {
        return
      }

      const quantity = maxPositionValue / entryPrice
      const asterSide = side === 'LONG' ? 'BUY' : 'SELL'

      console.log('[OrderManager] Placing scalp order:', {
        symbol,
        side,
        asterSide,
        entryPrice,
        quantity,
        targetPositionValue,
        maxPositionValue,
        requiredMargin,
        availableBalance,
        positionSizePercent,
        leverage,
        capitalLimit
      })

      const orderParams = {
        symbol,
        side: asterSide,
        type: 'LIMIT',
        quantity: quantity,
        price: entryPrice,
        timeInForce: 'GTC',
        newClientOrderId: `hopium_scalp_${Date.now()}`
      }

      console.log('[OrderManager] Order params:', orderParams)
      const orderResponse = await this.dexService.placeOrder(orderParams)
      console.log('[OrderManager] Order placed successfully:', orderResponse)

      // Track order for management
      this.activeOrders.set(orderResponse.orderId, {
        orderId: orderResponse.orderId,
        symbol,
        side,
        entryPrice: entryPrice,
        quantity: orderResponse.executedQty || orderResponse.origQty,
        status: orderResponse.status,
        takeProfit: this.settings.takeProfit,
        stopLoss: this.settings.stopLoss,
        createdAt: Date.now()
      })
    } catch (error) {
      console.error('[OrderManager] Failed to place scalp order:', error)
      this.handleError('Failed to place scalp order', error)
    }
  }

  /**
   * Poll open orders to check status
   */
  async pollOpenOrders() {
    if (!this.dexService) return

    try {
      // Get all open orders from DEX
      const openOrders = await this.dexService.getOpenOrders()

      // Update tracked orders
      const trackedOrderIds = new Set(this.activeOrders.keys())
      
      for (const order of openOrders) {
        const orderId = order.orderId
        trackedOrderIds.delete(orderId)

        // Update order status
        if (this.activeOrders.has(orderId)) {
          const trackedOrder = this.activeOrders.get(orderId)
          trackedOrder.status = order.status

          // Check if order is filled
          if (order.status === 'FILLED') {
            // Move to position tracking
            await this.handleOrderFilled(orderId, order)
          }
        }
      }

      // Remove orders that are no longer open (filled, cancelled, etc.)
      for (const orderId of trackedOrderIds) {
        const order = this.activeOrders.get(orderId)
        
        // Check final status
        try {
          const orderStatus = await this.dexService.getOrderStatus(order.symbol, orderId)
          if (orderStatus.status === 'FILLED') {
            await this.handleOrderFilled(orderId, orderStatus)
          }
        } catch (error) {
          // Order doesn't exist anymore, remove it
          this.activeOrders.delete(orderId)
        }
      }

    } catch (error) {
      this.handleError('Error polling orders', error)
    }
  }

  /**
   * Handle order filled event
   */
  async handleOrderFilled(orderId, orderData) {
    const order = this.activeOrders.get(orderId)
    if (!order) return

    // Remove from active orders
    this.activeOrders.delete(orderId)

    // Add to active positions
    const positionData = {
      symbol: order.symbol,
      side: order.side,
      entryPrice: parseFloat(order.entryPrice),
      quantity: parseFloat(order.quantity),
      takeProfit: order.takeProfit,
      stopLoss: order.stopLoss,
      filledAt: Date.now()
    }

    this.activePositions.set(order.symbol, positionData)
  }

  /**
   * Check positions for TP/SL triggers
   */
  async checkPositions() {
    if (!this.dexService) return

    for (const [symbol, position] of this.activePositions.entries()) {
      try {
        const currentPosition = await this.dexService.getPosition(symbol)
        const positionAmt = parseFloat(currentPosition.positionAmt || '0')

        // Position closed
        if (positionAmt === 0) {
          this.activePositions.delete(symbol)
          continue
        }

        const markPrice = parseFloat(currentPosition.markPrice || '0')
        const entryPrice = position.entryPrice
        const side = position.side

        // Calculate profit/loss percentage
        let pnlPercent = 0
        if (side === 'LONG') {
          pnlPercent = ((markPrice - entryPrice) / entryPrice) * 100
        } else {
          pnlPercent = ((entryPrice - markPrice) / entryPrice) * 100
        }

        // Check TP/SL
        const shouldClose = 
          (position.takeProfit > 0 && pnlPercent >= position.takeProfit) ||
          (position.stopLoss > 0 && pnlPercent <= -position.stopLoss)

        if (shouldClose) {
          await this.closePosition(symbol, position, 'TP/SL triggered')
        }

      } catch (error) {
        this.handleError(`Error checking position ${symbol}`, error)
      }
    }
  }

  /**
   * Close a position
   */
  async closePosition(symbol, position, reason) {
    try {
      // Get current position to determine quantity
      const currentPosition = await this.dexService.getPosition(symbol)
      const positionAmt = parseFloat(currentPosition.positionAmt || '0')

      if (positionAmt === 0) {
        // Already closed
        this.activePositions.delete(symbol)
        return
      }

      // Determine opposite side
      const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY'
      const quantity = Math.abs(positionAmt)

      // Place MARKET order to close (for immediate execution)
      // Note: DexService will handle precision formatting
      const orderParams = {
        symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: quantity // DexService will format to correct precision
      }

      await this.dexService.placeOrder(orderParams)

      // Remove from active positions
      this.activePositions.delete(symbol)

    } catch (error) {
      this.handleError(`Failed to close position ${symbol}`, error)
      throw error
    }
  }

  /**
   * Handle errors
   */
  handleError(context, error) {
    const errorMessage = error.message || String(error)
    let simplifiedMessage = errorMessage

    // Simplify common errors
    if (errorMessage.includes('Invalid API')) {
      simplifiedMessage = 'Invalid API credentials'
    } else if (errorMessage.includes('Insufficient balance')) {
      simplifiedMessage = 'Insufficient balance'
    } else if (errorMessage.includes('Network error')) {
      simplifiedMessage = 'Network error - check connection'
    } else if (errorMessage.includes('rate limit')) {
      simplifiedMessage = 'Rate limit exceeded - slowing down'
    }

    if (this.onError) {
      this.onError(`${context}: ${simplifiedMessage}`)
    } else {
      console.error(`[OrderManager] ${context}:`, error)
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeOrders: Array.from(this.activeOrders.values()),
      activePositions: Array.from(this.activePositions.values())
    }
  }
}

export default OrderManager

