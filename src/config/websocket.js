/**
 * WebSocket configuration for HopiumCore API
 * 
 * Development: ws://localhost:8080/ws
 * Production: wss://api.hopiumbot.com/ws
 * 
 * Uses same environment detection as API_CONFIG
 */

const DEV_URL = 'ws://localhost:8080/ws';
const PROD_URL = 'wss://api.hopiumbot.com/ws';

// Check if we should use prod (via localStorage toggle or actual production hostname)
const isActualProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const useProdToggle = localStorage.getItem('api_use_prod') === 'true';
const useProduction = isActualProduction || useProdToggle;

export const WEBSOCKET_CONFIG = {
  // Development URL
  DEV_URL,
  
  // Production URL
  PROD_URL,
  
  // Current environment
  get URL() {
    return useProduction ? this.PROD_URL : this.DEV_URL;
  },
  
  isUsingProduction: useProduction,
  
  // Connection settings
  PING_INTERVAL: 54000, // ~54 seconds (server sends ping)
  PONG_TIMEOUT: 60000,  // 60 seconds timeout
  MAX_MESSAGE_SIZE: 512, // bytes
  RECONNECT_DELAY: 3000, // 3 seconds initial reconnect delay
  MAX_RECONNECT_DELAY: 30000, // 30 seconds max reconnect delay
}


