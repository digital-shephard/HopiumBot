import './AirdropAlpha.css'
import logo from '../../assets/logo.webp'

// Sample airdrop data - replace with real data later
const sampleAirdrops = [
  { id: 1, name: 'HOPIUM BOT', description: 'Crypto Farming Bot', status: 'Active' },
]

function AirdropAlpha({ onNavigateToHopium }) {
  const handleAirdropClick = () => {
    // Navigate to HOPIUM Farming section (index 1)
    if (onNavigateToHopium) {
      onNavigateToHopium()
    }
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
                    onClick={handleAirdropClick}
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
    </div>
  )
}

export default AirdropAlpha
