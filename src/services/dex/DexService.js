/**
 * Abstract DEX Service Interface
 * 
 * This interface defines the contract that all DEX implementations must follow.
 * This allows for modular support of multiple DEXs (Aster, Hyperliquid, etc.)
 */

/**
 * Abstract DEX Service
 * 
 * All DEX implementations should extend this class or implement these methods
 */
export class DexService {
  /**
   * Initialize the DEX service with credentials
   * @param {Object} credentials - DEX-specific credentials
   * @throws {Error} If credentials are invalid
   */
  async initialize(credentials) {
    throw new Error('initialize() must be implemented by subclass')
  }

  /**
   * Validate API credentials
   * @returns {Promise<boolean>} True if credentials are valid
   */
  async validateCredentials() {
    throw new Error('validateCredentials() must be implemented by subclass')
  }

  /**
   * Place a new order
   * @param {Object} orderParams - Order parameters
   * @param {string} orderParams.symbol - Trading pair symbol
   * @param {string} orderParams.side - 'BUY' or 'SELL'
   * @param {string} orderParams.type - Order type (e.g., 'LIMIT', 'MARKET')
   * @param {string} orderParams.quantity - Order quantity
   * @param {string} [orderParams.price] - Order price (required for LIMIT orders)
   * @param {string} [orderParams.timeInForce] - Time in force (default: 'GTC')
   * @param {string} [orderParams.newClientOrderId] - Client order ID
   * @returns {Promise<Object>} Order response from DEX
   */
  async placeOrder(orderParams) {
    throw new Error('placeOrder() must be implemented by subclass')
  }

  /**
   * Cancel an order
   * @param {string} symbol - Trading pair symbol
   * @param {number|string} orderId - Order ID to cancel
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelOrder(symbol, orderId) {
    throw new Error('cancelOrder() must be implemented by subclass')
  }

  /**
   * Get order status
   * @param {string} symbol - Trading pair symbol
   * @param {number|string} orderId - Order ID
   * @returns {Promise<Object>} Order status
   */
  async getOrderStatus(symbol, orderId) {
    throw new Error('getOrderStatus() must be implemented by subclass')
  }

  /**
   * Get all open orders
   * @param {string} [symbol] - Optional symbol filter
   * @returns {Promise<Array>} Array of open orders
   */
  async getOpenOrders(symbol = null) {
    throw new Error('getOpenOrders() must be implemented by subclass')
  }

  /**
   * Get current position for a symbol
   * @param {string} symbol - Trading pair symbol
   * @returns {Promise<Object>} Position information
   */
  async getPosition(symbol) {
    throw new Error('getPosition() must be implemented by subclass')
  }

  /**
   * Get account balance
   * @returns {Promise<Object>} Account balance information
   */
  async getAccountBalance() {
    throw new Error('getAccountBalance() must be implemented by subclass')
  }

  /**
   * Get the DEX name
   * @returns {string} DEX name (e.g., 'aster', 'hyperliquid')
   */
  getName() {
    throw new Error('getName() must be implemented by subclass')
  }
}

export default DexService

