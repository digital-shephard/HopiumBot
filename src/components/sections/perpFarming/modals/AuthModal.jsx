import React from 'react'

/**
 * Modal for re-authentication when session expires
 */
const AuthModal = ({ onClose, onReAuthenticate, onStop }) => {
  return (
    <div className="risk-modal-overlay" onClick={onClose}>
      <div className="risk-modal auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="risk-modal-close" onClick={onClose}>×</button>
        <div className="risk-modal-wrapper">
          <h2 className="risk-modal-title">Re-Authentication Required</h2>
          <div className="auth-modal-content">
            <div className="auth-modal-icon">⚠️</div>
            <p className="auth-modal-message">
              Your authentication session has expired. Please sign the authentication message in your wallet to continue trading.
            </p>
            <div className="auth-modal-buttons">
              <button 
                className="auth-modal-button primary"
                onClick={onReAuthenticate}
              >
                Re-Authenticate
              </button>
              <button 
                className="auth-modal-button secondary"
                onClick={onStop}
              >
                Stop Bot
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthModal

