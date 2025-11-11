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

// Rate limiting: Poll every 2 seconds (30 requests/minute per order)
// Aster limit: 2400 requests/minute, so we can poll many orders safely
const ORDER_POLL_INTERVAL = 2000 // 2 seconds (faster for order timeout checks)
const POSITION_CHECK_INTERVAL = 5000 // 5 seconds
const DEFAULT_ORDER_TIMEOUT = 120000 // 2 minutes default - cancel unfilled orders after this time

// Fees for PNL calculation
const ENTRY_FEE = 0.0002 // 0.02%
const EXIT_FEE = 0.0002 // 0.02%

export class OrderManager {
  constructor() {
    this.dexService = null
    this.isRunning = false
    this.activeOrders = new Map() // orderId -> order data
    this.activePositions = new Map() // symbol -> position data
    this.settings = null
    this.orderTimeout = DEFAULT_ORDER_TIMEOUT // Configurable order timeout (milliseconds)
    
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
   * @param {string} settings.orderType - Order type ('LIMIT' or 'MARKET')
   * @param {number} settings.orderTimeout - Order timeout in seconds (default 120)
   */
  async initialize(settings) {
    this.settings = {
      ...settings,
      orderType: settings.orderType || 'LIMIT' // Default to LIMIT for safety
    }

    // Set configurable order timeout (convert seconds to milliseconds)
    if (settings.orderTimeout !== undefined) {
      this.orderTimeout = settings.orderTimeout * 1000 // Convert to milliseconds
    }

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
      
      // CRITICAL: Check global position limit (max 3 positions + pending orders)
      // Only check if we're trying to open a NEW position (no existing position or orders)
      // Count BOTH active positions AND pending orders (orders become positions when filled)
      const totalActive = this.activePositions.size + this.activeOrders.size
      if (totalActive >= 3) {
        console.log(`[OrderManager] 🚫 BLOCKED: Already have ${totalActive}/3 active (${this.activePositions.size} positions + ${this.activeOrders.size} pending orders) - cannot open ${symbol}`)
        console.log(`[OrderManager] Active positions:`, Array.from(this.activePositions.keys()))
        console.log(`[OrderManager] Pending orders:`, Array.from(this.activeOrders.values()).map(o => `${o.symbol} (${o.orderId})`))
        return
      }

      // Calculate position size - USE CAPITAL % AS MARGIN
      const accountBalance = await this.dexService.getAccountBalance()
      const availableBalance = parseFloat(accountBalance.availableBalance || '0')
      const positionSizePercent = this.settings.positionSize || 10
      const capitalLimit = parseFloat(this.settings.capital || '0')
      const leverage = this.settings.leverage || 1
      
      // Position size % of capital IS the margin we want to use
      const marginToUse = (capitalLimit * positionSizePercent) / 100
      
      // Actual position value = margin * leverage
      const targetPositionValue = marginToUse * leverage
      
      // Make sure we have enough balance for the margin
      const maxPositionValue = availableBalance >= marginToUse ? targetPositionValue : availableBalance * leverage

      // Calculate quantity
      const entryPrice = parseFloat(entry.price)
      const quantity = maxPositionValue / entryPrice

      // Convert LONG/SHORT to BUY/SELL for Aster API
      const asterSide = entry.side === 'LONG' ? 'BUY' : entry.side === 'SHORT' ? 'SELL' : entry.side
      const orderType = this.settings.orderType || 'LIMIT'
      console.log(`[OrderManager] Converting side: ${entry.side} → ${asterSide}, order type: ${orderType}`)

      // Place order based on user setting
      // Note: DexService will handle precision formatting
      const orderParams = {
        symbol,
        side: asterSide,
        type: orderType,
        quantity: quantity, // DexService will format to correct precision
        newClientOrderId: `hopium_${Date.now()}`
      }

      // Only add price and timeInForce for LIMIT orders
      if (orderType === 'LIMIT') {
        orderParams.price = entry.price
        orderParams.timeInForce = 'GTC'
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
      // Check for existing position and open orders
      const existingPosition = await this.dexService.getPosition(symbol)
      const positionAmt = parseFloat(existingPosition.positionAmt || '0')
      const openOrders = await this.dexService.getOpenOrders(symbol)
      
      // CRITICAL: Check global position limit (max 3 positions + pending orders)
      // Only check if we're trying to open a NEW position (no existing position)
      // Count BOTH active positions AND pending orders (orders become positions when filled)
      if (positionAmt === 0 && openOrders.length === 0) {
        const totalActive = this.activePositions.size + this.activeOrders.size
        if (totalActive >= 3) {
          console.log(`[OrderManager] 🚫 BLOCKED: Already have ${totalActive}/3 active (${this.activePositions.size} positions + ${this.activeOrders.size} pending orders) - cannot open ${symbol}`)
          console.log(`[OrderManager] Active positions:`, Array.from(this.activePositions.keys()))
          console.log(`[OrderManager] Pending orders:`, Array.from(this.activeOrders.values()).map(o => `${o.symbol} (${o.orderId})`))
          return
        }
      }
      
      console.log('[OrderManager] Position and orders check:', { 
        symbol, 
        positionAmt, 
        openOrdersCount: openOrders.length 
      })
      
      // CASE 1: Partially filled (position exists + open orders exist)
      if (positionAmt !== 0 && openOrders.length > 0) {
        console.log('[OrderManager] 🔄 PARTIAL FILL detected - position exists with unfilled orders')
        
        const orderType = this.settings.orderType || 'LIMIT'
        const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
        
        // Calculate unfilled quantity from open orders
        let totalUnfilledQty = 0
        for (const order of openOrders) {
          const origQty = parseFloat(order.origQty || '0')
          const executedQty = parseFloat(order.executedQty || '0')
          const unfilledQty = origQty - executedQty
          totalUnfilledQty += unfilledQty
        }
        
        console.log(`[OrderManager] Unfilled quantity: ${totalUnfilledQty}`)
        
        // Cancel all unfilled orders
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled partially filled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
        
        // Place new order for ONLY the unfilled amount at new price
        if (totalUnfilledQty > 0 && orderType === 'LIMIT') {
          console.log(`[OrderManager] Placing replacement order for unfilled ${totalUnfilledQty} at new price $${entryPrice}`)
          
          const orderParams = {
            symbol,
            side: asterSide,
            type: orderType,
            quantity: totalUnfilledQty,
            price: entryPrice,
            timeInForce: 'GTC',
            newClientOrderId: `hopium_scalp_${Date.now()}`
          }
          
          const orderResponse = await this.dexService.placeOrder(orderParams)
          console.log('[OrderManager] Replacement order placed:', orderResponse)
          
          // Track new order
          this.activeOrders.set(orderResponse.orderId, {
            orderId: orderResponse.orderId,
            symbol,
            side,
            entryPrice: entryPrice,
            quantity: totalUnfilledQty,
            status: orderResponse.status,
            takeProfit: this.settings.takeProfit,
            stopLoss: this.settings.stopLoss,
            createdAt: Date.now(),
            entryConfidence: scalpData.confidence || 'unknown'
          })
        }
        
        return // Done handling partial fill
      }
      
      // CASE 2: Fully filled (position exists, no open orders)
      if (positionAmt !== 0) {
        console.log('[OrderManager] Position fully filled, skipping new entry')
        return
      }
      
      // CASE 3: No position yet (only open orders or nothing)
      console.log('[OrderManager] No position - checking for existing orders')
      
      const orderType = this.settings.orderType || 'LIMIT'
      const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
      
      // For LIMIT orders, check if we already have an order at the same price
      if (orderType === 'LIMIT' && openOrders.length > 0) {
        const matchingOrder = openOrders.find(order => {
          const orderPrice = parseFloat(order.price || '0')
          const priceTolerance = entryPrice * 0.0001 // 0.01% tolerance for floating point
          const priceMatches = Math.abs(orderPrice - entryPrice) <= priceTolerance
          const sideMatches = order.side === asterSide
          return priceMatches && sideMatches
        })
        
        if (matchingOrder) {
          // Check if confidence degraded
          const trackedOrder = this.activeOrders.get(matchingOrder.orderId)
          const originalConfidence = trackedOrder?.entryConfidence || 'unknown'
          const newConfidence = scalpData.confidence || 'unknown'
          
          // Cancel if confidence dropped to low AND user doesn't trust low confidence
          const confidenceDegraded = (originalConfidence === 'high' || originalConfidence === 'medium') && 
                                     newConfidence === 'low'
          const trustLowConfidence = this.settings.trustLowConfidence !== undefined 
                                      ? this.settings.trustLowConfidence 
                                      : false
          
          if (confidenceDegraded && !trustLowConfidence) {
            console.log(`[OrderManager] ⚠️ Confidence degraded (${originalConfidence} → ${newConfidence}) and trust disabled - cancelling order ${matchingOrder.orderId}`)
            await this.dexService.cancelOrder(symbol, matchingOrder.orderId)
            this.activeOrders.delete(matchingOrder.orderId)
            return // Don't place new order (low confidence not trusted)
          }
          
          console.log(`[OrderManager] ✅ Existing order at same price ($${entryPrice}) - keeping order ${matchingOrder.orderId}`)
          return // Skip - no need to cancel and replace
        }
      }
      
      // Price changed or MARKET order - cancel existing orders
      if (openOrders.length > 0) {
        console.log('[OrderManager] Cancelling existing orders (price changed or market order)')
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
      }

      // Calculate position size - USE CAPITAL % AS MARGIN
      const accountBalance = await this.dexService.getAccountBalance()
      const availableBalance = parseFloat(accountBalance.availableBalance || '0')
      const positionSizePercent = this.settings.positionSize || 10
      const capitalLimit = parseFloat(this.settings.capital || '0')
      const leverage = this.settings.leverage || 1
      
      // Position size % of capital IS the margin we want to use
      const marginToUse = (capitalLimit * positionSizePercent) / 100
      
      // Actual position value = margin * leverage
      const targetPositionValue = marginToUse * leverage
      
      // Make sure we have enough balance for the margin
      const maxPositionValue = availableBalance >= marginToUse ? targetPositionValue : availableBalance * leverage

      if (entryPrice <= 0) {
        return
      }

      const quantity = maxPositionValue / entryPrice

      console.log('[OrderManager] Placing scalp order:', {
        symbol,
        side,
        asterSide,
        orderType,
        entryPrice,
        quantity,
        targetPositionValue,
        maxPositionValue,
        marginToUse,
        availableBalance,
        positionSizePercent,
        leverage,
        capitalLimit
      })

      const orderParams = {
        symbol,
        side: asterSide,
        type: orderType,
        quantity: quantity,
        newClientOrderId: `hopium_scalp_${Date.now()}`
      }

      // Only add price and timeInForce for LIMIT orders
      if (orderType === 'LIMIT') {
        orderParams.price = entryPrice
        orderParams.timeInForce = 'GTC'
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
        createdAt: Date.now(),
        entryConfidence: scalpData.confidence || 'unknown'
      })
    } catch (error) {
      console.error('[OrderManager] Failed to place scalp order:', error)
      this.handleError('Failed to place scalp order', error)
    }
  }

  /**
   * Handle momentum strategy signal from WebSocket
   * @param {Object} momentumData - Momentum indicator data from WebSocket
   */
  async handleMomentumSignal(momentumData) {
    console.log('[OrderManager] handleMomentumSignal called with:', momentumData)
    
    if (!this.isRunning || !this.dexService) {
      console.log('[OrderManager] Not running or no dexService')
      return
    }

    // Defensive guards
    if (!momentumData || !momentumData.symbol || !momentumData.side || !momentumData.limit_price) {
      console.log('[OrderManager] Missing required fields:', {
        hasData: !!momentumData,
        hasSymbol: !!momentumData?.symbol,
        hasSide: !!momentumData?.side,
        hasLimitPrice: !!momentumData?.limit_price
      })
      return
    }

    const symbol = momentumData.symbol
    const side = momentumData.side
    const entryPrice = parseFloat(momentumData.limit_price)

    // Ignore NEUTRAL or CONFLICTED
    if (side === 'NEUTRAL' || momentumData.trend_alignment === 'CONFLICTED') {
      console.log('[OrderManager] NEUTRAL/CONFLICTED signal, skipping')
      return
    }

    try {
      // Check for existing position and open orders
      const existingPosition = await this.dexService.getPosition(symbol)
      const positionAmt = parseFloat(existingPosition.positionAmt || '0')
      const openOrders = await this.dexService.getOpenOrders(symbol)
      
      // CRITICAL: Check global position limit (max 3 positions + pending orders)
      // Only check if we're trying to open a NEW position (no existing position)
      // Count BOTH active positions AND pending orders (orders become positions when filled)
      if (positionAmt === 0 && openOrders.length === 0) {
        const totalActive = this.activePositions.size + this.activeOrders.size
        if (totalActive >= 3) {
          console.log(`[OrderManager] 🚫 BLOCKED: Already have ${totalActive}/3 active (${this.activePositions.size} positions + ${this.activeOrders.size} pending orders) - cannot open ${symbol}`)
          console.log(`[OrderManager] Active positions:`, Array.from(this.activePositions.keys()))
          console.log(`[OrderManager] Pending orders:`, Array.from(this.activeOrders.values()).map(o => `${o.symbol} (${o.orderId})`))
          return
        }
      }
      
      console.log('[OrderManager] Position and orders check:', { 
        symbol, 
        positionAmt, 
        openOrdersCount: openOrders.length 
      })
      
      // CASE 1: Partially filled (position exists + open orders exist)
      if (positionAmt !== 0 && openOrders.length > 0) {
        console.log('[OrderManager] 🔄 PARTIAL FILL detected - position exists with unfilled orders')
        
        const orderType = this.settings.orderType || 'LIMIT'
        const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
        
        // Calculate unfilled quantity from open orders
        let totalUnfilledQty = 0
        for (const order of openOrders) {
          const origQty = parseFloat(order.origQty || '0')
          const executedQty = parseFloat(order.executedQty || '0')
          const unfilledQty = origQty - executedQty
          totalUnfilledQty += unfilledQty
        }
        
        console.log(`[OrderManager] Unfilled quantity: ${totalUnfilledQty}`)
        
        // Cancel all unfilled orders
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled partially filled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
        
        // Place new order for ONLY the unfilled amount at new price
        if (totalUnfilledQty > 0 && orderType === 'LIMIT') {
          console.log(`[OrderManager] Placing replacement order for unfilled ${totalUnfilledQty} at new price $${entryPrice}`)
          
          const orderParams = {
            symbol,
            side: asterSide,
            type: orderType,
            quantity: totalUnfilledQty,
            price: entryPrice,
            timeInForce: 'GTC',
            newClientOrderId: `hopium_momentum_${Date.now()}`
          }
          
          const orderResponse = await this.dexService.placeOrder(orderParams)
          console.log('[OrderManager] Replacement order placed:', orderResponse)
          
          // Track new order
          this.activeOrders.set(orderResponse.orderId, {
            orderId: orderResponse.orderId,
            symbol,
            side,
            entryPrice: entryPrice,
            quantity: totalUnfilledQty,
            status: orderResponse.status,
            takeProfit: this.settings.takeProfit,
            stopLoss: this.settings.stopLoss,
            createdAt: Date.now(),
            entryConfidence: momentumData.confidence || 'unknown'
          })
        }
        
        return // Done handling partial fill
      }
      
      // CASE 2: Fully filled (position exists, no open orders)
      if (positionAmt !== 0) {
        console.log('[OrderManager] Position fully filled, skipping new entry')
        return
      }
      
      // CASE 3: No position yet (only open orders or nothing)
      console.log('[OrderManager] No position - checking for existing orders')
      
      const orderType = this.settings.orderType || 'LIMIT'
      const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
      
      // For LIMIT orders, check if we already have an order at the same price
      if (orderType === 'LIMIT' && openOrders.length > 0) {
        const matchingOrder = openOrders.find(order => {
          const orderPrice = parseFloat(order.price || '0')
          const priceTolerance = entryPrice * 0.0001 // 0.01% tolerance for floating point
          const priceMatches = Math.abs(orderPrice - entryPrice) <= priceTolerance
          const sideMatches = order.side === asterSide
          return priceMatches && sideMatches
        })
        
        if (matchingOrder) {
          // Check if confidence degraded
          const trackedOrder = this.activeOrders.get(matchingOrder.orderId)
          const originalConfidence = trackedOrder?.entryConfidence || 'unknown'
          const newConfidence = momentumData.confidence || 'unknown'
          
          // Cancel if confidence dropped to low AND user doesn't trust low confidence
          const confidenceDegraded = (originalConfidence === 'high' || originalConfidence === 'medium') && 
                                     newConfidence === 'low'
          const trustLowConfidence = this.settings.trustLowConfidence !== undefined 
                                      ? this.settings.trustLowConfidence 
                                      : false
          
          if (confidenceDegraded && !trustLowConfidence) {
            console.log(`[OrderManager] ⚠️ Confidence degraded (${originalConfidence} → ${newConfidence}) and trust disabled - cancelling order ${matchingOrder.orderId}`)
            await this.dexService.cancelOrder(symbol, matchingOrder.orderId)
            this.activeOrders.delete(matchingOrder.orderId)
            return // Don't place new order (low confidence not trusted)
          }
          
          console.log(`[OrderManager] ✅ Existing order at same price ($${entryPrice}) - keeping order ${matchingOrder.orderId}`)
          return // Skip - no need to cancel and replace
        }
      }
      
      // Price changed or MARKET order - cancel existing orders
      if (openOrders.length > 0) {
        console.log('[OrderManager] Cancelling existing orders (price changed or market order)')
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
      }

      // Calculate position size - USE CAPITAL % AS MARGIN
      const accountBalance = await this.dexService.getAccountBalance()
      const availableBalance = parseFloat(accountBalance.availableBalance || '0')
      const positionSizePercent = this.settings.positionSize || 10
      const capitalLimit = parseFloat(this.settings.capital || '0')
      const leverage = this.settings.leverage || 1
      
      // Position size % of capital IS the margin we want to use
      const marginToUse = (capitalLimit * positionSizePercent) / 100
      
      // Actual position value = margin * leverage
      const targetPositionValue = marginToUse * leverage
      
      // Make sure we have enough balance for the margin
      const maxPositionValue = availableBalance >= marginToUse ? targetPositionValue : availableBalance * leverage

      if (entryPrice <= 0) {
        return
      }

      const quantity = maxPositionValue / entryPrice

      console.log('[OrderManager] Placing momentum order:', {
        symbol,
        side,
        asterSide,
        orderType,
        entryPrice,
        quantity,
        targetPositionValue,
        maxPositionValue,
        marginToUse,
        availableBalance,
        positionSizePercent,
        leverage,
        capitalLimit,
        trend_1h: momentumData.trend_1h,
        trend_4h: momentumData.trend_4h,
        trend_alignment: momentumData.trend_alignment,
        confluence_score: momentumData.confluence_score
      })

      const orderParams = {
        symbol,
        side: asterSide,
        type: orderType,
        quantity: quantity,
        newClientOrderId: `hopium_momentum_${Date.now()}`
      }

      // Only add price and timeInForce for LIMIT orders
      if (orderType === 'LIMIT') {
        orderParams.price = entryPrice
        orderParams.timeInForce = 'GTC'
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
        createdAt: Date.now(),
        entryConfidence: momentumData.confidence || 'unknown'
      })
    } catch (error) {
      console.error('[OrderManager] Failed to place momentum order:', error)
      this.handleError('Failed to place momentum order', error)
    }
  }

  /**
   * Handle Momentum X (Psychic Candle Reader) strategy signals
   * Ultra-responsive whipsaw scalper using leading indicators
   */
  async handleMomentumXSignal(momentumXData) {
    console.log('[OrderManager] handleMomentumXSignal called with:', momentumXData)
    
    if (!this.isRunning || !this.dexService) {
      console.log('[OrderManager] Not running or no dexService')
      return
    }

    // Defensive guards
    if (!momentumXData || !momentumXData.symbol || !momentumXData.side || !momentumXData.limit_price) {
      console.log('[OrderManager] Missing required fields:', {
        hasData: !!momentumXData,
        hasSymbol: !!momentumXData?.symbol,
        hasSide: !!momentumXData?.side,
        hasLimitPrice: !!momentumXData?.limit_price
      })
      return
    }

    const symbol = momentumXData.symbol
    const side = momentumXData.side
    const entryPrice = parseFloat(momentumXData.limit_price)

    // Ignore NEUTRAL or FLAT regime
    if (side === 'NEUTRAL' || momentumXData.market_regime === 'FLAT') {
      console.log('[OrderManager] NEUTRAL/FLAT regime signal, skipping')
      return
    }

    try {
      // Check for existing position and open orders
      const existingPosition = await this.dexService.getPosition(symbol)
      const positionAmt = parseFloat(existingPosition.positionAmt || '0')
      const openOrders = await this.dexService.getOpenOrders(symbol)
      
      // CRITICAL: Check global position limit (max 3 positions + pending orders)
      // Only check if we're trying to open a NEW position (no existing position)
      // Count BOTH active positions AND pending orders (orders become positions when filled)
      if (positionAmt === 0 && openOrders.length === 0) {
        const totalActive = this.activePositions.size + this.activeOrders.size
        if (totalActive >= 3) {
          console.log(`[OrderManager] 🚫 BLOCKED: Already have ${totalActive}/3 active (${this.activePositions.size} positions + ${this.activeOrders.size} pending orders) - cannot open ${symbol}`)
          console.log(`[OrderManager] Active positions:`, Array.from(this.activePositions.keys()))
          console.log(`[OrderManager] Pending orders:`, Array.from(this.activeOrders.values()).map(o => `${o.symbol} (${o.orderId})`))
          return
        }
      }
      
      console.log('[OrderManager] Position and orders check:', { 
        symbol, 
        positionAmt, 
        openOrdersCount: openOrders.length 
      })
      
      // CASE 1: Partially filled (position exists + open orders exist)
      if (positionAmt !== 0 && openOrders.length > 0) {
        console.log('[OrderManager] 🔄 PARTIAL FILL detected - position exists with unfilled orders')
        
        const orderType = this.settings.orderType || 'LIMIT'
        const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
        
        // Calculate unfilled quantity from open orders
        let totalUnfilledQty = 0
        for (const order of openOrders) {
          const origQty = parseFloat(order.origQty || '0')
          const executedQty = parseFloat(order.executedQty || '0')
          const unfilledQty = origQty - executedQty
          totalUnfilledQty += unfilledQty
        }
        
        console.log(`[OrderManager] Unfilled quantity: ${totalUnfilledQty}`)
        
        // Cancel all unfilled orders
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled partially filled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
        
        // Place new order for ONLY the unfilled amount at new price
        if (totalUnfilledQty > 0 && orderType === 'LIMIT') {
          console.log(`[OrderManager] Placing replacement order for unfilled ${totalUnfilledQty} at new price $${entryPrice}`)
          
          const orderParams = {
            symbol,
            side: asterSide,
            type: orderType,
            quantity: totalUnfilledQty,
            price: entryPrice,
            timeInForce: 'GTC',
            newClientOrderId: `hopium_momentumx_${Date.now()}`
          }
          
          const orderResponse = await this.dexService.placeOrder(orderParams)
          console.log('[OrderManager] Replacement order placed:', orderResponse)
          
          // Track new order
          this.activeOrders.set(orderResponse.orderId, {
            orderId: orderResponse.orderId,
            symbol,
            side,
            entryPrice: entryPrice,
            quantity: totalUnfilledQty,
            status: orderResponse.status,
            takeProfit: this.settings.takeProfit,
            stopLoss: this.settings.stopLoss,
            createdAt: Date.now(),
            entryConfidence: momentumXData.confidence || 'unknown'
          })
        }
        
        return // Done handling partial fill
      }
      
      // CASE 2: Fully filled (position exists, no open orders)
      if (positionAmt !== 0) {
        console.log('[OrderManager] Position fully filled, skipping new entry')
        return
      }
      
      // CASE 3: No position yet (only open orders or nothing)
      console.log('[OrderManager] No position - checking for existing orders')
      
      const orderType = this.settings.orderType || 'LIMIT'
      const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
      
      // For LIMIT orders, check if we already have an order at the same price
      if (orderType === 'LIMIT' && openOrders.length > 0) {
        const matchingOrder = openOrders.find(order => {
          const orderPrice = parseFloat(order.price || '0')
          const priceTolerance = entryPrice * 0.0001 // 0.01% tolerance for floating point
          const priceMatches = Math.abs(orderPrice - entryPrice) <= priceTolerance
          const sideMatches = order.side === asterSide
          return priceMatches && sideMatches
        })
        
        if (matchingOrder) {
          // Check if confidence degraded
          const trackedOrder = this.activeOrders.get(matchingOrder.orderId)
          const originalConfidence = trackedOrder?.entryConfidence || 'unknown'
          const newConfidence = momentumXData.confidence || 'unknown'
          
          // Cancel if confidence dropped to low AND user doesn't trust low confidence
          const confidenceDegraded = (originalConfidence === 'high' || originalConfidence === 'medium') && 
                                     newConfidence === 'low'
          const trustLowConfidence = this.settings.trustLowConfidence !== undefined 
                                      ? this.settings.trustLowConfidence 
                                      : false
          
          if (confidenceDegraded && !trustLowConfidence) {
            console.log(`[OrderManager] ⚠️ Confidence degraded (${originalConfidence} → ${newConfidence}) and trust disabled - cancelling order ${matchingOrder.orderId}`)
            await this.dexService.cancelOrder(symbol, matchingOrder.orderId)
            this.activeOrders.delete(matchingOrder.orderId)
            return // Don't place new order (low confidence not trusted)
          }
          
          console.log(`[OrderManager] ✅ Existing order at same price ($${entryPrice}) - keeping order ${matchingOrder.orderId}`)
          return // Skip - no need to cancel and replace
        }
      }
      
      // Price changed or MARKET order - cancel existing orders
      if (openOrders.length > 0) {
        console.log('[OrderManager] Cancelling existing orders (price changed or market order)')
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
      }

      // Calculate position size - USE CAPITAL % AS MARGIN
      const accountBalance = await this.dexService.getAccountBalance()
      const availableBalance = parseFloat(accountBalance.availableBalance || '0')
      const positionSizePercent = this.settings.positionSize || 10
      const capitalLimit = parseFloat(this.settings.capital || '0')
      const leverage = this.settings.leverage || 1
      
      // Position size % of capital IS the margin we want to use
      const marginToUse = (capitalLimit * positionSizePercent) / 100
      
      // Actual position value = margin * leverage
      const targetPositionValue = marginToUse * leverage
      
      // Make sure we have enough balance for the margin
      const maxPositionValue = availableBalance >= marginToUse ? targetPositionValue : availableBalance * leverage

      if (entryPrice <= 0) {
        return
      }

      const quantity = maxPositionValue / entryPrice

      console.log('[OrderManager] Placing momentum X order:', {
        symbol,
        side,
        asterSide,
        orderType,
        entryPrice,
        quantity,
        targetPositionValue,
        maxPositionValue,
        marginToUse,
        availableBalance,
        positionSizePercent,
        leverage,
        capitalLimit,
        market_regime: momentumXData.market_regime,
        layer_score: momentumXData.layer_score,
        delta_trend: momentumXData.delta_trend,
        orderbook_pressure: momentumXData.orderbook_pressure,
        atr: momentumXData.atr,
        in_fvg_zone: momentumXData.in_fvg_zone
      })

      const orderParams = {
        symbol,
        side: asterSide,
        type: orderType,
        quantity: quantity,
        newClientOrderId: `hopium_momentumx_${Date.now()}`
      }

      // Only add price and timeInForce for LIMIT orders
      if (orderType === 'LIMIT') {
        orderParams.price = entryPrice
        orderParams.timeInForce = 'GTC'
      }

      console.log('[OrderManager] Order params:', orderParams)
      const orderResponse = await this.dexService.placeOrder(orderParams)
      console.log('[OrderManager] Momentum X order placed successfully:', orderResponse)

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
        createdAt: Date.now(),
        entryConfidence: momentumXData.confidence || 'unknown'
      })
    } catch (error) {
      console.error('[OrderManager] Failed to place momentum X order:', error)
      this.handleError('Failed to place momentum X order', error)
    }
  }

  /**
   * Handle Order Book Trading signal (Near Real-Time Order Flow)
   * Uses CVD, OBI, VWAP deviation, and spoof detection
   * @param {Object} orderBookData - Order book signal data
   */
  async handleOrderBookSignal(orderBookData) {
    console.log('[OrderManager] handleOrderBookSignal called with:', orderBookData)
    
    if (!this.isRunning || !this.dexService) {
      console.log('[OrderManager] Not running or no dexService')
      return
    }

    // Defensive guards
    if (!orderBookData || !orderBookData.symbol || !orderBookData.side || !orderBookData.entry) {
      console.log('[OrderManager] Missing required fields:', {
        hasData: !!orderBookData,
        hasSymbol: !!orderBookData?.symbol,
        hasSide: !!orderBookData?.side,
        hasEntry: !!orderBookData?.entry
      })
      return
    }

    const symbol = orderBookData.symbol
    const side = orderBookData.side
    const entry = orderBookData.entry
    
    // Use low end of trigger zone for entry (more conservative)
    const triggerZone = entry.trigger_zone || []
    const entryPrice = triggerZone.length >= 2 ? parseFloat(triggerZone[0]) : 0

    // Ignore NEUTRAL signals
    if (side === 'NEUTRAL') {
      console.log('[OrderManager] NEUTRAL signal, skipping')
      return
    }

    try {
      // Check for existing position and open orders
      const existingPosition = await this.dexService.getPosition(symbol)
      const positionAmt = parseFloat(existingPosition.positionAmt || '0')
      const openOrders = await this.dexService.getOpenOrders(symbol)
      
      // CRITICAL: Check global position limit (max 3 positions + pending orders)
      // Only check if we're trying to open a NEW position (no existing position)
      // Count BOTH active positions AND pending orders (orders become positions when filled)
      if (positionAmt === 0 && openOrders.length === 0) {
        const totalActive = this.activePositions.size + this.activeOrders.size
        if (totalActive >= 3) {
          console.log(`[OrderManager] 🚫 BLOCKED: Already have ${totalActive}/3 active (${this.activePositions.size} positions + ${this.activeOrders.size} pending orders) - cannot open ${symbol}`)
          console.log(`[OrderManager] Active positions:`, Array.from(this.activePositions.keys()))
          console.log(`[OrderManager] Pending orders:`, Array.from(this.activeOrders.values()).map(o => `${o.symbol} (${o.orderId})`))
          return
        }
      }
      
      console.log('[OrderManager] Position and orders check:', { 
        symbol, 
        positionAmt, 
        openOrdersCount: openOrders.length 
      })
      
      // CASE 1: Partially filled (position exists + open orders exist)
      if (positionAmt !== 0 && openOrders.length > 0) {
        console.log('[OrderManager] 🔄 PARTIAL FILL detected - position exists with unfilled orders')
        
        const orderType = this.settings.orderType || 'LIMIT'
        const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
        
        // Calculate unfilled quantity from open orders
        let totalUnfilledQty = 0
        for (const order of openOrders) {
          const origQty = parseFloat(order.origQty || '0')
          const executedQty = parseFloat(order.executedQty || '0')
          const unfilledQty = origQty - executedQty
          totalUnfilledQty += unfilledQty
        }
        
        console.log(`[OrderManager] Unfilled quantity: ${totalUnfilledQty}`)
        
        // Cancel all unfilled orders
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled partially filled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
        
        // Place new order for ONLY the unfilled amount at new price
        if (totalUnfilledQty > 0 && orderType === 'LIMIT') {
          console.log(`[OrderManager] Placing replacement order for unfilled ${totalUnfilledQty} at new price $${entryPrice}`)
          
          const orderParams = {
            symbol,
            side: asterSide,
            type: orderType,
            quantity: totalUnfilledQty,
            price: entryPrice,
            timeInForce: 'GTC',
            newClientOrderId: `hopium_orderbook_${Date.now()}`
          }
          
          const orderResponse = await this.dexService.placeOrder(orderParams)
          console.log('[OrderManager] Replacement order placed:', orderResponse)
          
          // Track new order
          this.activeOrders.set(orderResponse.orderId, {
            orderId: orderResponse.orderId,
            symbol,
            side,
            entryPrice: entryPrice,
            quantity: totalUnfilledQty,
            status: orderResponse.status,
            takeProfit: this.settings.takeProfit,
            stopLoss: this.settings.stopLoss,
            createdAt: Date.now(),
            entryConfidence: orderBookData.confidence || 'unknown'
          })
        }
        
        return // Done handling partial fill
      }
      
      // CASE 2: Fully filled (position exists, no open orders)
      if (positionAmt !== 0) {
        console.log('[OrderManager] Position fully filled, skipping new entry')
        return
      }
      
      // CASE 3: No position yet (only open orders or nothing)
      console.log('[OrderManager] No position - checking for existing orders')
      
      const orderType = this.settings.orderType || 'LIMIT'
      const asterSide = side === 'LONG' ? 'BUY' : 'SELL'
      
      // For LIMIT orders, check if we already have an order at the same price
      if (orderType === 'LIMIT' && openOrders.length > 0) {
        const matchingOrder = openOrders.find(order => {
          const orderPrice = parseFloat(order.price || '0')
          const priceTolerance = entryPrice * 0.0001 // 0.01% tolerance for floating point
          const priceMatches = Math.abs(orderPrice - entryPrice) <= priceTolerance
          const sideMatches = order.side === asterSide
          return priceMatches && sideMatches
        })
        
        if (matchingOrder) {
          // Check if confidence degraded
          const trackedOrder = this.activeOrders.get(matchingOrder.orderId)
          const originalConfidence = trackedOrder?.entryConfidence || 'unknown'
          const newConfidence = orderBookData.confidence || 'unknown'
          
          // Cancel if confidence dropped to low AND user doesn't trust low confidence
          const confidenceDegraded = (originalConfidence === 'high' || originalConfidence === 'medium') && 
                                     newConfidence === 'low'
          const trustLowConfidence = this.settings.trustLowConfidence !== undefined 
                                      ? this.settings.trustLowConfidence 
                                      : false
          
          if (confidenceDegraded && !trustLowConfidence) {
            console.log(`[OrderManager] ⚠️ Confidence degraded (${originalConfidence} → ${newConfidence}) and trust disabled - cancelling order ${matchingOrder.orderId}`)
            await this.dexService.cancelOrder(symbol, matchingOrder.orderId)
            this.activeOrders.delete(matchingOrder.orderId)
            return // Don't place new order (low confidence not trusted)
          }
          
          console.log(`[OrderManager] ✅ Existing order at same price ($${entryPrice}) - keeping order ${matchingOrder.orderId}`)
          return // Skip - no need to cancel and replace
        }
      }
      
      // Price changed or MARKET order - cancel existing orders
      if (openOrders.length > 0) {
        console.log('[OrderManager] Cancelling existing orders (price changed or market order)')
        for (const order of openOrders) {
          try {
            await this.dexService.cancelOrder(symbol, order.orderId)
            this.activeOrders.delete(order.orderId)
            console.log(`[OrderManager] Cancelled order ${order.orderId}`)
          } catch (error) {
            console.error(`[OrderManager] Failed to cancel order ${order.orderId}:`, error)
          }
        }
      }

      const accountBalance = await this.dexService.getAccountBalance()
      const availableBalance = parseFloat(accountBalance.availableBalance || '0')
      const capitalLimit = parseFloat(this.settings.capital || '0')
      const configuredLeverage = this.settings.leverage || 1
      
      // Debug logging for capital settings
      console.log(`[OrderManager] Capital Settings Debug:`, {
        rawCapital: this.settings.capital,
        capitalLimit: capitalLimit,
        positionSize: this.settings.positionSize,
        autoMode: this.settings.autoMode
      })
      
      let marginToUse
      if (this.settings.autoMode) {
        marginToUse = capitalLimit / 3
        console.log(`[OrderManager] 🤖 Auto Mode: Using capital/3 = $${marginToUse.toFixed(2)} margin`)
      } else {
        const positionSizePercent = this.settings.positionSize || 10
        marginToUse = (capitalLimit * positionSizePercent) / 100
        console.log(`[OrderManager] Manual Mode: Using ${positionSizePercent}% of capital = $${marginToUse.toFixed(2)} margin`)
      }
      
      const maxAllowedMargin = this.settings.autoMode ? (capitalLimit / 3) : capitalLimit
      if (marginToUse > maxAllowedMargin * 1.01) {
        throw new Error(`🚨 SAFETY: Trying to use $${marginToUse.toFixed(2)} margin but max is $${maxAllowedMargin.toFixed(2)}`)
      }

      // Align exchange leverage with sizing to avoid margin mismatch
      let leverageToUse = configuredLeverage
      try {
        // Use proposed notional with configured leverage to determine bracket-based cap
        const proposedNotional = marginToUse * configuredLeverage
        const maxLevForBracket = await this.dexService.getMaxLeverageForNotional(symbol, proposedNotional)
        leverageToUse = Math.min(configuredLeverage, maxLevForBracket || configuredLeverage)
      } catch (e) {
        console.warn('[OrderManager] Failed to fetch max leverage bracket, using configured leverage:', configuredLeverage)
      }

      try {
        await this.dexService.setLeverage(symbol, leverageToUse)
      } catch (e) {
        console.warn('[OrderManager] Failed to set leverage, falling back to configured leverage:', configuredLeverage, e?.message || e)
        leverageToUse = configuredLeverage
      }

      const targetPositionValue = marginToUse * leverageToUse
      const maxPositionValue = availableBalance >= marginToUse ? targetPositionValue : availableBalance * leverageToUse

      if (entryPrice <= 0) {
        console.error('[OrderManager] Invalid entry price:', entryPrice)
        return
      }

      const quantity = maxPositionValue / entryPrice

      console.log('[OrderManager] Placing order book trading order:', {
        symbol,
        side,
        asterSide,
        orderType,
        entryPrice,
        triggerZone,
        quantity,
        targetPositionValue,
        maxPositionValue,
        marginToUse,
        availableBalance,
        leverage: leverageToUse,
        capitalLimit,
        autoMode: this.settings.autoMode,
        bias_score: orderBookData.bias_score,
        cvd_slope: orderBookData.cvd_slope,
        obi: orderBookData.obi,
        spoof_velocity: orderBookData.spoof_detection?.wall_velocity
      })

      const orderParams = {
        symbol,
        side: asterSide,
        type: orderType,
        quantity: quantity,
        newClientOrderId: `hopium_orderbook_${Date.now()}`
      }

      // Only add price and timeInForce for LIMIT orders
      if (orderType === 'LIMIT') {
        orderParams.price = entryPrice
        orderParams.timeInForce = 'GTC'
      }

      console.log('[OrderManager] Order params:', orderParams)
      const orderResponse = await this.dexService.placeOrder(orderParams)
      console.log('[OrderManager] Order book trading order placed successfully:', orderResponse)

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
        createdAt: Date.now(),
        entryConfidence: orderBookData.confidence || 'unknown'
      })
    } catch (error) {
      console.error('[OrderManager] Failed to place order book trading order:', error)
      this.handleError('Failed to place order book trading order', error)
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
      const now = Date.now()
      
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
          // Check if order has timed out (unfilled for too long)
          else if (order.status === 'NEW') {
            const ageSeconds = Math.floor((now - trackedOrder.createdAt) / 1000)
            const timeoutSeconds = Math.floor(this.orderTimeout / 1000)
            
            if ((now - trackedOrder.createdAt) > this.orderTimeout) {
              console.log(`[OrderManager] ⏱️ Order ${orderId} TIMED OUT: ${ageSeconds}s elapsed (timeout: ${timeoutSeconds}s) - cancelling`)
              try {
                await this.dexService.cancelOrder(trackedOrder.symbol, orderId)
                this.activeOrders.delete(orderId)
                console.log(`[OrderManager] ✅ Order ${orderId} cancelled successfully`)
              } catch (error) {
                console.error(`[OrderManager] ❌ Failed to cancel order ${orderId}:`, error)
              }
            } else {
              // Log occasionally to show it's being monitored
              if (ageSeconds % 10 === 0 && ageSeconds > 0) {
                console.log(`[OrderManager] ⏳ Order ${orderId} waiting: ${ageSeconds}s / ${timeoutSeconds}s`)
              }
            }
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

    // Add to active positions with Smart Mode tracking
    const positionData = {
      symbol: order.symbol,
      side: order.side,
      entryPrice: parseFloat(order.entryPrice),
      quantity: parseFloat(order.quantity),
      takeProfit: order.takeProfit,
      stopLoss: order.stopLoss,
      filledAt: Date.now(),
      entryConfidence: order.entryConfidence || 'unknown',
      signalHistory: [] // Track incoming signals for Smart Mode
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
      const positionAmtRaw = currentPosition.positionAmt || '0'
      const positionAmt = parseFloat(positionAmtRaw)

      if (positionAmt === 0) {
        // Already closed
        this.activePositions.delete(symbol)
        return
      }

      // Determine opposite side
      const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY'
      
      // Use absolute value of the RAW string to preserve exact precision
      const quantityStr = positionAmt < 0 ? positionAmtRaw.substring(1) : positionAmtRaw

      console.log(`[OrderManager] Closing position ${symbol} (${reason}):`, {
        rawPositionAmt: positionAmtRaw,
        quantityToClose: quantityStr,
        side: closeSide
      })

      // Place MARKET order to close - use rawQuantity flag to skip formatting
      // The positionAmt from API is already formatted correctly
      const orderParams = {
        symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: quantityStr,
        reduceOnly: true,
        rawQuantity: true // Skip formatting - use exact positionAmt
      }

      const result = await this.dexService.placeOrder(orderParams)
      console.log(`[OrderManager] Close order placed:`, result)

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

  /**
   * Add signal to position history (Smart Mode)
   * @param {string} symbol - Trading symbol
   * @param {Object} signal - Signal data with confidence, side, timestamp
   */
  addSignalToHistory(symbol, signal) {
    const position = this.activePositions.get(symbol)
    if (!position) return

    // Add signal to history
    position.signalHistory.push({
      confidence: signal.confidence,
      side: signal.side,
      timestamp: Date.now()
    })

    // Keep only last 5 signals
    if (position.signalHistory.length > 5) {
      position.signalHistory.shift()
    }
  }

  /**
   * Get net PNL percentage after fees for a position (Smart Mode)
   * @param {string} symbol - Trading symbol
   * @returns {Promise<number>} Net PNL percentage after fees
   */
  async getNetPNLPercentage(symbol) {
    if (!this.dexService) return 0

    try {
      const position = this.activePositions.get(symbol)
      if (!position) return 0

      const currentPosition = await this.dexService.getPosition(symbol)
      const unrealizedProfit = parseFloat(currentPosition.unRealizedProfit || '0')
      const entryPrice = parseFloat(currentPosition.entryPrice || '0')
      const positionAmt = Math.abs(parseFloat(currentPosition.positionAmt || '0'))
      const markPrice = parseFloat(currentPosition.markPrice || '0')

      if (positionAmt === 0 || entryPrice === 0) return 0

      // Calculate fees
      const entryNotional = positionAmt * entryPrice
      const exitNotional = positionAmt * markPrice
      const entryFee = entryNotional * ENTRY_FEE
      const exitFee = exitNotional * EXIT_FEE
      const totalFees = entryFee + exitFee

      // Net PNL = Unrealized PNL - Fees
      const netPnl = unrealizedProfit - totalFees

      // PNL as percentage of entry value
      const pnlPercentage = (netPnl / entryNotional) * 100

      return pnlPercentage
    } catch (error) {
      console.error('[OrderManager] Error calculating net PNL:', error)
      return 0
    }
  }

  /**
   * Check if position should exit based on Smart Mode rules
   * @param {string} symbol - Trading symbol
   * @param {Object} signal - Current signal with confidence and side
   * @returns {Promise<Object>} { shouldExit: boolean, reason: string }
   */
  async checkSmartModeExit(symbol, signal) {
    const position = this.activePositions.get(symbol)
    if (!position) {
      return { shouldExit: false, reason: null }
    }

    // Condition A: Signal Reversal (Highest Priority)
    if (
      (position.side === 'LONG' && signal.side === 'SHORT') ||
      (position.side === 'SHORT' && signal.side === 'LONG')
    ) {
      return { 
        shouldExit: true, 
        reason: 'reversal',
        details: `Position ${position.side} but signal is ${signal.side}`
      }
    }

    // Only check low confidence conditions if signal is low
    if (signal.confidence === 'low') {
      // Condition B: Low Confidence + 50% to Stop Loss
      const netPnlPercent = await this.getNetPNLPercentage(symbol)
      const stopLossThreshold = -Math.abs(position.stopLoss || 0.1) // Negative value
      
      if (stopLossThreshold !== 0) {
        const distanceRatio = netPnlPercent / stopLossThreshold
        
        console.log('[OrderManager] Smart Mode Check:', {
          symbol,
          netPnlPercent: netPnlPercent.toFixed(4),
          stopLossThreshold: stopLossThreshold.toFixed(4),
          distanceRatio: distanceRatio.toFixed(2),
          confidence: signal.confidence
        })

        if (distanceRatio > 0.5) {
          return { 
            shouldExit: true, 
            reason: 'low_confidence_threshold',
            details: `${(distanceRatio * 100).toFixed(0)}% to SL with low confidence`
          }
        }
      }

      // Condition C: 2 Consecutive Low Confidence Signals
      const recentSignals = position.signalHistory.slice(-2)
      if (recentSignals.length >= 2 && 
          recentSignals.every(s => s.confidence === 'low')) {
        return { 
          shouldExit: true, 
          reason: 'consecutive_low_confidence',
          details: '2 consecutive low confidence signals'
        }
      }
    }

    return { shouldExit: false, reason: null }
  }

  /**
   * Close position for Smart Mode (with specific logging)
   * @param {string} symbol - Trading symbol
   * @param {string} reason - Reason for Smart Mode exit
   */
  async closePositionSmartMode(symbol, reason) {
    const position = this.activePositions.get(symbol)
    if (!position) return

    console.log(`[OrderManager] 🧠 Smart Mode Exit: ${symbol} - ${reason}`)
    await this.closePosition(symbol, position, `Smart Mode: ${reason}`)
  }
}

export default OrderManager

