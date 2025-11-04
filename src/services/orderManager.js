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
const ORDER_TIMEOUT = 120000 // 2 minutes - cancel unfilled orders after this time

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
   */
  async initialize(settings) {
    this.settings = {
      ...settings,
      orderType: settings.orderType || 'LIMIT' // Default to LIMIT for safety
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
      const asterSide = side === 'LONG' ? 'BUY' : 'SELL'

      const orderType = this.settings.orderType || 'LIMIT'

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
          else if (order.status === 'NEW' && (now - trackedOrder.createdAt) > ORDER_TIMEOUT) {
            console.log(`[OrderManager] Order ${orderId} timed out after ${Math.floor((now - trackedOrder.createdAt) / 1000)}s - cancelling`)
            try {
              await this.dexService.cancelOrder(trackedOrder.symbol, orderId)
              this.activeOrders.delete(orderId)
              console.log(`[OrderManager] Order ${orderId} cancelled successfully`)
            } catch (error) {
              console.error(`[OrderManager] Failed to cancel order ${orderId}:`, error)
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

