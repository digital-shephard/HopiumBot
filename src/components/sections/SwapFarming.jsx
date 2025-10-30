import './SwapFarming.css'

function SwapFarming() {
  return (
    <div className="section swap-farming">
      <div className="section-content">
        <h1 className="section-title">Swap Farming</h1>
        <p className="section-description">
          Maximize your returns through automated swap farming strategies
        </p>
        
        <div className="wallet-diamond">
          <div className="wallet-circle wallet-metamask">
            <div className="wallet-icon">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
                <path d="M21.99 4.706L12.451 0l-9.44 4.706L3.179 6.5l9.272-4.47 9.272 4.47 1.268-1.794z" fill="#F6851B"/>
                <path d="M3.179 6.5v11.293l9.272 4.47 9.272-4.47V6.5L12.451 2.03 3.179 6.5z" fill="#E2761B"/>
                <path d="M3.179 6.5l9.272 4.47v15.763l-9.272-4.47V6.5z" fill="#CD6116"/>
                <path d="M21.99 6.5v11.293l-9.272 4.47V10.97l9.272-4.47z" fill="#E89C35"/>
                <path d="M12.451 10.97v15.763l9.272-4.47V6.5l-9.272 4.47z" fill="#F6851B"/>
                <path d="M3.179 17.793l9.272 4.47V10.97L3.179 6.5v11.293z" fill="#E2761B"/>
              </svg>
            </div>
            <span className="wallet-label">Metamask</span>
          </div>

          <div className="wallet-circle wallet-rainbow">
            <div className="wallet-icon">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="url(#rainbowGradient)"/>
                <defs>
                  <linearGradient id="rainbowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FF0080"/>
                    <stop offset="25%" stopColor="#FF8C00"/>
                    <stop offset="50%" stopColor="#FFD700"/>
                    <stop offset="75%" stopColor="#00FF00"/>
                    <stop offset="100%" stopColor="#00BFFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="wallet-label">Rainbow</span>
          </div>

          <div className="wallet-circle wallet-rabbit">
            <div className="wallet-icon">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#00D9FF"/>
                <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#00A8CC"/>
              </svg>
            </div>
            <span className="wallet-label">Rabby</span>
          </div>

          <div className="wallet-circle wallet-misc">
            <div className="wallet-icon">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#9D4EDD"/>
              </svg>
            </div>
            <span className="wallet-label">Misc</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SwapFarming
