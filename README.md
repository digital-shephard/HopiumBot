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
    │   └── walletConnect.js  # WalletConnect configuration
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
2. Create a `.env` file in the root directory
3. Add your project ID:

```
VITE_WALLETCONNECT_PROJECT_ID=your-project-id-here
```

The app supports multiple wallet connectors:
- WalletConnect (mobile and desktop)
- Injected wallets (MetaMask, etc.)
- Coinbase Wallet
