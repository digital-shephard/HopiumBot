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
   │   └── api.js            # API configuration for HopiumCore API (includes Tasks endpoints and auth)
   ├── contexts/
   │   └── AuthContext.jsx   # Authentication context for wallet-based auth state management
   ├── hooks/
   │   └── useWebSocket.js   # React hook for authenticated WebSocket connections
   ├── types/
   │   └── websocket.d.ts    # TypeScript type definitions for WebSocket API
   ├── services/
   │   ├── auth.js           # Authentication service (wallet signature-based)
   │   ├── websocket.js      # WebSocket client service (with JWT auth)
   │   ├── orderManager.js   # Order lifecycle management service (includes Smart Mode logic)
   │   ├── airdrop.js        # Airdrop service for fetching opportunities
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
       ├── AuthStatus.jsx       # Authentication status indicator
       ├── AuthStatus.css       # Authentication status styles
       ├── DevToggle.jsx        # Dev tools toggle (dev mode only)
       ├── DevToggle.css        # Dev toggle styles
       └── sections/
           ├── HopiumFarming.jsx      # HOPIUM Farming section (Farm)
           ├── HopiumFarming.css     # HOPIUM Farming styles
           ├── PerpFarming.jsx        # Perp Farming section (Perps Bot)
           ├── PerpFarming.css       # Perp Farming styles
           ├── AirdropAlpha.jsx      # Airdrop Alpha section (Alpha)
           ├── AirdropAlpha.css      # Airdrop Alpha styles
           ├── FarmingGuideModal.jsx # Farming guide modal component
           ├── FarmingGuideModal.css # Farming guide modal styles
           ├── VaultFarming.jsx      # Vault section (Vault)
           └── VaultFarming.css      # Vault styles
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
- **Wallet Authentication**: 
  - **Signature-Based Auth**: Secure authentication using wallet signatures (EIP-4361)
  - **Automatic Flow**: Connect wallet → Sign message → Get JWT token
  - **Session Persistence**: Auth token persists in sessionStorage (24h expiry)
  - **Auto Re-auth**: Automatically re-authenticates on wallet switch or token expiry
  - **Visual Feedback**: Real-time status indicator showing auth state, errors, and retry options
  - **Protected Endpoints**: Automatic auth token injection for API requests
- **Homepage Carousel**: Smooth horizontal carousel with four sections:
  - **Perps Bot**: Automated perpetual futures trading
    - **Risk Settings Modal**: Configure Aster API credentials, capital limits, Take Profit, Stop Loss, and Position Size
      - Fixed scrollbar clipping issue with proper container structure and overflow handling
    - **Auto Mode** 🤖 (Hourly Scanner): Fully automated multi-pair trading system
      - **Automatic Operation**: Scans ALL available pairs every hour, selects best 3-5 opportunities
      - **Even Capital Split**: Divides capital equally among selected pairs
      - **Leverage Optimization**: Automatically queries and applies max leverage per symbol via Aster API
        - Fetches leverage brackets using `GET /fapi/v1/leverageBracket`
        - Sets optimal leverage using `POST /fapi/v1/leverage` before each trade
        - Respects notional limits and position size restrictions per pair
      - **MARKET Orders Only**: Auto Mode uses instant market fills (no limit orders)
      - **Mid-Hour Rebalancing** (XX:30): Closes weak performers (down >1.5%), opens new exceptional opportunities
      - **Hour-End Close** (XX:59): Automatically closes ALL positions at end of each hour
      - **WebSocket Integration**: Receives `hourly_opportunities`, `mid_hour_opportunities`, `position_update`, and `hour_end` broadcasts
      - **UI Simplification**: When enabled, hides manual strategy settings (pair selection, Smart Mode, order type, etc.)
      - **Capital Respecting**: Still uses user's capital, TP/SL settings, but ignores manual pair/strategy selection
    - **Exit Strategy Modes**:
      - **Smart Mode** 🧠: Active position management for capital preservation (enabled by default)
      - **Confidence Monitoring**: Continuously monitors server confidence (high/medium/low) for open positions
      - **Early Exit Conditions**:
        1. **Signal Reversal**: Exits immediately if market direction flips (LONG→SHORT or SHORT→LONG)
        2. **Low Confidence + 50% to Stop Loss**: Exits when confidence drops to low AND position is >50% toward stop loss
        3. **2 Consecutive Low Signals**: Exits after receiving 2 consecutive low confidence signals
      - **Minimum PNL Threshold**: Configurable minimum Net PNL required before Smart Mode can exit (default: -$50)
        - Set to 0 to only allow Smart Mode exits at breakeven or better
        - Prevents Smart Mode from closing positions that are too far in the red
        - Normal TP/SL still applies regardless of this threshold
      - **PNL Calculation**: Uses net PNL after fees (0.02% entry + 0.02% exit) for accurate risk assessment
      - **Bot Widget Integration**: Displays server reasoning and Smart Mode exit statements
        - Shows reasoning from server during normal operation
        - Displays random exit statement (24 variations) when Smart Mode triggers
        - Statements persist until next signal for clarity
      - **Signal History Tracking**: Tracks last 5 signals per position for pattern detection
      - **Disable Option**: Can be toggled off for manual TP/SL-only management
      - **Simple Break-Even Mode** 💰: Volume farming mode with loss tolerance
        - Closes positions when Net PNL ≥ $0 (after fees)
        - **Loss Tolerance**: Configurable tolerance (default: $20) for accepting near-breakeven exits
        - **Smart Exit Logic**: If PnL gets close to breakeven (e.g., -$15) then falls back into loss, it will close the position when it returns within the tolerance threshold (e.g., -$12 with -$20 tolerance)
        - Tracks best (closest to breakeven) PnL achieved and closes if current PnL is within tolerance
        - Perfect for minimizing risk while accumulating trading volume
      - **Trailing Break-Even Mode** 📈: Dynamic profit protection
        - Trails stop-loss from peak profit to lock in gains
        - Configurable activation threshold (2x/3x/5x fees, $50, $100)
        - Configurable trailing distance (5%, 10%, 15%, 20%)
    - **Automated Trading**: Connects to WebSocket for real-time market recommendations
    - **Order Management**: Automatically places orders, monitors positions, and enforces TP/SL
    - Settings are saved to localStorage and persist across sessions
  - **Airdrop**: HOPIUM token farming through tasks
    - **Tasks System**: Complete tasks to earn HOPIUM tokens
      - **Join Discord** (500 points): Connect your Discord account via OAuth and join the server
      - **Follow on X** (1000 points): Follow @hopiumbot on X/Twitter (requires Discord membership)
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
  - **Alpha**: Airdrop opportunities and alpha insights
    - **Real-time Airdrops**: Live airdrop opportunities fetched from Discord
    - **Farming Guides**: Detailed step-by-step farming instructions for each airdrop
    - **Difficulty Ratings**: Easy/Medium/Hard/Expert difficulty indicators
    - **Interactive Modal**: Click any airdrop to view comprehensive farming guide
    - **Smart Fallback**: Shows HOPIUM BOT when no airdrops available
    - **Auto-refresh**: Automatically displays new airdrops posted in Discord
  - **Vault**: Community-governed perpetual futures pool (coming soon)
    - Dynamic capital allocation
    - Liquidation-resistant trading strategies
    - Continuous governance with AI-driven risk management
    - Links to whitepaper for full protocol details
- **Robot Widget**: Animated robot widget in the top left corner with speech bubbles
  - **Sentiment Analysis**: In the Perp Farming section, users can click "Give me the sentiment" to fetch real-time BTC sentiment analysis from the HopiumCore API
  - Shows animated "Lemme think about this..." loading state while fetching
  - Streams LLM-generated market summaries and entry recommendations
  - **Smart Mode Integration**: Displays server reasoning and Smart Mode exit statements in real-time
    - Normal operation: Shows reasoning from WebSocket signals
    - Smart exit: Shows random statement explaining why position was closed early
    - Statements persist until next signal arrives
- **Connect Wallet**: WalletConnect integration widget in the top right corner
- **Buttery Smooth Animations**: Powered by Framer Motion for silky transitions
- **Mobile Responsive**: Fully responsive design with touch swipe gestures for carousel navigation
  - **Perp Farming Displays**: Equity and PnL displays dynamically reposition on small screens (iPhone SE and smaller)
    - Capital display moves to far left edge with optimized font sizes
    - Net PNL display moves to far right edge with optimized font sizes
    - Prevents overlap with circle container on narrow screens
- **Touch Gestures**: Swipe left/right to navigate between sections on mobile devices
- **Adaptive Navigation**: 
  - **Desktop/Large Screens**: Bottom carousel indicators for section navigation
  - **Small Screens** (height < 650px OR width < 800px): Hamburger menu on the left
    - Smooth slide-in drawer from the left side
    - Animated hamburger icon (transforms to X when open)
    - Click outside or on item to close
    - Prevents content overlap on limited screen space
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
  - **Auto Auth Headers**: Automatically includes JWT auth tokens for protected endpoints
  - **Dev Toggle**: When running locally, you can toggle between dev and prod APIs:
    - **UI Toggle**: Click the gear icon (⚙️) in the bottom right corner (dev mode only)
    - **Console**: `localStorage.setItem('api_use_prod', 'true')` to use production API
    - Setting persists across page reloads

### Authentication

The app uses **wallet signature-based authentication** for secure, passwordless access:

**Authentication Flow**:
1. Connect wallet (MetaMask, WalletConnect, etc.)
2. Sign authentication message (proves wallet ownership)
3. Receive JWT token (24h expiry)
4. Token automatically included in protected API requests

**Auth Endpoints**:
- `POST /api/auth/challenge` - Request authentication challenge
- `POST /api/auth/verify` - Verify signature and get JWT token

**Protected vs Public**:
- 🔒 **Protected** (require auth): User profile, task completion, referrals, Discord OAuth
- 🌐 **Public** (no auth): Market data, leaderboard, health check

See **[docs/AUTHENTICATION_GUIDE.md](docs/AUTHENTICATION_GUIDE.md)** for complete authentication documentation.  
See **[docs/TESTING_AUTH.md](docs/TESTING_AUTH.md)** for testing guide.

### HopiumTasks API Endpoints

The API includes a complete tasks/airdrop system:

**User Management** (🔒 Protected):
- `POST /api/tasks/user/register` - Register a new user
- `GET /api/tasks/user/{wallet_address}` - Get user profile with tasks and referral stats
- `POST /api/tasks/complete` - Complete a task

**Discord OAuth** (🔒 Protected):
- `GET /api/tasks/discord/auth?wallet_address={address}` - Get Discord OAuth URL
- `GET /api/tasks/discord/callback` - OAuth callback (handles Discord verification)

**Twitter Tasks** (🔒 Protected):
- `POST /api/tasks/twitter/follow` - Complete Twitter follow task

**Referrals** (🔒 Protected):
- `POST /api/tasks/referral/enter` - Submit a referral code
- `POST /api/tasks/referral/verify` - Verify referral completion
- `GET /api/tasks/referral/{wallet_address}` - Get referral stats

**Leaderboard** (🌐 Public):
- `GET /api/tasks/leaderboard?limit={n}&offset={n}` - Get leaderboard entries
- `GET /api/tasks/leaderboard/user/{wallet_address}` - Get user's rank

**Points System**:
- Join Discord: 500 points (verified via OAuth)
- Follow on X: 1000 points (requires Discord membership)
- Refer Friend: 1000 points (when friend joins Discord)

### AirdropAlpha API Endpoints

The API provides curated airdrop opportunities posted by moderators in Discord:

**Airdrops** (🌐 Public):
- `GET /api/airdrops?status={status}&limit={n}&offset={n}` - List airdrop opportunities
- `GET /api/airdrops/{id}` - Get specific airdrop with farming guide

**Airdrop Features**:
- **Discord Integration**: Airdrops posted in private Discord channel appear immediately
- **Farming Guides**: Step-by-step instructions with tips and warnings
- **Difficulty Ratings**: Easy, Medium, Hard, Expert
- **Status Tracking**: Active, Coming Soon, Ended
- **Requirements**: Prerequisites listed for each airdrop
- **Expected Rewards**: Estimated token amounts and criteria

**Example Airdrop Data**:
```json
{
  "id": 1,
  "name": "LayerZero",
  "description": "Omnichain Interoperability Protocol",
  "status": "Active",
  "farmingGuide": {
    "difficulty": "Medium",
    "estimatedTime": "20 minutes daily",
    "steps": [
      {
        "stepNumber": 1,
        "title": "Bridge Assets",
        "description": "Use Stargate to bridge USDC...",
        "tips": "Bridge at least $100 worth..."
      }
    ],
    "requirements": ["Multi-chain wallet", "Minimum $200"],
    "rewards": {
      "estimated": "1000-10000 tokens",
      "criteria": "Based on volume and frequency"
    },
    "warnings": ["No official airdrop confirmed", "DYOR"]
  }
}
```

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

The project includes a fully functional WebSocket client for integrating with the HopiumCore API. The WebSocket connection **requires authentication** and is automatically established when trading is started in the Perp Farming section.

### WebSocket Files

- **`src/config/websocket.js`**: Configuration for WebSocket URLs and connection settings
  - Development URL: `ws://localhost:8080/ws`
  - Production URL: `wss://api.hopiumbot.com/ws`
  - Same dev/prod toggle as API configuration
  
- **`src/types/websocket.d.ts`**: TypeScript type definitions for all WebSocket messages and data structures
  - Message types (subscribe, unsubscribe, summary, alert, etc.)
  - Market data structures (snapshot, trends, indicators)
  - LLM summary and entry recommendations
  
- **`src/services/websocket.js`**: WebSocket client service class
  - `HopiumWebSocketClient` class with full connection implementation
  - JWT authentication (token in URL query parameter)
  - Event handlers for summary, alert, and error messages
  - Automatic subscription management
  - Handles auth failures and reconnection
  
- **`src/hooks/useWebSocket.js`**: React hook for easy WebSocket usage
  - Auto-connect/disconnect based on auth state
  - Handles token expiration and reconnection
  - Subscription management
  - Real-time updates via state

### Authentication Required

WebSocket connections **require a valid JWT token** obtained through wallet authentication:

**Security Features**:
- ✅ Token-based authentication (JWT)
- ✅ Connection limit: 3 simultaneous connections per user
- ✅ Message rate limit: 30 messages/minute
- ✅ Subscription limit: 10 symbols per connection
- ✅ Auto-reconnect with exponential backoff

See **[docs/WEBSOCKET_SECURITY_GUIDE.md](docs/WEBSOCKET_SECURITY_GUIDE.md)** for detailed WebSocket authentication documentation.

### Usage Example

**Using the WebSocket Client Directly**:
```javascript
import { HopiumWebSocketClient } from './services/websocket'
import authService from './services/auth'

const client = new HopiumWebSocketClient()

// Set up event handlers
client.onSummary = (data) => {
  console.log('New summary:', data.summary)
  console.log('Entry recommendation:', data.summary.entry)
}

client.onAlert = (data) => {
  console.warn('Alert:', data.change_type, data.description)
}

client.onError = (error) => {
  if (error.payload?.requiresReauth) {
    console.error('Re-authentication required!')
  }
}

// Connect with authentication token
const token = authService.getToken()
await client.connect(token)

// Subscribe to symbol
client.subscribe('BTCUSDT', 'range_trading')
```

**Using the React Hook (Recommended)**:
```javascript
import { useWebSocket } from './hooks/useWebSocket'
import { useAuth } from './contexts/AuthContext'

function TradingComponent() {
  const { token, isAuthenticated } = useAuth()
  const { connected, subscribe, updates, error } = useWebSocket(token, isAuthenticated)
  
  useEffect(() => {
    if (connected) {
      subscribe('BTCUSDT', 'range_trading')
    }
  }, [connected])
  
  return (
    <div>
      <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      {error && <p>Error: {error}</p>}
      {updates.map(update => (
        <div key={update.timestamp}>
          {update.symbol}: {update.data.summary.entry.side}
        </div>
      ))}
    </div>
  )
}
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

- **Aggressive Reversion Scalping** (`scalp`):
  - Ultra-fast mean reversion strategy optimized for high leverage (75x recommended)
  - Uses 1-minute EMA and 5-minute range indicators
  - Signal frequency: Every 30 seconds when high-confidence opportunities detected
  - Expected hold time: 2-5 minutes per position
  - Best for: Volatile markets with quick reversions
  - Features automatic TP/SL based on volatility

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
- **Order Timeout**: Automatically cancels unfilled LIMIT orders after configurable timeout (30-300 seconds, default 120s)
- **Smart Order Replacement**: When a new signal arrives with an existing unfilled order, automatically cancels the old order and places the new one (responsive to changing market conditions)
- **Position Monitoring**: Monitors positions for TP/SL triggers every 5 seconds
- **Position Size Limits**: Enforces user-defined position size percentages
- **Capital Limits**: Respects user-defined capital limits

### Perp Farming Settings

In the Perp Farming section, users can configure:
- **Tracked Pairs**: Select up to 5 trading pairs to track simultaneously
  - Click the pair selection button at the top of settings
  - Server provides list of 30+ supported pairs via `/api/perps/symbols` (requires authentication)
  - Pairs are displayed with checkboxes for easy selection
  - Selection limited to 5 pairs maximum for optimal performance
  - Selected pairs saved to localStorage and persist across sessions
  - Automatically fetches available pairs when modal opens (with auth token)
- **Aster API Key**: Required for trading (validated when clicking "Start")
- **Aster API Secret**: Required for signing requests (validated when clicking "Start")
- **Capital Amount**: Maximum capital to use for trading
- **Take Profit**: Percentage for automatic profit taking (0-100%)
- **Stop Loss**: Percentage for automatic stop loss (0-100%)
- **Position Size**: Percentage of capital per position (1-100%, default 10%)
  - Visual indicator: Green (1-50%) → Yellow (50-75%) → Red (75-100%)
- **Order Type**: Choose between LIMIT (wait for specific price) or MARKET (instant fill)
- **Limit Order Timeout**: Configurable timeout for unfilled LIMIT orders (30-300 seconds, default 120s)
  - Automatically cancels stale orders to allow new signals
  - Only applies to LIMIT orders (MARKET orders fill instantly)
  - Note: If a new signal arrives before timeout, old order is cancelled immediately
- **Trading Strategy**: Choose between trading strategies:
  - **Range Trading** (default): Mean-reversion strategy that trades bounces off 24h support/resistance levels
  - **Momentum**: LLM-powered trend-following strategy using GPT-5 analysis
  - **Aggressive Reversion Scalping**: Ultra-fast 30-second signals optimized for 75x leverage

All settings are stored in localStorage and persist across sessions.

## Rate Limits & Concurrent Tracking

**Two Separate Rate Limit Pools:**

### **Backend (Shared) - Signal Generation:**
- **2,400 REQUEST_WEIGHT per minute** (shared across all users)
- Fetches market data to generate trading signals
- Pushes signals to users via WebSocket

**Backend Capacity:**
- **Scalp Strategy** (30s updates): ~120 pairs total
- **Range/Momentum** (1min updates): ~240 pairs total
- **Concurrent users**: 20-30 scalp users OR 50-100 other strategy users

### **Frontend (Per User) - Position Monitoring:**
- **2,400 REQUEST_WEIGHT per minute PER USER** (individual API keys)
- Monitors active orders: Every 2 seconds (30 calls/min per order)
- Monitors positions for TP/SL: Every 5 seconds (12 calls/min per position)

**Per User Capacity:**
- **Theoretical max**: ~80-100 concurrent positions before hitting personal rate limit
- **Practical limit**: **5-10 pairs** (human attention span for active trading)

**Key Insight:**
- ✅ **Frontend position monitoring** is NOT the bottleneck (each user has their own 2,400/min limit)
- ⚠️ **Backend signal generation** IS the bottleneck (all users share the backend's 2,400/min limit)
- Users can monitor many positions, but backend can only analyze limited pairs for signals

**Recommended User Limits:**
- **Scalp Strategy**: 3-5 pairs (requires intense focus)
- **Range/Momentum**: 10-15 pairs (more manageable)
- Backend limits how many pairs are available to subscribe to

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
