import './FarmingGuideModal.css'

function FarmingGuideModal({ airdrop, onClose }) {
  if (!airdrop) return null

  const { name, description, status, farmingGuide } = airdrop

  // Close on ESC key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Add event listener for ESC key
  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [])

  return (
    <div className="farming-modal-overlay" onClick={handleOverlayClick}>
      <div className="farming-modal">
        <button className="farming-modal-close" onClick={onClose} aria-label="Close modal">
          ×
        </button>

        {/* Header */}
        <div className="farming-modal-header">
          <h2 className="farming-modal-title">{name}</h2>
          <div className="farming-modal-meta">
            <span className={`farming-modal-status ${status.toLowerCase().replace(' ', '-')}`}>
              {status}
            </span>
            {farmingGuide?.difficulty && (
              <span className={`farming-modal-difficulty ${farmingGuide.difficulty.toLowerCase()}`}>
                {farmingGuide.difficulty}
              </span>
            )}
          </div>
          <p className="farming-modal-description">{description}</p>
        </div>

        {/* Content */}
        <div className="farming-modal-content">
          {/* Estimated Time */}
          {farmingGuide?.estimatedTime && (
            <div className="farming-modal-section">
              <h3>⏱️ Time Commitment</h3>
              <p>{farmingGuide.estimatedTime}</p>
            </div>
          )}

          {/* Requirements */}
          {farmingGuide?.requirements && farmingGuide.requirements.length > 0 && (
            <div className="farming-modal-section">
              <h3>📋 Requirements</h3>
              <ul className="farming-modal-list">
                {farmingGuide.requirements.map((req, index) => (
                  <li key={index}>{req}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps */}
          {farmingGuide?.steps && farmingGuide.steps.length > 0 && (
            <div className="farming-modal-section">
              <h3>🚀 Farming Steps</h3>
              <div className="farming-steps">
                {farmingGuide.steps.map((step) => (
                  <div key={step.stepNumber} className="farming-step">
                    <div className="farming-step-number">{step.stepNumber}</div>
                    <div className="farming-step-content">
                      <h4 className="farming-step-title">{step.title}</h4>
                      <p className="farming-step-description">{step.description}</p>
                      {step.tips && (
                        <div className="farming-step-tips">
                          💡 <span className="farming-step-tips-label">Pro Tip:</span> {step.tips}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rewards */}
          {farmingGuide?.rewards && (
            <div className="farming-modal-section farming-modal-rewards">
              <h3>💰 Expected Rewards</h3>
              {farmingGuide.rewards.estimated && (
                <p className="farming-reward-estimate">
                  <strong>Estimated:</strong> {farmingGuide.rewards.estimated}
                </p>
              )}
              {farmingGuide.rewards.criteria && (
                <p className="farming-reward-criteria">
                  <strong>Based on:</strong> {farmingGuide.rewards.criteria}
                </p>
              )}
            </div>
          )}

          {/* Warnings */}
          {farmingGuide?.warnings && farmingGuide.warnings.length > 0 && (
            <div className="farming-modal-section farming-modal-warnings">
              <h3>⚠️ Important Warnings</h3>
              <ul className="farming-modal-list farming-warnings-list">
                {farmingGuide.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="farming-modal-footer">
          <button className="farming-modal-action" onClick={onClose}>
            Got It! Let's Farm 🚀
          </button>
        </div>
      </div>
    </div>
  )
}

// Import React for useEffect
import React from 'react'

export default FarmingGuideModal

