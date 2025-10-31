/**
 * API configuration for HopiumCore API
 * 
 * Development: http://localhost:8080
 * Production: https://api.hopiumbot.com
 * 
 * Dev Toggle: Use localStorage key 'api_use_prod' to force production API
 * Set via console: localStorage.setItem('api_use_prod', 'true')
 * Or use the dev toggle UI (visible in development mode)
 */

const DEV_URL = 'http://localhost:8080';
const PROD_URL = 'https://api.hopiumbot.com';

// Check if we should use prod (via localStorage toggle or actual production hostname)
const isActualProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const useProdToggle = localStorage.getItem('api_use_prod') === 'true';
const useProduction = isActualProduction || useProdToggle;

export const API_CONFIG = {
  BASE_URL: useProduction ? PROD_URL : DEV_URL,
  DEV_URL,
  PROD_URL,
  isUsingProduction: useProduction,
  isActualProduction,
  useProdToggle,
  
  // Toggle between dev and prod
  toggleEnvironment() {
    const current = localStorage.getItem('api_use_prod') === 'true';
    localStorage.setItem('api_use_prod', current ? 'false' : 'true');
    // Reload to apply changes
    window.location.reload();
  },
  
  // Set environment explicitly
  setEnvironment(useProd) {
    localStorage.setItem('api_use_prod', useProd ? 'true' : 'false');
    window.location.reload();
  },
  
  // API endpoints
  endpoints: {
    snapshot: (symbol = 'BTCUSDT') => `/api/perps/snapshot?symbol=${symbol}`,
    marketData: (symbol) => `/api/perps/market-data?symbol=${symbol}`,
    klines: (symbol, interval = '1h', limit = 100) => `/api/perps/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    markPrice: (symbol) => `/api/perps/mark-price?symbol=${symbol}`,
    orderbook: (symbol, limit = 20) => `/api/perps/orderbook?symbol=${symbol}&limit=${limit}`,
    health: '/health',
    testLLM: '/api/test/llm'
  },
  
  // Helper to get full URL
  getUrl: (endpoint) => `${this.BASE_URL}${endpoint}`,
  
  // Fetch wrapper with error handling
  async fetch(endpoint, options = {}) {
    try {
      const url = `${this.BASE_URL}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API fetch error:', error);
      throw error;
    }
  }
};

export default API_CONFIG;

