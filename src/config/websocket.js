/**
 * WebSocket configuration for HopiumCore API
 * 
 * Development: ws://localhost:8080/ws
 * Production: Will be configured later
 */

export const WEBSOCKET_CONFIG = {
  // Development URL
  DEV_URL: 'ws://localhost:8080/ws',
  
  // Production URL (to be configured)
  PROD_URL: null,
  
  // Current environment
  get URL() {
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development'
    return isDev ? this.DEV_URL : this.PROD_URL || this.DEV_URL
  },
  
  // Connection settings
  PING_INTERVAL: 54000, // ~54 seconds (server sends ping)
  PONG_TIMEOUT: 60000,  // 60 seconds timeout
  MAX_MESSAGE_SIZE: 512, // bytes
  RECONNECT_DELAY: 3000, // 3 seconds initial reconnect delay
  MAX_RECONNECT_DELAY: 30000, // 30 seconds max reconnect delay
}

