import { useState, useEffect } from 'react'
import './PerpFarming.css'
import asterLogo from '../../assets/aster_logo.png'

const STORAGE_KEY = 'perp_farming_settings'

function PerpFarming() {
  const [showModal, setShowModal] = useState(false)
  const [asterApiKey, setAsterApiKey] = useState('')
  const [capital, setCapital] = useState('')
  const [takeProfit, setTakeProfit] = useState(10)
  const [stopLoss, setStopLoss] = useState(10)
  const [shakeApiKey, setShakeApiKey] = useState(false)
  const [shakeCapital, setShakeCapital] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY)
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        setAsterApiKey(settings.asterApiKey || '')
        setCapital(settings.capital || '')
        setTakeProfit(settings.takeProfit !== undefined ? settings.takeProfit : 10)
        setStopLoss(settings.stopLoss !== undefined ? settings.stopLoss : 10)
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }
  }, [])

  // Helper function to format percentage display
  const formatPercentage = (value) => {
    return value === 0 ? 'None' : `${value}%`
  }

  const handleStart = () => {
    let isValid = true

    // Validate API key
    if (!asterApiKey || asterApiKey.trim() === '') {
      setShakeApiKey(true)
      setTimeout(() => setShakeApiKey(false), 500)
      isValid = false
    }

    // Validate capital
    const capitalNum = parseFloat(capital)
    if (!capital || capital.trim() === '' || capitalNum === 0 || isNaN(capitalNum)) {
      setShakeCapital(true)
      setTimeout(() => setShakeCapital(false), 500)
      isValid = false
    }

    if (!isValid) {
      return
    }

    // Save settings and close modal
    const settings = {
      asterApiKey,
      capital,
      takeProfit,
      stopLoss
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setShowModal(false)
  }

  const handleCloseModal = () => {
    setShowModal(false)
  }

  // Generate random angles and properties for more organic distribution
  const generateRandomLine = () => {
    const angle = Math.random() * 360;
    const delay = Math.random() * 2;
    const distance = 60 + Math.random() * 20; // Vary starting distance
    const duration = 3 + Math.random() * 2; // Vary animation speed
    const length = 300 + Math.random() * 200; // Vary line length
    
    return { angle, delay, distance, duration, length };
  };

  const lines = Array.from({ length: 60 }, generateRandomLine);

  return (
    <div className="section perp-farming">
      <div className="light-lines-container">
        {lines.map((line, i) => (
          <div 
            key={i} 
            className="light-line"
            style={{
              '--angle': `${line.angle}deg`,
              '--delay': `${line.delay}s`,
              '--distance': `${line.distance}vh`,
              '--duration': `${line.duration}s`,
              '--length': `${line.length}px`
            }}
          />
        ))}
      </div>
      
      <div className="section-content">
        <h1 className="section-title">Perp Farming</h1>
        <p className="section-description">
          Advanced perpetual farming strategies for maximum yield
        </p>
        
        <div className="aster-circle-container">
          <div className="aster-circle">
            <div className="aster-placeholder">
              <img src={asterLogo} alt="Aster Logo" className="logo-image" />
            </div>
          </div>
          <button className="setup-button" onClick={() => setShowModal(true)}>
            Setup
          </button>
        </div>
      </div>

      {/* Risk Settings Modal */}
      {showModal && (
        <div className="risk-modal-overlay" onClick={handleCloseModal}>
          <div className="risk-modal" onClick={(e) => e.stopPropagation()}>
            <button className="risk-modal-close" onClick={handleCloseModal}>×</button>
            <h2 className="risk-modal-title">Risk Settings</h2>
            <div className="risk-modal-content">
              <div className="risk-form-group">
                <label className="risk-label">Aster API Key</label>
                <input
                  type="text"
                  className={`risk-input ${shakeApiKey ? 'shake-red' : ''}`}
                  value={asterApiKey}
                  onChange={(e) => setAsterApiKey(e.target.value)}
                  placeholder="Enter your Aster API key"
                />
              </div>

              <div className="risk-form-group">
                <label className="risk-label">Capital Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`risk-input ${shakeCapital ? 'shake-red' : ''}`}
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  placeholder="Enter capital amount"
                />
              </div>

              <div className="risk-form-group">
                <label className="risk-label">
                  Take Profit: {formatPercentage(takeProfit)}
                </label>
                <div className="risk-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(Number(e.target.value))}
                    className="risk-slider"
                  />
                  <div className="risk-slider-labels">
                    <span>None</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              <div className="risk-form-group">
                <label className="risk-label">
                  Stop Loss: {formatPercentage(stopLoss)}
                </label>
                <div className="risk-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(Number(e.target.value))}
                    className="risk-slider"
                  />
                  <div className="risk-slider-labels">
                    <span>None</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              <button className="risk-save-button" onClick={handleStart}>
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PerpFarming
