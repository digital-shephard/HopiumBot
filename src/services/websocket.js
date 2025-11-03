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

    return new Promise((resolve, reject) => {
      try {
        // Method 1: Include token in URL query parameter (recommended)
        const authUrl = `${this.url}?token=${encodeURIComponent(token)}`
        console.log('[WebSocket] Connecting to:', this.url.replace(/\?.*/, ''), '(with auth token)')
        this.ws = new WebSocket(authUrl)

        this.ws.onopen = () => {
          console.log('[WebSocket] ✅ Connected successfully (authenticated)')
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
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.subscriptions.clear()
    }
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
   * @param {string} [strategy='range_trading'] - Trading strategy ('range_trading', 'momentum', or 'scalp')
   * @throws {Error} If WebSocket is not connected
   * 
   * @example
   * ```javascript
   * client.subscribe('BTCUSDT', 'range_trading')
   * // Or for scalp strategy
   * client.subscribe('BTCUSDT', 'scalp')
   * ```
   */
  subscribe(symbol, strategy = 'range_trading') {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected')
    }

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
      const message = JSON.parse(event.data)
      this._processMessage(message)
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
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
      message: message
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
          // Server may send summary in message.message or message.payload
          const summaryData = message.message || message.payload
          this.onSummary(summaryData)
        }
        break

      case 'scalp_indicator':
        if (this.onScalpIndicator) {
          // Server sends scalp data in message.message.data or message.payload.data
          console.log('[WebSocket] Processing scalp_indicator:', {
            hasMessage: !!message.message,
            hasPayload: !!message.payload,
            messageData: message.message?.data,
            payloadData: message.payload?.data,
            rawMessage: message.message,
            rawPayload: message.payload
          })
          
          const scalpData = message.message?.data || message.payload?.data || message.message || message.payload
          console.log('[WebSocket] Extracted scalpData:', scalpData)
          this.onScalpIndicator(scalpData)
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


