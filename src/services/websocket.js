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
  // Connection Management (Staged - Not Implemented Yet)
  // ============================================================================

  /**
   * Connect to the WebSocket server
   * 
   * @returns {Promise<void>} Resolves when connected
   * @throws {Error} If connection fails
   * 
   * @example
   * ```javascript
   * try {
   *   await client.connect()
   *   console.log('Connected!')
   * } catch (error) {
   *   console.error('Connection failed:', error)
   * }
   * ```
   */
  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Already connected
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('[WebSocket] Connecting to:', this.url)
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected successfully')
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
          if (this.onError) {
            this.onError({
              type: 'error',
              payload: {
                error: 'WebSocket connection error'
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
   * @param {string} [strategy='range_trading'] - Trading strategy ('range_trading' or 'momentum')
   * @throws {Error} If WebSocket is not connected
   * 
   * @example
   * ```javascript
   * client.subscribe('BTCUSDT', 'range_trading')
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
  // Message Handling (Staged - Not Implemented Yet)
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
        if (message.payload && Array.isArray(message.payload.subscribed)) {
          this.subscriptions = new Set(message.payload.subscribed)
        }
        break

      case 'summary':
        if (this.onSummary) {
          this.onSummary(message.payload)
        }
        break

      case 'alert':
        if (this.onAlert) {
          this.onAlert(message.payload)
        }
        break

      case 'error':
        console.error('Server error:', message.payload?.error)
        if (this.onError) {
          this.onError(message)
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


