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
    │   ├── websocket.js      # WebSocket configuration
    │   └── api.js            # API configuration for HopiumCore API (includes Tasks endpoints)
    ├── types/
    │   └── websocket.d.ts    # TypeScript type definitions for WebSocket API
    ├── services/
    │   ├── websocket.js      # WebSocket client service
    │   ├── orderManager.js   # Order lifecycle management service
    │   └── dex/              # DEX service abstraction layer
    │       ├── DexService.js         # Abstract DEX service interface
    │       └── aster/               # Aster Finance implementation
    │           ├── AsterDexService.js # Aster DEX service
    │           └── AsterApiClient.js  # Aster API HTTP client
    └── components/
        ├── LandingScreen.jsx    # Landing screen component
        ├── LandingScreen.css    # Landing screen styles
        ├── HomePage.jsx         # Homepage carousel component
        ├── HomePage.css         # Homepage styles
        ├── RobotWidget.jsx      # Robot widget component (top left)
        ├── RobotWidget.css      # Robot widget styles
        ├── ConnectWallet.jsx    # Connect wallet widget (top right)
        ├── ConnectWallet.css    # Connect wallet styles
        ├── DevToggle.jsx        # Dev tools toggle (dev mode only)
        ├── DevToggle.css        # Dev toggle styles
        └── sections/
            ├── HopiumFarming.jsx    # HOPIUM Farming section
            ├── HopiumFarming.css   # HOPIUM Farming styles
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
  - HOPIUM Farming
    - **Tasks System**: Complete tasks to earn HOPIUM tokens
      - **Join Discord** (500 points): Connect your Discord account via OAuth and join the server
      - **Refer Friends** (1000 points each): Share your referral code and earn points when friends complete Discord task
    - **Points Tracker**: Real-time display of user's accumulated points with ranking
    - **Leaderboard**: Live leaderboard showing top 10 performers
    - **Referral System**: 
      - Auto-generated referral code for each wallet
      - Track referrals (total, completed, pending)
      - View referral points earned
    - **Wallet Required**: Users must connect their wallet to track points and complete tasks
    - **Auto-Registration**: Users are automatically registered when connecting wallet
    - **API Integration**: Full integration with HopiumCore Tasks API
  - Perp Farming
    - **Risk Settings Modal**: Configure Aster API credentials, capital limits, Take Profit, Stop Loss, and Position Size
      - Fixed scrollbar clipping issue with proper container structure and overflow handling
    - **Automated Trading**: Connects to WebSocket for real-time market recommendations
    - **Order Management**: Automatically places orders, monitors positions, and enforces TP/SL
    - Settings are saved to localStorage and persist across sessions
  - Airdrop Alpha
- **Robot Widget**: Animated robot widget in the top left corner with speech bubbles
  - **Sentiment Analysis**: In the Perp Farming section, users can click "Give me the sentiment" to fetch real-time BTC sentiment analysis from the HopiumCore API
  - Shows animated "Lemme think about this..." loading state while fetching
  - Streams LLM-generated market summaries and entry recommendations
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

## API Integration

The project integrates with the HopiumCore API for market data, sentiment analysis, and airdrop tasks.

### API Configuration

- **`src/config/api.js`**: Configuration for API base URLs and endpoints
  - Development URL: `http://localhost:8080`
  - Production URL: `https://api.hopiumbot.com`
  - Automatically detects environment based on hostname
  - **Dev Toggle**: When running locally, you can toggle between dev and prod APIs:
    - **UI Toggle**: Click the gear icon (⚙️) in the bottom right corner (dev mode only)
    - **Console**: `localStorage.setItem('api_use_prod', 'true')` to use production API
    - Setting persists across page reloads

### HopiumTasks API Endpoints

The API includes a complete tasks/airdrop system:

**User Management**:
- `POST /api/tasks/user/register` - Register a new user
- `GET /api/tasks/user/{wallet_address}` - Get user profile with tasks and referral stats

**Discord OAuth**:
- `GET /api/tasks/discord/auth?wallet_address={address}` - Get Discord OAuth URL
- `GET /api/tasks/discord/callback` - OAuth callback (handles Discord verification)

**Referrals**:
- `POST /api/tasks/referral/enter` - Submit a referral code
- `GET /api/tasks/referral/{wallet_address}` - Get referral stats

**Leaderboard**:
- `GET /api/tasks/leaderboard?limit={n}&offset={n}` - Get leaderboard entries
- `GET /api/tasks/leaderboard/user/{wallet_address}` - Get user's rank

**Points System**:
- Join Discord: 500 points (verified via OAuth)
- Refer Friend: 1000 points (when friend joins Discord)

### Sentiment Feature

In the Perp Farming section, when the robot widget is expanded, users can click the "Give me the sentiment" button to:
1. Fetch real-time BTC sentiment analysis from `/api/perps/snapshot`
2. Display an animated "Lemme think about this..." loading state
3. Stream the LLM-generated summary with entry recommendations

The API response includes:
- Market insights and trends
- Entry recommendations (side, price, order type)
- Reasoning for the recommendation

See `API_INTEGRATION_GUIDE.md` for complete API documentation.

## WebSocket Integration

The project includes a fully functional WebSocket client for integrating with the HopiumCore API. The WebSocket connection is automatically established when trading is started in the Perp Farming section.

### WebSocket Files

- **`src/config/websocket.js`**: Configuration for WebSocket URLs and connection settings
  - Development URL: `ws://localhost:8080/ws`
  - Production URL: To be configured later
  
- **`src/types/websocket.d.ts`**: TypeScript type definitions for all WebSocket messages and data structures
  - Message types (subscribe, unsubscribe, summary, alert, etc.)
  - Market data structures (snapshot, trends, indicators)
  - LLM summary and entry recommendations
  
- **`src/services/websocket.js`**: WebSocket client service class
  - `HopiumWebSocketClient` class with full connection implementation
  - Event handlers for summary, alert, and error messages
  - Automatic subscription management

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

// Connect and subscribe
await client.connect()
client.subscribe('BTCUSDT', 'range_trading') // strategy is optional, defaults to 'range_trading'
```

### WebSocket Message Types

The client supports the following message types:
- **Client-to-Server**: `subscribe`, `unsubscribe`, `list_subscriptions`, `ping`
- **Server-to-Client**: `summary`, `alert`, `error`, `subscribed`, `unsubscribed`, `subscriptions`, `pong`

See `src/types/websocket.d.ts` for complete type definitions.

### Trading Strategies

The WebSocket client supports multiple trading strategies when subscribing to a symbol:

- **Range Trading** (`range_trading`, default):
  - Mean-reversion strategy based on 24h range
  - Trades bounces off support/resistance levels
  - Signal frequency: Every 1 minute (when price is in entry zones)
  - Best for: Sideways/ranging markets

- **Momentum** (`momentum`):
  - AI-powered trend-following strategy
  - Uses GPT-5 analysis for trade decisions
  - Signal frequency: Every 5 minutes or on significant market changes
  - Best for: Trending markets with clear momentum

Strategy is selected when subscribing to a symbol and can be changed by unsubscribing and resubscribing with a different strategy. All WebSocket messages are logged to the console for debugging.

## DEX Integration Architecture

The project supports modular DEX integrations for trading. Currently supports Aster Finance, with architecture designed for easy addition of other DEXs (Hyperliquid, etc.).

### Architecture Overview

- **Abstract Layer**: `DexService` interface defines the contract all DEX implementations must follow
- **Implementation**: Each DEX (Aster, Hyperliquid, etc.) has its own implementation
- **Order Management**: `OrderManager` handles order lifecycle, TP/SL monitoring, and position management
- **Client-Side Only**: All API keys and trading logic runs in the browser - never sent to server

### DEX Service Structure

```
src/services/dex/
├── DexService.js          # Abstract base class
└── aster/
    ├── AsterDexService.js   # Aster implementation
    └── AsterApiClient.js     # HTTP client for Aster API
```

### Features

- **Modular Design**: Easy to add new DEXs by implementing `DexService`
- **Order Lifecycle**: Automatic order placement, status polling, and position monitoring
- **Risk Management**: Built-in take profit and stop loss enforcement
- **Rate Limiting**: Respects API rate limits (Aster: 2400 requests/minute)
- **Precision Handling**: Automatically fetches and applies symbol-specific precision for quantities and prices
- **Error Handling**: Graceful error handling with user-friendly messages

### OrderManager Service

The `OrderManager` service handles:
- **WebSocket Integration**: Listens to server recommendations via WebSocket
- **Order Placement**: Places LIMIT orders when server recommends entry
- **Status Polling**: Checks order status every 4 seconds (within rate limits)
- **Position Monitoring**: Monitors positions for TP/SL triggers every 5 seconds
- **Position Size Limits**: Enforces user-defined position size percentages
- **Capital Limits**: Respects user-defined capital limits

### Perp Farming Settings

In the Perp Farming section, users can configure:
- **Aster API Key**: Required for trading (validated when clicking "Start")
- **Aster API Secret**: Required for signing requests (validated when clicking "Start")
- **Capital Amount**: Maximum capital to use for trading
- **Take Profit**: Percentage for automatic profit taking (0-100%)
- **Stop Loss**: Percentage for automatic stop loss (0-100%)
- **Position Size**: Percentage of capital per position (1-100%, default 10%)
  - Visual indicator: Green (1-50%) → Yellow (50-75%) → Red (75-100%)
- **Trading Strategy**: Choose between two trading strategies:
  - **Range Trading** (default): Mean-reversion strategy that trades bounces off 24h support/resistance levels
  - **Momentum**: LLM-powered trend-following strategy using GPT-5 analysis

All settings are stored in localStorage and persist across sessions.

### Trading Flow

1. User configures settings and clicks "Start"
2. **API Key Validation**: Credentials are validated against Aster API (fields shake red if invalid)
3. `OrderManager` initializes with Aster credentials
4. WebSocket connects to HopiumCore API
5. WebSocket subscribes to BTCUSDT (default symbol)
6. When server sends summary with entry recommendation:
   - `OrderManager` checks for existing positions/orders
   - Calculates position size based on available balance and settings
   - Places LIMIT order via Aster API
   - Tracks order until filled
7. Once filled, monitors position for TP/SL triggers
8. Automatically closes position when TP/SL is hit

### Error Handling

Errors are displayed in the RobotWidget component:
- API credential errors
- Network errors
- Insufficient balance
- Rate limit warnings
- Order placement failures

Errors don't stop trading - the bot continues with future orders.
