import { useState, useEffect } from 'react'
import API_CONFIG from '../config/api'
import './DevToggle.css'

/**
 * Dev Toggle Component
 * Only visible in development mode
 * Allows switching between dev and prod API endpoints
 */
function DevToggle() {
  // Only show in development mode
  const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development'
  
  const [isUsingProd, setIsUsingProd] = useState(API_CONFIG.useProdToggle)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Update state when localStorage changes
    const checkToggle = () => {
      const useProd = localStorage.getItem('api_use_prod') === 'true'
      setIsUsingProd(useProd)
    }
    
    checkToggle()
    // Listen for storage changes (from other tabs/windows)
    window.addEventListener('storage', checkToggle)
    return () => window.removeEventListener('storage', checkToggle)
  }, [])

  if (!isDev) {
    return null // Don't render in production
  }

  const handleToggle = () => {
    API_CONFIG.toggleEnvironment()
    // Note: toggleEnvironment() reloads the page, so we don't need to update state here
  }

  const toggleVisibility = () => {
    setIsVisible(!isVisible)
  }

  const currentEnv = API_CONFIG.isUsingProduction ? 'Production' : 'Development'
  const currentUrl = API_CONFIG.BASE_URL
  const switchTo = API_CONFIG.isUsingProduction ? 'Dev' : 'Prod'

  return (
    <div className={`dev-toggle-container ${isVisible ? 'expanded' : ''}`}>
      <button
        className="dev-toggle-button"
        onClick={toggleVisibility}
        title="Dev Tools"
        aria-label="Toggle dev tools"
      >
        ⚙️
      </button>
      {isVisible && (
        <div className="dev-toggle-panel">
          <div className="dev-toggle-header">
            <span className="dev-toggle-title">Dev Tools</span>
            <button
              className="dev-toggle-close"
              onClick={toggleVisibility}
              aria-label="Close dev tools"
            >
              ×
            </button>
          </div>
          <div className="dev-toggle-content">
            <div className="dev-toggle-section">
              <div className="dev-toggle-label">API Environment</div>
              <div className="dev-toggle-info">
                <span className="dev-toggle-status">
                  {currentEnv}
                </span>
                <span className="dev-toggle-url">
                  {currentUrl}
                </span>
              </div>
              <button
                className="dev-toggle-switch"
                onClick={handleToggle}
              >
                Switch to {switchTo}
              </button>
            </div>
            <div className="dev-toggle-section">
              <div className="dev-toggle-hint">
                Changes persist via localStorage and require a page reload.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DevToggle

