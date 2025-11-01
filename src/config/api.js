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
    // Perps endpoints
    snapshot: (symbol = 'BTCUSDT') => `/api/perps/snapshot?symbol=${symbol}`,
    marketData: (symbol) => `/api/perps/market-data?symbol=${symbol}`,
    klines: (symbol, interval = '1h', limit = 100) => `/api/perps/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    markPrice: (symbol) => `/api/perps/mark-price?symbol=${symbol}`,
    orderbook: (symbol, limit = 20) => `/api/perps/orderbook?symbol=${symbol}&limit=${limit}`,
    health: '/health',
    testLLM: '/api/test/llm',
    
    // HopiumTasks endpoints
    tasks: {
      // User endpoints
      register: '/api/tasks/user/register',
      userProfile: (walletAddress) => `/api/tasks/user/${walletAddress}`,
      
      // Discord OAuth endpoints
      discordAuth: (walletAddress) => `/api/tasks/discord/auth?wallet_address=${walletAddress}`,
      discordCallback: '/api/tasks/discord/callback',
      
      // Referral endpoints
      enterReferral: '/api/tasks/referral/enter',
      getReferralInfo: (walletAddress) => `/api/tasks/referral/${walletAddress}`,
      
      // Leaderboard endpoints
      leaderboard: (limit = 100, offset = 0) => `/api/tasks/leaderboard?limit=${limit}&offset=${offset}`,
      userRank: (walletAddress) => `/api/tasks/leaderboard/user/${walletAddress}`
    }
  },
  
  // Helper to get full URL
  getUrl: (endpoint) => `${this.BASE_URL}${endpoint}`,
  
  // Fetch wrapper with error handling
  async fetch(endpoint, options = {}) {
    const url = `${this.BASE_URL}${endpoint}`;
    
    try {
      console.log(`[API] Fetching: ${options.method || 'GET'} ${url}`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      console.log(`[API] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // Try to get error message from response body
        let errorMessage;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`;
          } catch (jsonError) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          // Not JSON response, try to get text
          try {
            const text = await response.text();
            errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
          } catch (textError) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
        
        console.error(`[API] Error response:`, errorMessage);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      // Check if it's a network error (server not reachable)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error(`[API] Network error - cannot reach server at ${url}`);
        console.error(`[API] Make sure HopiumCore backend is running at ${this.BASE_URL}`);
        throw new Error(`Cannot connect to server at ${this.BASE_URL}. Is the backend running?`);
      }
      
      console.error('[API] Fetch error:', error);
      throw error;
    }
  }
};

export default API_CONFIG;

