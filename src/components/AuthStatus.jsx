/**
 * Authentication Status Component
 * 
 * Shows authentication status and handles signature requests
 * Only appears near the wallet when user needs to sign
 */

import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import './AuthStatus.css'

function AuthStatus() {
  const { isAuthenticated, isAuthenticating, authError, user, walletAddress, authenticate, retryAuth } = useAuth()

  // Don't show anything if wallet is not connected
  if (!walletAddress) {
    return null
  }

  // Don't show if already authenticated and no errors
  if (isAuthenticated && !authError && !isAuthenticating) {
    return null
  }

  return (
    <AnimatePresence>
      {/* Need to authenticate - show button */}
      {!isAuthenticated && !isAuthenticating && !authError && (
        <motion.div
          className="auth-status needs-auth"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <span className="auth-info-icon">🔒</span>
          <span className="auth-info-text">Sign to unlock features</span>
          <button className="auth-sign-button" onClick={authenticate}>
            Sign
          </button>
        </motion.div>
      )}

      {/* Authenticating state */}
      {isAuthenticating && (
        <motion.div
          className="auth-status authenticating"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <div className="auth-spinner"></div>
          <span>Please sign the message in your wallet...</span>
        </motion.div>
      )}

      {/* Error state */}
      {authError && !isAuthenticating && (
        <motion.div
          className="auth-status error"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <div className="auth-error-content">
            <span className="auth-error-icon">⚠️</span>
            <div className="auth-error-text">
              <strong>Authentication Failed</strong>
              <p>{authError}</p>
            </div>
            <button className="auth-retry-button" onClick={retryAuth}>
              Retry
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AuthStatus

