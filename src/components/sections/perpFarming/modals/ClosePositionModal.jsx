import React, { useState } from 'react'

/**
 * Modal for confirming position close
 */
const ClosePositionModal = ({ 
  position, 
  onClose, 
  onConfirm,
  showExcludeCheckbox = false
}) => {
  const [addToExcludeList, setAddToExcludeList] = useState(false)

  const handleConfirm = () => {
    onConfirm(addToExcludeList)
  }

  if (!position) return null

  return (
    <div className="risk-modal-overlay" onClick={onClose}>
      <div className="risk-modal close-position-modal" onClick={(e) => e.stopPropagation()}>
        <button className="risk-modal-close" onClick={onClose}>×</button>
        <div className="risk-modal-wrapper">
          <h2 className="risk-modal-title">Close Position</h2>
          <div className="close-position-content">
            <div className="close-position-symbol">
              {position.symbol.replace('USDT', '')}
            </div>
            <div className={`close-position-pnl ${position.pnl > 0 ? 'positive' : position.pnl < 0 ? 'negative' : 'neutral'}`}>
              {position.pnl > 0 ? '+' : ''}{position.pnl < 0 ? '-' : ''}${Math.abs(position.pnl).toFixed(2)}
            </div>
            <p className="close-position-message">
              Are you sure you want to close this position?
            </p>
            {showExcludeCheckbox && (
              <label className="exclude-checkbox-label">
                <input
                  type="checkbox"
                  checked={addToExcludeList}
                  onChange={(e) => setAddToExcludeList(e.target.checked)}
                  className="exclude-checkbox"
                />
                <span>Add {position.symbol.replace('USDT', '')} to exclusion list</span>
              </label>
            )}
            <div className="close-position-buttons">
              <button 
                className="close-position-button confirm"
                onClick={handleConfirm}
              >
                Close Position
              </button>
              <button 
                className="close-position-button cancel"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClosePositionModal

