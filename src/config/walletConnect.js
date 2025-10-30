import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, arbitrum, optimism } from 'wagmi/chains'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

// Get projectId from environment variable
export const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'your-project-id-here'

const metadata = {
  name: 'Hopium Bot',
  description: 'A trading bot experience - HOPIUM',
  url: 'https://hopiumbot.com',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

const chains = [mainnet, sepolia, arbitrum, optimism]

// Create Wagmi adapter - pass networks (chains) and projectId
const wagmiAdapter = new WagmiAdapter({
  networks: chains,
  projectId
})

// Get the wagmi config from the adapter
export const wagmiConfig = wagmiAdapter.wagmiConfig

// Initialize AppKit - needs both networks and adapters
createAppKit({
  adapters: [wagmiAdapter],
  networks: chains, // Add networks directly to createAppKit
  projectId,
  metadata,
  features: {
    analytics: false
  }
})