import { useState } from 'react'
import './AirdropAlpha.css'
import logo from '../../assets/logo.webp'

// Sample airdrop data - replace with real data later
const sampleAirdrops = [
  { id: 1, name: 'HOPIUM BOT', description: 'Crypto Farming Bot', status: 'Upcoming' },
  { id: 2, name: 'LayerZero', description: 'Omnichain interoperability', status: 'Claimable' },
  { id: 3, name: 'Starknet', description: 'ZK-Rollup scaling solution', status: 'Claimable' },
  { id: 4, name: 'ZKSync', description: 'Layer 2 scaling protocol', status: 'Upcoming' },
  { id: 5, name: 'Celestia', description: 'Modular blockchain network', status: 'Claimable' },
]

function AirdropAlpha() {
  const [selectedAirdrop, setSelectedAirdrop] = useState(null)

  const handleAirdropClick = (airdrop) => {
    setSelectedAirdrop(airdrop)
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
              <div className="airdrop-list">
                {sampleAirdrops.map((airdrop) => (
                  <div
                    key={airdrop.id}
                    className="airdrop-rectangle"
                    onClick={() => handleAirdropClick(airdrop)}
                  >
                    <div className="airdrop-name">{airdrop.name}</div>
                    <div className="airdrop-description">{airdrop.description}</div>
                    <div className={`airdrop-status ${airdrop.status.toLowerCase()}`}>
                      {airdrop.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedAirdrop && (
        <div className="airdrop-modal-overlay" onClick={closeModal}>
          <div className="airdrop-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            <h2 className="modal-title">{selectedAirdrop.name}</h2>
            <div className="modal-content">
              <p className="modal-description">{selectedAirdrop.description}</p>
              <div className="modal-section">
                <h3>How to Participate</h3>
                <p>Detailed participation instructions will be available here...</p>
              </div>
              <div className="modal-section">
                <h3>Estimated Value</h3>
                <p>TBD</p>
              </div>
              <div className="modal-section">
                <h3>Status</h3>
                <span className={`modal-status ${selectedAirdrop.status.toLowerCase()}`}>
                  {selectedAirdrop.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AirdropAlpha
