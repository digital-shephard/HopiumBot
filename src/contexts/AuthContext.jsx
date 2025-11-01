/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the app
 * Manages wallet connection + signature-based authentication
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import authService from '../services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { address, isConnected } = useAccount()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [user, setUser] = useState(null)

  // Check if we have a valid session on mount
  useEffect(() => {
    if (authService.isAuthenticated()) {
      setIsAuthenticated(true)
      loadUserProfile()
    }
  }, [])

  // Handle wallet connection/disconnection
  useEffect(() => {
    if (!isConnected) {
      // Wallet disconnected - clear auth
      handleLogout()
    } else if (address) {
      // Wallet connected - check if we already have auth for this wallet
      const currentAuthWallet = authService.getWalletAddress()
      
      if (currentAuthWallet === address && authService.isAuthenticated()) {
        // Same wallet and still authenticated - restore user profile
        console.log('[AuthContext] Wallet connected, restoring session...')
        loadUserProfile()
      } else {
        // Different wallet or no auth - DON'T auto-authenticate
        // User must manually click "Sign to Authenticate" button
        console.log('[AuthContext] Wallet connected, waiting for user to sign...')
        setIsAuthenticated(false)
        setUser(null)
      }
    }
  }, [isConnected, address])

  /**
   * Trigger authentication flow
   */
  const handleAuthenticate = async () => {
    if (!address || isAuthenticating) return

    setIsAuthenticating(true)
    setAuthError(null)

    try {
      console.log('[AuthContext] Starting authentication...')
      await authService.authenticate(address)
      setIsAuthenticated(true)
      
      // Try to load or register user
      await loadOrRegisterUser()
      
      console.log('[AuthContext] Authentication complete!')
    } catch (error) {
      console.error('[AuthContext] Authentication failed:', error)
      setAuthError(error.message)
      setIsAuthenticated(false)
    } finally {
      setIsAuthenticating(false)
    }
  }

  /**
   * Load user profile, or register if new user
   */
  const loadOrRegisterUser = async () => {
    try {
      // Try to get user profile
      const profile = await authService.getUserProfile()
      setUser(profile)
      console.log('[AuthContext] User profile loaded:', profile)
    } catch (error) {
      // If user doesn't exist (404), register them
      if (error.message.includes('404') || error.message.includes('not found')) {
        console.log('[AuthContext] New user detected, registering...')
        try {
          const newUser = await authService.registerUser()
          setUser(newUser)
          console.log('[AuthContext] User registered:', newUser)
        } catch (registerError) {
          console.error('[AuthContext] Failed to register user:', registerError)
        }
      } else {
        console.error('[AuthContext] Failed to load user profile:', error)
      }
    }
  }

  /**
   * Load user profile
   */
  const loadUserProfile = async () => {
    try {
      const profile = await authService.getUserProfile()
      setUser(profile)
    } catch (error) {
      console.error('[AuthContext] Failed to load user profile:', error)
    }
  }

  /**
   * Logout - clear authentication
   */
  const handleLogout = () => {
    authService.logout()
    setIsAuthenticated(false)
    setUser(null)
    setAuthError(null)
  }

  /**
   * Retry authentication (e.g., if user rejected signature)
   */
  const retryAuth = () => {
    setAuthError(null)
    handleAuthenticate()
  }

  const value = {
    // State
    isAuthenticated,
    isAuthenticating,
    authError,
    user,
    walletAddress: address,
    
    // Methods
    authenticate: handleAuthenticate,
    logout: handleLogout,
    retryAuth,
    refreshUser: loadUserProfile,
    
    // Auth service for direct access if needed
    authService
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext

