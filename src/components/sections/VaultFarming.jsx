import { motion } from 'framer-motion'
import './VaultFarming.css'

function VaultFarming() {
  const whitepaperUrl = '/whitepaper'
  
  return (
    <motion.div 
      className="vault-farming"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="vault-container">
        <div className="vault-header">
          <h1 className="vault-title">VAULT</h1>
          <p className="vault-subtitle">Coming Soon</p>
        </div>
        
        <div className="vault-content">
          <div className="vault-box">
            <p className="vault-tagline">
              Community-governed perpetual futures pool with dynamic capital allocation
            </p>
            <p className="vault-description">
              Liquidation-resistant trading strategies powered by continuous governance and AI-driven risk management
            </p>
            
            <a 
              href={whitepaperUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="whitepaper-link"
            >
              Read the Whitepaper →
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default VaultFarming

