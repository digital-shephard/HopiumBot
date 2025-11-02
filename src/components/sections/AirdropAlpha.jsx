import { useState, useEffect } from 'react'
import './AirdropAlpha.css'
import logo from '../../assets/logo.webp'
import airdropService from '../../services/airdrop'
import FarmingGuideModal from './FarmingGuideModal'

// HOPIUM BOT is always the first airdrop (hardcoded, no API needed)
const HOPIUM_BOT_AIRDROP = { 
  id: 0, 
  name: 'HOPIUM BOT', 
  description: 'Crypto Farming Bot', 
  status: 'Active',
  farmingGuide: null
}

function AirdropAlpha({ onNavigateToHopium }) {
  // Start with HOPIUM BOT already in the list
  const [airdrops, setAirdrops] = useState([HOPIUM_BOT_AIRDROP])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedAirdrop, setSelectedAirdrop] = useState(null)

  // Fetch additional airdrops from API on mount
  useEffect(() => {
    fetchAirdrops()
  }, [])

  const fetchAirdrops = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch additional airdrops from API (no auth required - public endpoint)
      const result = await airdropService.listAirdrops(null, 50, 0)
      
      // Add API airdrops after HOPIUM BOT
      if (result.airdrops && result.airdrops.length > 0) {
        setAirdrops([HOPIUM_BOT_AIRDROP, ...result.airdrops])
      }
      // If no API airdrops, keep just HOPIUM BOT (already in state)
    } catch (err) {
      console.error('Failed to fetch airdrops:', err)
      setError(err.message)
      
      // On error, keep HOPIUM BOT (already in state from initial useState)
      // No need to setAirdrops again - it already has HOPIUM BOT
    } finally {
      setLoading(false)
    }
  }

  const handleAirdropClick = (airdrop) => {
    // If it's the HOPIUM BOT fallback or has no farming guide, navigate to Hopium section
    if (airdrop.id === 0 || !airdrop.farmingGuide) {
      if (onNavigateToHopium) {
        onNavigateToHopium()
      }
    } else {
      // Show farming guide modal
      setSelectedAirdrop(airdrop)
    }
  }

  const closeModal = () => {
    setSelectedAirdrop(null)
  }

  return (
    <div className="section airdrop-alpha">
      <div className="airdrop-layout">
        {/* Left side - Robot Illustration */}
        <div className="robot-illustration-container">
          <div className="robot-illustration">
            <img src={logo} alt="Hopium Bot Logo" className="robot-logo-large" />
          </div>
        </div>

        {/* Right side - Speech Box */}
        <div className="speech-box-container">
          <div className="giant-speech-box">
            <div className="speech-box-header">
              <h2 className="speech-box-title">NEED ALPHA?</h2>
            </div>
            <div className="speech-box-content">
              {/* Show error banner if API failed (doesn't hide airdrops) */}
              {error && !loading && (
                <div className="airdrop-error-banner">
                  <p>⚠️ Failed to load additional airdrops</p>
                  <button onClick={fetchAirdrops} className="retry-button-small">
                    Retry
                  </button>
                </div>
              )}
              
              {/* Show loading spinner while fetching */}
              {loading && (
                <div className="airdrop-loading-banner">
                  <div className="loading-spinner-small"></div>
                  <p>Loading additional airdrops...</p>
                </div>
              )}

              {/* Always show airdrop list (HOPIUM BOT is always there) */}
              <div className="airdrop-list">
                {airdrops.map((airdrop) => (
                  <div
                    key={airdrop.id}
                    className="airdrop-rectangle"
                    onClick={() => handleAirdropClick(airdrop)}
                  >
                    <div className="airdrop-name">{airdrop.name}</div>
                    <div className="airdrop-description">{airdrop.description}</div>
                    <div className={`airdrop-status ${airdrop.status.toLowerCase().replace(' ', '-')}`}>
                      {airdrop.status}
                    </div>
                    {airdrop.farmingGuide?.difficulty && (
                      <div className={`airdrop-difficulty ${airdrop.farmingGuide.difficulty.toLowerCase()}`}>
                        {airdrop.farmingGuide.difficulty}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Farming Guide Modal */}
      {selectedAirdrop && (
        <FarmingGuideModal 
          airdrop={selectedAirdrop} 
          onClose={closeModal} 
        />
      )}
    </div>
  )
}

export default AirdropAlpha
