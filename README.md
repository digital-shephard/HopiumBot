# HOPIUM

A trading bot experience built with React.

## Project Structure

```
HopiumBot/
├── index.html              # HTML entry point
├── package.json            # Dependencies and scripts
├── vite.config.js         # Vite configuration
├── README.md              # Project documentation
└── src/
    ├── main.jsx           # React entry point
    ├── App.jsx            # Main app component
    ├── index.css          # Global styles
    ├── config/
    │   ├── walletConnect.js  # WalletConnect configuration
    │   └── websocket.js      # WebSocket configuration
    ├── types/
    │   └── websocket.d.ts    # TypeScript type definitions for WebSocket API
    ├── services/
    │   └── websocket.js      # WebSocket client service (staged)
    └── components/
        ├── LandingScreen.jsx    # Landing screen component
        ├── LandingScreen.css    # Landing screen styles
        ├── HomePage.jsx         # Homepage carousel component
        ├── HomePage.css         # Homepage styles
        ├── RobotWidget.jsx      # Robot widget component (top left)
        ├── RobotWidget.css      # Robot widget styles
        ├── ConnectWallet.jsx    # Connect wallet widget (top right)
        ├── ConnectWallet.css    # Connect wallet styles
        └── sections/
            ├── SwapFarming.jsx      # Swap Farming section
            ├── SwapFarming.css     # Swap Farming styles
            ├── PerpFarming.jsx      # Perp Farming section
            ├── PerpFarming.css     # Perp Farming styles
            ├── AirdropAlpha.jsx    # Airdrop Alpha section
            └── AirdropAlpha.css    # Airdrop Alpha styles
```

## Getting Started

### Installation

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Build for production:

```bash
npm run build
```

### Preview

Preview the production build:

```bash
npm run preview
```

## Features

- **Landing Screen**: Fullscreen view with a steel door in a brick wall (CSS representation)
- **Interactive Door**: Type "AURA" to unlock and open the door
- **Homepage Carousel**: Smooth horizontal carousel with three sections:
  - Swap Farming
  - Perp Farming
    - **Risk Settings Modal**: Configure Aster API key, Take Profit percentage (0-100%), and Stop Loss percentage (0-100%)
    - Settings are saved to localStorage and persist across sessions
  - Airdrop Alpha
- **Robot Widget**: Animated robot widget in the top left corner with speech bubbles
- **Connect Wallet**: WalletConnect integration widget in the top right corner
- **Buttery Smooth Animations**: Powered by Framer Motion for silky transitions
- **Mobile Responsive**: Fully responsive design with touch swipe gestures for carousel navigation
- **Touch Gestures**: Swipe left/right to navigate between sections on mobile devices
- Modern React setup with Vite
- No-scroll, fullscreen experience

## Tech Stack

- React 18
- Vite
- Framer Motion (for smooth animations)
- Reown AppKit (for wallet connectivity via WalletConnect)
- Wagmi (for Ethereum interactions)
- Viem (for Ethereum utilities)
- CSS3 (for styling)

## WalletConnect Setup

To use WalletConnect, you need to:

1. Get a Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/)
2. Create a `.env` file in the root directory (for local development)
3. Add your project ID:

```
VITE_WALLETCONNECT_PROJECT_ID=your-project-id-here
```

The app supports multiple wallet connectors:
- WalletConnect (mobile and desktop)
- Injected wallets (MetaMask, etc.)
- Coinbase Wallet

### Vercel Deployment

To deploy to Vercel with the WalletConnect Project ID:

1. Go to your project on [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name**: `VITE_WALLETCONNECT_PROJECT_ID`
   - **Value**: Your WalletConnect Project ID
   - **Environments**: Select Production, Preview, and/or Development as needed
4. Click **Save**
5. **Redeploy** your project for the changes to take effect

**Note**: After adding the environment variable, Vercel will automatically trigger a new deployment. If it doesn't, manually redeploy from the Deployments tab.

## WebSocket Integration

The project includes WebSocket data structures and client setup for integrating with the HopiumCore API. Currently, the data structures are staged but connections are not yet implemented.

### WebSocket Files

- **`src/config/websocket.js`**: Configuration for WebSocket URLs and connection settings
  - Development URL: `ws://localhost:8080/ws`
  - Production URL: To be configured later
  
- **`src/types/websocket.d.ts`**: TypeScript type definitions for all WebSocket messages and data structures
  - Message types (subscribe, unsubscribe, summary, alert, etc.)
  - Market data structures (snapshot, trends, indicators)
  - LLM summary and entry recommendations
  
- **`src/services/websocket.js`**: WebSocket client service class
  - `HopiumWebSocketClient` class with methods for subscription management
  - Event handlers for summary, alert, and error messages
  - Connection functionality staged but not yet implemented

### Usage Example

```javascript
import { HopiumWebSocketClient } from './services/websocket'

const client = new HopiumWebSocketClient()

// Set up event handlers
client.onSummary = (data) => {
  console.log('New summary:', data.summary)
  console.log('Entry recommendation:', data.summary.entry)
}

client.onAlert = (data) => {
  console.warn('Alert:', data.change_type, data.description)
}

// Connection will be implemented later
// await client.connect()
// client.subscribe('BTCUSDT')
```

### WebSocket Message Types

The client supports the following message types:
- **Client-to-Server**: `subscribe`, `unsubscribe`, `list_subscriptions`, `ping`
- **Server-to-Client**: `summary`, `alert`, `error`, `subscribed`, `unsubscribed`, `subscriptions`, `pong`

See `src/types/websocket.d.ts` for complete type definitions.
