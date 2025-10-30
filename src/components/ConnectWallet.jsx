import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { motion } from 'framer-motion'
import './ConnectWallet.css'

function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useAppKit()

  const handleConnect = async () => {
    await open()
  }

  const handleDisconnect = () => {
    disconnect()
  }

  const formatAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <motion.div 
      className="connect-wallet-widget"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {isConnected ? (
        <div className="wallet-connected">
          <div className="wallet-status-indicator"></div>
          <span className="wallet-address">{formatAddress(address)}</span>
          <button 
            className="disconnect-button"
            onClick={handleDisconnect}
            aria-label="Disconnect wallet"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path 
                d="M12 4 L4 12 M4 4 L12 12" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <button 
          className="connect-button"
          onClick={handleConnect}
          aria-label="Connect wallet"
        >
          Connect Wallet
        </button>
      )}
    </motion.div>
  )
}

export default ConnectWallet
