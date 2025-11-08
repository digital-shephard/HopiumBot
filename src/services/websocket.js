/**
 * HopiumCore WebSocket Client
 * 
 * Provides a typed interface for connecting to and interacting with
 * the HopiumCore WebSocket API. Currently configured with data structures
 * only - connections will be implemented later.
 * 
 * @example
 * ```javascript
 * import { HopiumWebSocketClient } from './services/websocket'
 * 
 * const client = new HopiumWebSocketClient()
 * 
 * client.onSummary = (data) => {
 *   console.log('New summary:', data.summary)
 * }
 * 
 * client.onAlert = (data) => {
 *   console.warn('Alert:', data.change_type, data.description)
 * }
 * ```
 */

import { WEBSOCKET_CONFIG } from '../config/websocket'

/**
 * HopiumWebSocketClient - WebSocket client for HopiumCore API
 * 
 * Note: Connection functionality is staged but not yet implemented.
 * Currently provides data structures and interfaces for future use.
 */
export class HopiumWebSocketClient {
  /** WebSocket connection instance (null until connected) */
  ws = null

  /** Set of currently subscribed symbols */
  subscriptions = new Set()

  /** Message ID counter for correlating requests/responses */
  messageId = 0

  /** WebSocket URL (from config) */
  url = WEBSOCKET_CONFIG.URL

  /** Reconnection state */
  reconnectAttempts = 0
  maxReconnectAttempts = Infinity // Infinite reconnect attempts
  reconnectInterval = 5000 // 5 seconds
  reconnectTimeout = null
  authToken = null // Store token for reconnection
  lastStrategy = null // Store last subscribed strategy
  lastSymbol = null // Store last subscribed symbol
  shouldReconnect = true // Flag to control reconnection

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Called when a summary message is received
   * @type {Function}
   * @param {Object} data - Summary message data
   * @param {Object} data.summary - LLM summary object
   * @param {string} data.timestamp - ISO 8601 timestamp
   * @param {string} data.symbol - Trading pair symbol
   * @param {string} [data.previous_side] - Previous side if sentiment changed
   */
  onSummary = null

  /**
   * Called when a scalp indicator message is received
   * @type {Function}
   * @param {Object} data - Scalp indicator data
   * @param {string} data.symbol - Trading pair symbol
   * @param {number} data.current_price - Current market price
   * @param {number} data.ema_1min - 1-minute EMA
   * @param {string} data.side - Trading direction ('LONG', 'SHORT', 'NEUTRAL')
   * @param {number} data.limit_price - Recommended limit order price
   * @param {number} data.tp_price - Take profit price
   * @param {number} data.sl_price - Stop loss price
   * @param {string} data.confidence - Confidence level ('high', 'medium', 'low')
   * @param {string} data.reasoning - Strategy reasoning
   */
  onScalpIndicator = null

  /**
   * Called when a momentum indicator message is received
   * @type {Function}
   * @param {Object} data - Momentum indicator data
   * @param {string} data.symbol - Trading pair symbol
   * @param {number} data.current_price - Current market price
   * @param {string} data.trend_1h - 1-hour trend ('UP', 'DOWN', 'NEUTRAL')
   * @param {string} data.trend_4h - 4-hour trend ('UP', 'DOWN', 'NEUTRAL')
   * @param {string} data.trend_alignment - Trend alignment ('ALIGNED', 'CONFLICTED', 'NEUTRAL')
   * @param {string} data.side - Trading direction ('LONG', 'SHORT', 'NEUTRAL')
   * @param {number} data.limit_price - Recommended limit order price
   * @param {number} data.tp_price - Take profit price
   * @param {number} data.sl_price - Stop loss price
   * @param {string} data.confidence - Confidence level ('high', 'medium', 'low')
   * @param {number} data.confluence_score - Confluence score (0-7)
   * @param {string} data.reasoning - Strategy reasoning
   */
  onMomentumIndicator = null

  /**
   * Called when a momentum X indicator message is received (Psychic Candle Reader)
   * @type {Function}
   * @param {Object} data - Momentum X indicator data
   * @param {string} data.symbol - Trading pair symbol
   * @param {number} data.current_price - Current market price
   * @param {number} data.atr - Average True Range
   * @param {string} data.market_regime - Market regime ('FLAT', 'WHIPSAW', 'TRENDING')
   * @param {number[]} data.delta_stack - Array of recent candle deltas
   * @param {string} data.delta_trend - Delta trend ('BULLISH', 'BEARISH', 'NEUTRAL')
   * @param {number} data.delta_acceleration - Momentum acceleration
   * @param {number} data.bid_ask_ratio - Orderbook pressure ratio
   * @param {string} data.orderbook_pressure - Orderbook pressure ('BUY_HEAVY', 'SELL_HEAVY', 'BALANCED')
   * @param {number} data.stacked_candles - Consecutive green/red candles
   * @param {number} data.volume_acceleration - Volume spike factor
   * @param {Object|null} data.nearest_fvg - Fair Value Gap data
   * @param {boolean} data.in_fvg_zone - Whether price is in FVG zone
   * @param {string} data.side - Trading direction ('LONG', 'SHORT', 'NEUTRAL')
   * @param {number} data.limit_price - Recommended limit order price
   * @param {number} data.tp_price - Take profit price
   * @param {number} data.sl_price - Stop loss price
   * @param {string} data.confidence - Confidence level ('high', 'medium', 'low')
   * @param {number} data.layer_score - Confluence score (0-8 layers)
   * @param {string} data.reasoning - Strategy reasoning
   */
  onMomentumX = null

  /**
   * Called when an order book signal message is received
   * @type {Function}
   * @param {Object} data - Order book signal data
   * @param {string} data.symbol - Trading pair symbol
   * @param {string} data.side - Trading direction ('LONG', 'SHORT', 'NEUTRAL')
   * @param {number} data.bias_score - Composite bias score (-1 to +1)
   * @param {string} data.confidence - Confidence level ('high', 'medium', 'low')
   * @param {number} data.cvd - Cumulative Volume Delta
   * @param {string} data.cvd_slope - CVD slope with sigma notation
   * @param {number} data.obi - Order Book Imbalance (-1 to +1)
   * @param {number} data.vwap_dev - VWAP deviation percentage
   * @param {Object} data.spoof_detection - Spoof detection data
   * @param {string[]} data.reasoning - Array of reasoning strings
   * @param {Object} data.entry - Entry recommendation with trigger_zone, stop_loss, take_profit
   */
  onOrderBookSignal = null

  /**
   * Called when portfolio picks are received (Auto Mode - Portfolio Scanner)
   * @type {Function}
   * @param {Object} data - Portfolio picks data
   * @param {string} data.timestamp - ISO 8601 timestamp
   * @param {number} data.update_interval - Update interval in seconds (30)
   * @param {Array} data.picks - Array of top 3 trading opportunities
   * @param {string[]} data.dropped - Symbols that left top 3
   * @param {number} data.monitoring - Total symbols being monitored
   */
  onPortfolioPicks = null

  /**
   * Called when an alert message is received
   * @type {Function}
   * @param {Object} data - Alert message data
   * @param {string} data.change_type - Type of change detected
   * @param {string} data.description - Human-readable description
   * @param {string} data.timestamp - ISO 8601 timestamp
   */
  onAlert = null

  /**
   * Called when an error message is received
   * @type {Function}
   * @param {Object} error - Error message object
   * @param {string} error.type - Always 'error'
   * @param {number} [error.id] - Request ID if applicable
   * @param {Object} error.payload - Error payload
   * @param {string} error.payload.error - Error message
   */
  onError = null

  /**
   * Called when WebSocket connection is established
   * @type {Function}
   */
  onConnect = null

  /**
   * Called when WebSocket connection is closed
   * @type {Function}
   * @param {CloseEvent} event - Close event
   */
  onDisconnect = null

  /**
   * Called when a subscription is confirmed
   * @type {Function}
   * @param {string} symbol - The symbol that was subscribed to
   */
  onSubscribed = null

  // ============================================================================
  // Constructor
  // ============================================================================

  /**
   * Creates a new HopiumWebSocketClient instance
   * @param {string} [customUrl] - Optional custom WebSocket URL (overrides config)
   */
  constructor(customUrl = null) {
    if (customUrl) {
      this.url = customUrl
    }
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to the WebSocket server with authentication
   * 
   * @param {string} token - JWT authentication token (required)
   * @returns {Promise<void>} Resolves when connected
   * @throws {Error} If connection fails or token is missing
   * 
   * @example
   * ```javascript
   * try {
   *   const token = authService.getToken()
   *   await client.connect(token)
   *   console.log('Connected!')
   * } catch (error) {
   *   console.error('Connection failed:', error)
   * }
   * ```
   */
  async connect(token) {
    // Validate token is provided
    if (!token) {
      throw new Error('Authentication token required. Please authenticate first.')
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Already connected
    }

    // Store token for reconnection
    this.authToken = token
    this.shouldReconnect = true

    return new Promise((resolve, reject) => {
      try {
        // Method 1: Include token in URL query parameter (recommended)
        const authUrl = `${this.url}?token=${encodeURIComponent(token)}`
        console.log('[WebSocket] Connecting to:', this.url.replace(/\?.*/, ''), '(with auth token)')
        this.ws = new WebSocket(authUrl)

        this.ws.onopen = () => {
          console.log('[WebSocket] ✅ Connected successfully (authenticated)')
          this.reconnectAttempts = 0 // Reset reconnection counter on successful connection
          
          // Re-subscribe to last symbol/strategy if this is a reconnection
          if (this.lastSymbol && this.lastStrategy) {
            console.log(`[WebSocket] Re-subscribing to ${this.lastSymbol} with strategy ${this.lastStrategy}`)
            this.subscribe(this.lastSymbol, this.lastStrategy)
          }
          
          if (this.onConnect) {
            this.onConnect()
          }
          resolve()
        }

        this.ws.onmessage = (event) => {
          this._handleMessage(event)
        }

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Connection error:', error)
          
          // Check if error is due to authentication
          const errorMessage = error.message || 'WebSocket connection error'
          const isAuthError = errorMessage.includes('401') || 
                             errorMessage.includes('Unauthorized') ||
                             errorMessage.includes('authentication')
          
          if (this.onError) {
            this.onError({
              type: 'error',
              payload: {
                error: isAuthError ? 'Authentication failed. Please re-authenticate.' : errorMessage
              }
            })
          }
          reject(error)
        }

        this.ws.onclose = (event) => {
          console.log('[WebSocket] Connection closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          })
          
          // Handle specific close codes
          this._handleCloseEvent(event)
          
          this.ws = null
          if (this.onDisconnect) {
            this.onDisconnect(event)
          }

          // Attempt reconnection if not deliberately disconnected
          if (this.shouldReconnect && this.authToken) {
            this._attemptReconnect()
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from the WebSocket server
   * 
   * @example
   * ```javascript
   * client.disconnect()
   * ```
   */
  disconnect() {
    this.shouldReconnect = false // Prevent reconnection
    
    // Clear any pending reconnection attempts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.subscriptions.clear()
    }
    
    // Clear stored auth data
    this.authToken = null
    this.lastSymbol = null
    this.lastStrategy = null
    this.reconnectAttempts = 0
  }

  /**
   * Handle WebSocket close events with specific error codes
   * @private
   * @param {CloseEvent} event - Close event
   */
  _handleCloseEvent(event) {
    let reason = event.reason || 'Unknown reason'
    let requiresReauth = false

    // Handle specific close codes
    switch (event.code) {
      case 1000:
        // Normal closure
        console.log('[WebSocket] Connection closed normally')
        break

      case 1008:
        // Policy violation (authentication failed/expired)
        console.warn('[WebSocket] ⚠️ Authentication failed or token expired')
        reason = 'Authentication failed or token expired. Please re-authenticate.'
        requiresReauth = true
        break

      case 4001:
        // Custom: Invalid token
        console.warn('[WebSocket] ⚠️ Invalid authentication token')
        reason = 'Invalid authentication token. Please re-authenticate.'
        requiresReauth = true
        break

      case 4029:
        // Custom: Too many connections (429)
        console.warn('[WebSocket] ⚠️ Connection limit exceeded')
        reason = 'Connection limit exceeded (max 3 connections per user). Close another connection.'
        break

      case 4030:
        // Custom: Authentication timeout
        console.warn('[WebSocket] ⚠️ Authentication timeout')
        reason = 'Authentication timeout (5 seconds). Please reconnect.'
        requiresReauth = true
        break

      default:
        console.warn('[WebSocket] Connection closed with code:', event.code)
    }

    // Notify error handler if token needs refresh
    if (requiresReauth && this.onError) {
      this.onError({
        type: 'error',
        payload: {
          error: reason,
          requiresReauth: true,
          code: event.code
        }
      })
    }
  }

  /**
   * Check if WebSocket is currently connected
   * @returns {boolean} True if connected and ready
   */
  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * Subscribe to receive updates for a specific trading pair
   * 
   * @param {string} symbol - Trading pair symbol (e.g., 'BTCUSDT')
   * @param {string} [strategy='range_trading'] - Trading strategy ('range_trading', 'momentum', 'scalp', or 'momentum_x')
   * @throws {Error} If WebSocket is not connected
   * 
   * @example
   * ```javascript
   * client.subscribe('BTCUSDT', 'range_trading')
   * // Or for scalp strategy
   * client.subscribe('BTCUSDT', 'scalp')
   * // Or for momentum X (psychic candle reader)
   * client.subscribe('BTCUSDT', 'momentum_x')
   * ```
   */
  subscribe(symbol, strategy = 'range_trading') {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    // Store last subscription for reconnection
    this.lastSymbol = symbol
    this.lastStrategy = strategy

    this._sendMessage({
      type: 'subscribe',
      symbol: symbol,
      strategy: strategy
    })
  }

  /**
   * Unsubscribe from updates for a specific trading pair
   * 
   * @param {string} symbol - Trading pair symbol (e.g., 'BTCUSDT')
   * @throws {Error} If WebSocket is not connected
   * 
   * @example
   * ```javascript
   * client.unsubscribe('BTCUSDT')
   * ```
   */
  unsubscribe(symbol) {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    this._sendMessage({
      type: 'unsubscribe',
      symbol: symbol
    })
  }

  /**
   * Get list of currently subscribed symbols
   * 
   * @returns {Promise<string[]>} Array of subscribed symbols
   * @throws {Error} If WebSocket is not connected
   * 
   * @example
   * ```javascript
   * const symbols = await client.listSubscriptions()
   * console.log('Subscribed to:', symbols)
   * ```
   */
  async listSubscriptions() {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    this._sendMessage({
      type: 'list_subscriptions'
    })
    return Array.from(this.subscriptions)
  }

  /**
   * Send a ping message to check connection health
   * 
   * @returns {Promise<void>} Resolves when pong is received
   * @throws {Error} If WebSocket is not connected
   * 
   * @example
   * ```javascript
   * await client.ping()
   * ```
   */
  async ping() {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    this._sendMessage({
      type: 'ping'
    })
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  /**
   * Handle incoming WebSocket messages
   * 
   * @private
   * @param {MessageEvent} event - WebSocket message event
   */
  _handleMessage(event) {
    try {
      const rawData = event.data
      
      // Handle newline-delimited JSON (multiple messages in one frame)
      if (typeof rawData === 'string' && rawData.includes('\n')) {
        const lines = rawData.split('\n').filter(line => line.trim() !== '')
        for (const line of lines) {
          try {
            const message = JSON.parse(line)
            this._processMessage(message)
          } catch (lineError) {
            console.error('[WebSocket] Failed to parse line:', line.substring(0, 100))
            console.error('[WebSocket] Parse error:', lineError.message)
          }
        }
        return
      }
      
      // Standard single JSON message
      const message = JSON.parse(rawData)
      this._processMessage(message)
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
      console.error('Raw data (first 500 chars):', event.data?.substring(0, 500))
      if (this.onError) {
        this.onError({
          type: 'error',
          payload: {
            error: `Failed to parse message: ${error.message}`
          }
        })
      }
    }
  }

  /**
   * Process parsed WebSocket message
   * 
   * @private
   * @param {Object} message - Parsed message object
   */
  _processMessage(message) {
    // Log all incoming WebSocket messages
    console.log('[WebSocket] Received message:', {
      type: message.type,
      fullMessage: message
    })
    
    console.log('[WebSocket] Message structure check:', {
      hasMessageProp: 'message' in message,
      hasPayloadProp: 'payload' in message,
      hasDataProp: 'data' in message,
      keys: Object.keys(message)
    })

    switch (message.type) {
      case 'subscribed':
        this.subscriptions.add(message.symbol)
        console.log('Subscribed to:', message.symbol)
        if (this.onSubscribed) {
          this.onSubscribed(message.symbol)
        }
        break

      case 'unsubscribed':
        this.subscriptions.delete(message.symbol)
        console.log('Unsubscribed from:', message.symbol)
        break

      case 'subscriptions':
        // Update local subscriptions from server response
        const subsData = message.message || message.payload
        if (subsData && Array.isArray(subsData.subscribed)) {
          this.subscriptions = new Set(subsData.subscribed)
        }
        break

      case 'summary':
        if (this.onSummary) {
          // Server sends summary in message.fullMessage (similar to scalp_indicator)
          // Also check message.message or message.payload for backwards compatibility
          const summaryData = message.fullMessage || message.message || message.payload || message
          console.log('[WebSocket] Extracted summary data for callback:', summaryData)
          this.onSummary(summaryData)
        }
        break

      case 'scalp_indicator':
        if (this.onScalpIndicator) {
          // Server sends scalp data in fullMessage.data
          console.log('[WebSocket] Received scalp_indicator:', message)
          
          // Extract data from fullMessage structure
          const scalpMessage = message.fullMessage || message.message || message.payload || message
          const scalpData = scalpMessage?.data || scalpMessage
          
          console.log('[WebSocket] Extracted scalp data:', scalpData)
          
          // Pass the full message structure (contains symbol, strategy, and data)
          this.onScalpIndicator(scalpMessage)
        }
        break

      case 'momentum_indicator':
        if (this.onMomentumIndicator) {
          // Server sends momentum data in fullMessage.data (similar to scalp_indicator)
          console.log('[WebSocket] Received momentum_indicator:', message)
          
          // Extract data from fullMessage structure
          const momentumMessage = message.fullMessage || message.message || message.payload || message
          const momentumData = momentumMessage?.data || momentumMessage
          
          console.log('[WebSocket] Extracted momentum data:', momentumData)
          
          // Pass the full message structure (contains symbol, strategy, and data)
          this.onMomentumIndicator(momentumMessage)
        }
        break

      case 'momentum_x':
        if (this.onMomentumX) {
          // Server sends momentum X data in fullMessage.data (similar to scalp_indicator and momentum_indicator)
          console.log('[WebSocket] Received momentum_x:', message)
          
          // Extract data from fullMessage structure
          const momentumXMessage = message.fullMessage || message.message || message.payload || message
          const momentumXData = momentumXMessage?.data || momentumXMessage
          
          console.log('[WebSocket] Extracted momentum X data:', momentumXData)
          
          // Pass the full message structure (contains symbol, strategy, and data)
          this.onMomentumX(momentumXMessage)
        }
        break

      case 'orderbook_signal':
        if (this.onOrderBookSignal) {
          // Server sends order book data in fullMessage.data (similar to scalp_indicator and momentum_indicator)
          console.log('[WebSocket] Received orderbook_signal:', message)
          
          // Extract data from fullMessage structure
          const orderBookMessage = message.fullMessage || message.message || message.payload || message
          const orderBookData = orderBookMessage?.data || orderBookMessage
          
          console.log('[WebSocket] Extracted order book data:', orderBookData)
          
          // Pass the full message structure (contains symbol, strategy, and data)
          this.onOrderBookSignal(orderBookMessage)
        }
        break

      case 'portfolio_picks':
        if (this.onPortfolioPicks) {
          // Server broadcasts portfolio picks to all authenticated clients
          console.log('[WebSocket] Received portfolio_picks:', message)
          
          // Extract picks data from message structure
          const portfolioMessage = message.fullMessage || message.message || message.payload || message
          const portfolioData = portfolioMessage?.data || portfolioMessage
          
          console.log('[WebSocket] Extracted portfolio data:', portfolioData)
          
          // Pass the full message structure
          this.onPortfolioPicks(portfolioMessage)
        }
        break

      case 'alert':
        if (this.onAlert) {
          // Server may send alert in message.message or message.payload
          const alertData = message.message || message.payload
          this.onAlert(alertData)
        }
        break

      case 'error':
        const errorPayload = message.message || message.payload || {}
        const errorMsg = errorPayload?.error || 'Unknown error'
        
        // Categorize errors for better handling
        if (errorMsg.includes('rate limit')) {
          console.warn('[WebSocket] ⚠️ Rate limit exceeded:', errorMsg)
        } else if (errorMsg.includes('Subscription limit')) {
          console.warn('[WebSocket] ⚠️ Subscription limit exceeded:', errorMsg)
        } else if (errorMsg.includes('authentication') || errorMsg.includes('Authentication')) {
          console.error('[WebSocket] 🔒 Authentication error:', errorMsg)
        } else {
          console.error('[WebSocket] ❌ Server error:', errorMsg)
        }
        
        if (this.onError) {
          // Pass the original message structure for error handler
          this.onError({
            type: 'error',
            payload: errorPayload
          })
        }
        break

      case 'pong':
        // Handle pong response
        break

      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  /**
   * Send a message to the WebSocket server
   * 
   * @private
   * @param {Object} message - Message object to send
   */
  _sendMessage(message) {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    const messageWithId = {
      ...message,
      id: ++this.messageId
    }

    console.log('[WebSocket] Sending message:', {
      type: message.type,
      message: messageWithId
    })

    try {
      this.ws.send(JSON.stringify(messageWithId))
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
      if (this.onError) {
        this.onError({
          type: 'error',
          payload: {
            error: 'Failed to send message'
          }
        })
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get current subscription count
   * @returns {number} Number of active subscriptions
   */
  getSubscriptionCount() {
    return this.subscriptions.size
  }

  /**
   * Check if subscribed to a specific symbol
   * @param {string} symbol - Trading pair symbol
   * @returns {boolean} True if subscribed
   */
  isSubscribed(symbol) {
    return this.subscriptions.has(symbol)
  }

  /**
   * Get all subscribed symbols as an array
   * @returns {string[]} Array of subscribed symbols
   */
  getSubscriptions() {
    return Array.from(this.subscriptions)
  }

  /**
   * Attempt to reconnect to the WebSocket server
   * @private
   */
  _attemptReconnect() {
    // Clear any existing reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectAttempts++
    console.log(`[WebSocket] Connection lost. Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts === Infinity ? '∞' : this.maxReconnectAttempts})...`)

    // Schedule reconnection attempt
    this.reconnectTimeout = setTimeout(async () => {
      if (!this.shouldReconnect || !this.authToken) {
        console.log('[WebSocket] Reconnection cancelled')
        return
      }

      try {
        console.log(`[WebSocket] Reconnecting... (attempt ${this.reconnectAttempts})`)
        await this.connect(this.authToken)
        console.log('[WebSocket] Reconnection successful!')
      } catch (error) {
        console.error('[WebSocket] Reconnection failed:', error)
        
        // Attempt again if we haven't exceeded max attempts
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this._attemptReconnect()
        } else {
          console.error('[WebSocket] Max reconnection attempts reached. Giving up.')
          if (this.onError) {
            this.onError({
              type: 'error',
              payload: {
                error: 'Failed to reconnect after multiple attempts',
                reconnectionFailed: true
              }
            })
          }
        }
      }
    }, this.reconnectInterval)
  }
}

// ============================================================================
// Export singleton instance (optional)
// ============================================================================

/**
 * Create a new WebSocket client instance
 * 
 * @param {string} [customUrl] - Optional custom WebSocket URL
 * @returns {HopiumWebSocketClient} New client instance
 */
export function createWebSocketClient(customUrl = null) {
  return new HopiumWebSocketClient(customUrl)
}

// Default export
export default HopiumWebSocketClient


