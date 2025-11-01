/**
 * Authentication Service for HopiumCore
 * 
 * Implements wallet signature-based authentication flow:
 * 1. Request challenge from server
 * 2. Sign challenge with wallet
 * 3. Verify signature to get JWT token
 * 4. Use token for authenticated requests
 * 
 * Based on: docs/AUTHENTICATION_GUIDE.md
 */

import API_CONFIG from '../config/api'

class AuthService {
  constructor() {
    this.token = null
    this.walletAddress = null
    this.tokenExpiry = null
    
    // Restore from sessionStorage if available
    this.restoreSession()
  }

  /**
   * Main authentication flow
   * @param {string} walletAddress - The wallet address to authenticate
   * @returns {Promise<string>} JWT token
   */
  async authenticate(walletAddress) {
    console.log('[Auth] Starting authentication for:', walletAddress)
    
    try {
      // Step 1: Request challenge
      const challenge = await this.requestChallenge(walletAddress)
      console.log('[Auth] Challenge received, expires at:', challenge.expires_at)
      
      // Step 2: Sign the message
      const signature = await this.signMessage(challenge.message)
      console.log('[Auth] Message signed successfully')
      
      // Step 3: Verify signature and get token
      const tokenData = await this.verifySignature(walletAddress, signature, challenge.message)
      console.log('[Auth] Authentication successful, token expires at:', tokenData.expires_at)
      
      // Store token and wallet
      this.token = tokenData.token
      this.walletAddress = walletAddress
      this.tokenExpiry = tokenData.expires_at
      
      // Persist to sessionStorage
      this.saveSession()
      
      return tokenData.token
    } catch (error) {
      console.error('[Auth] Authentication failed:', error)
      throw error
    }
  }

  /**
   * Step 1: Request a challenge from the server
   */
  async requestChallenge(walletAddress) {
    const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: walletAddress })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to request challenge')
    }
    
    return await response.json()
  }

  /**
   * Step 2: Sign the challenge message with the wallet
   */
  async signMessage(message) {
    try {
      // Check if ethereum provider is available
      if (!window.ethereum) {
        throw new Error('No Ethereum provider found. Please install MetaMask or use WalletConnect.')
      }
      
      // Use EIP-1193 provider to sign message
      // This works with MetaMask, WalletConnect, and other providers
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      })
      
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found. Please connect your wallet.')
      }
      
      // Sign the message using personal_sign (EIP-191)
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, accounts[0]]
      })
      
      return signature
    } catch (error) {
      // User rejected signature
      if (error.code === 4001 || error.message?.includes('User rejected')) {
        throw new Error('Signature rejected by user')
      }
      throw error
    }
  }

  /**
   * Step 3: Verify the signature and get JWT token
   */
  async verifySignature(walletAddress, signature, message) {
    const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletAddress,
        signature: signature,
        message: message
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to verify signature')
    }
    
    return await response.json()
  }

  /**
   * Make an authenticated request
   */
  async makeAuthenticatedRequest(endpoint, options = {}) {
    if (!this.token) {
      throw new Error('Not authenticated. Please connect your wallet and sign the message.')
    }
    
    // Check if token is expired
    if (this.isTokenExpired()) {
      throw new Error('Authentication expired. Please re-authenticate.')
    }
    
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.status === 401) {
      // Token is invalid or expired
      this.clearSession()
      throw new Error('Authentication expired. Please re-authenticate.')
    }
    
    return response
  }

  /**
   * Check if the current token is expired
   */
  isTokenExpired() {
    if (!this.tokenExpiry) return true
    
    const expiryTime = new Date(this.tokenExpiry).getTime()
    const currentTime = Date.now()
    
    // Add 1 minute buffer
    return currentTime >= (expiryTime - 60000)
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.token !== null && !this.isTokenExpired()
  }

  /**
   * Get current wallet address
   */
  getWalletAddress() {
    return this.walletAddress
  }

  /**
   * Get current token
   */
  getToken() {
    return this.token
  }

  /**
   * Logout - clear all auth data
   */
  logout() {
    console.log('[Auth] Logging out')
    this.clearSession()
  }

  /**
   * Save session to sessionStorage
   */
  saveSession() {
    if (this.token && this.walletAddress) {
      sessionStorage.setItem('auth_token', this.token)
      sessionStorage.setItem('auth_wallet', this.walletAddress)
      sessionStorage.setItem('auth_expiry', this.tokenExpiry)
    }
  }

  /**
   * Restore session from sessionStorage
   */
  restoreSession() {
    const token = sessionStorage.getItem('auth_token')
    const wallet = sessionStorage.getItem('auth_wallet')
    const expiry = sessionStorage.getItem('auth_expiry')
    
    if (token && wallet && expiry) {
      this.token = token
      this.walletAddress = wallet
      this.tokenExpiry = expiry
      
      // Check if still valid
      if (this.isTokenExpired()) {
        console.log('[Auth] Restored session is expired')
        this.clearSession()
      } else {
        console.log('[Auth] Session restored for:', wallet)
      }
    }
  }

  /**
   * Clear session data
   */
  clearSession() {
    this.token = null
    this.walletAddress = null
    this.tokenExpiry = null
    
    sessionStorage.removeItem('auth_token')
    sessionStorage.removeItem('auth_wallet')
    sessionStorage.removeItem('auth_expiry')
  }

  // ============================================
  // Convenience methods for common API calls
  // ============================================

  /**
   * Register user
   */
  async registerUser() {
    const response = await this.makeAuthenticatedRequest('/api/tasks/user/register', {
      method: 'POST'
    })
    return await response.json()
  }

  /**
   * Get user profile
   */
  async getUserProfile(walletAddress = null) {
    const address = walletAddress || this.walletAddress
    const response = await this.makeAuthenticatedRequest(`/api/tasks/user/${address}`)
    return await response.json()
  }

  /**
   * Complete a task
   */
  async completeTask(taskType, taskData = {}) {
    const response = await this.makeAuthenticatedRequest('/api/tasks/complete', {
      method: 'POST',
      body: JSON.stringify({
        task_type: taskType,
        task_data: taskData
      })
    })
    return await response.json()
  }

  /**
   * Enter referral code
   */
  async enterReferralCode(referralCode) {
    const response = await this.makeAuthenticatedRequest('/api/tasks/referral/enter', {
      method: 'POST',
      body: JSON.stringify({
        referral_code: referralCode
      })
    })
    return await response.json()
  }

  /**
   * Get referral info
   */
  async getReferralInfo(walletAddress = null) {
    const address = walletAddress || this.walletAddress
    const response = await this.makeAuthenticatedRequest(`/api/tasks/referral/${address}`)
    return await response.json()
  }
}

// Export singleton instance
const authService = new AuthService()
export default authService

