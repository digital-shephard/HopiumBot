# HopiumCore API Integration Guide

This guide provides comprehensive documentation for integrating with the HopiumCore API from frontend applications.

## Base Configuration

- **Base URL (Development)**: `http://localhost:8080`
- **Base URL (Production)**: `https://api.hopiumbot.com`
- **WebSocket URL (Development)**: `ws://localhost:8080/ws`
- **WebSocket URL (Production)**: `wss://api.hopiumbot.com/ws`
- **Content-Type**: All HTTP endpoints return `application/json`
- **CORS**: Enabled - allows all origins (reflects Origin header for cross-origin requests)

### Environment Configuration

For easier environment switching, use a configuration helper:

```typescript
const API_CONFIG = {
  development: {
    http: 'http://localhost:8080',
    ws: 'ws://localhost:8080/ws'
  },
  production: {
    http: 'https://api.hopiumbot.com',
    ws: 'wss://api.hopiumbot.com/ws'
  }
};

const ENV = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const BASE_URL = API_CONFIG[ENV].http;
const WS_URL = API_CONFIG[ENV].ws;
```

**JavaScript Example**:
```javascript
const isProduction = window.location.hostname !== 'localhost';
const BASE_URL = isProduction ? 'https://api.hopiumbot.com' : 'http://localhost:8080';
const WS_URL = isProduction ? 'wss://api.hopiumbot.com/ws' : 'ws://localhost:8080/ws';
```

---

## HTTP Endpoints

### Health Check

Check if the server is running.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok"
}
```

---

### Market Data Endpoints

#### Get Market Data

Fetch general market data for a symbol.

**Endpoint**: `GET /api/perps/market-data`

**Query Parameters**:
- `symbol` (required): Trading pair symbol (e.g., `BTCUSDT`)

**Example Request**:
```javascript
// Using BASE_URL configuration
fetch(`${BASE_URL}/api/perps/market-data?symbol=BTCUSDT`)
  .then(res => res.json())
  .then(data => console.log(data));

// Or hardcoded (not recommended)
// Development: fetch('http://localhost:8080/api/perps/market-data?symbol=BTCUSDT')
// Production: fetch('https://api.hopiumbot.com/api/perps/market-data?symbol=BTCUSDT')
```

**Response**: Raw AsterDex API response (varies by endpoint)

---

#### Get Klines (Candlestick Data)

Fetch OHLCV (Open, High, Low, Close, Volume) candlestick data.

**Endpoint**: `GET /api/perps/klines`

**Query Parameters**:
- `symbol` (required): Trading pair symbol
- `interval` (optional): Time interval (default: `1h`)
  - Options: `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M`
- `limit` (optional): Number of candles to return (default: `100`)

**Example Request**:
```javascript
// Development
fetch('http://localhost:8080/api/perps/klines?symbol=BTCUSDT&interval=1h&limit=50')
  .then(res => res.json())
  .then(data => console.log(data));

// Production
fetch('https://api.hopiumbot.com/api/perps/klines?symbol=BTCUSDT&interval=1h&limit=50')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Response**: Array of kline objects from AsterDex API

---

#### Get Mark Price

Fetch mark price and funding rate data.

**Endpoint**: `GET /api/perps/mark-price`

**Query Parameters**:
- `symbol` (optional): Trading pair symbol (if omitted, returns all symbols)

**Example Request**:
```javascript
// Development
fetch('http://localhost:8080/api/perps/mark-price?symbol=BTCUSDT')
  .then(res => res.json())
  .then(data => console.log(data));

// Production
fetch('https://api.hopiumbot.com/api/perps/mark-price?symbol=BTCUSDT')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Response**: AsterDex mark price response

---

#### Get Order Book

Fetch order book depth data.

**Endpoint**: `GET /api/perps/orderbook`

**Query Parameters**:
- `symbol` (required): Trading pair symbol
- `limit` (optional): Number of price levels (default: `20`)

**Example Request**:
```javascript
// Development
fetch('http://localhost:8080/api/perps/orderbook?symbol=BTCUSDT&limit=10')
  .then(res => res.json())
  .then(data => console.log(data));

// Production
fetch('https://api.hopiumbot.com/api/perps/orderbook?symbol=BTCUSDT&limit=10')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Response**: Order book data with bids and asks

---

#### Get Order

Retrieve order information.

**Endpoint**: `GET /api/perps/order`

**Query Parameters**:
- `symbol` (required): Trading pair symbol
- `orderId` (required): Order ID
- `side` (optional): Order side (`BUY` or `SELL`)
- `type` (optional): Order type (`LIMIT` or `MARKET`)

**Example Request**:
```javascript
// Development
fetch('http://localhost:8080/api/perps/order?symbol=BTCUSDT&orderId=12345&side=BUY&type=LIMIT')
  .then(res => res.json())
  .then(data => console.log(data));

// Production
fetch('https://api.hopiumbot.com/api/perps/order?symbol=BTCUSDT&orderId=12345&side=BUY&type=LIMIT')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Response**: Order details from AsterDex API

---

### Aggregated Snapshot (Main Endpoint)

Get comprehensive market snapshot with trends, indicators, and LLM analysis.

**Endpoint**: `GET /api/perps/snapshot`

**Query Parameters**:
- `symbol` (optional): Trading pair symbol (default: `BTCUSDT`)

**Example Request**:
```javascript
// Using BASE_URL configuration
fetch(`${BASE_URL}/api/perps/snapshot?symbol=BTCUSDT`)
  .then(res => res.json())
  .then(data => console.log(data));

// Or hardcoded (not recommended)
// Development: fetch('http://localhost:8080/api/perps/snapshot?symbol=BTCUSDT')
// Production: fetch('https://api.hopiumbot.com/api/perps/snapshot?symbol=BTCUSDT')
```

**Response Structure**:
```typescript
interface AggregatedSnapshot {
  timestamp: string;        // ISO 8601 timestamp
  symbol: string;           // Trading pair symbol
  current: {
    price: string;          // Current price
    mark_price: string;     // Mark price
    funding_rate: string;   // Current funding rate
    index_price: string;    // Index price
    spread: string;         // Bid-ask spread
    bid_price: string;      // Best bid price
    ask_price: string;      // Best ask price
    bid_qty: string;        // Best bid quantity
    ask_qty: string;        // Best ask quantity
    volume_24h: string;      // 24-hour volume
  };
  trends: {
    price_1h: string;              // 1h price change percentage (e.g., "+0.50%")
    price_24h: string;              // 24h price change percentage (e.g., "+2.30%")
    funding_rate_1h: string;         // 1h funding rate change (e.g., "+0.000050")
    spread_1h: string;               // 1h spread change
    volume_1h?: string;              // 1h volume change (if available)
  };
  indicators: {
    momentum: "bullish" | "bearish" | "neutral";
    volatility: "low" | "moderate" | "high";
    liquidity: "low" | "moderate" | "high";
    funding_sentiment: "long-heavy" | "short-heavy" | "neutral";
  };
  context: string[];                 // Natural language insights from LLM
  llm_summary?: LLMSummary;          // Full LLM analysis (if available)
}
```

**LLM Summary Structure**:
```typescript
interface LLMSummary {
  summary: string[];                 // Array of 3-5 market insights
  entry: {
    price: string;                   // Recommended entry price
    side: "LONG" | "SHORT";          // Recommended position side
    order_type: "LIMIT" | "MARKET";  // Recommended order type
    tolerance_percent: number;        // Price tolerance (e.g., 0.2 for 0.2%)
    reasoning: string;               // Brief explanation
  };
  severity: "HIGH" | "MEDIUM" | "LOW";
  sentiment_change: boolean;         // true if direction changed vs previous analysis
}
```

**Example Response**:
```json
{
  "timestamp": "2025-01-30T15:05:00Z",
  "symbol": "BTCUSDT",
  "current": {
    "price": "108500.00",
    "mark_price": "108510.00",
    "funding_rate": "0.0001",
    "index_price": "108505.00",
    "spread": "10.00000000",
    "bid_price": "108495.00",
    "ask_price": "108505.00",
    "bid_qty": "1.5",
    "ask_qty": "2.0",
    "volume_24h": "1234567.89"
  },
  "trends": {
    "price_1h": "+0.50%",
    "price_24h": "+2.30%",
    "funding_rate_1h": "+0.000050",
    "spread_1h": "+0.00000001"
  },
  "indicators": {
    "momentum": "bullish",
    "volatility": "low",
    "liquidity": "high",
    "funding_sentiment": "long-heavy"
  },
  "context": [
    "BTCUSDT shows bullish momentum with +0.5% price increase over 1h",
    "Funding rate of 0.0001 indicates long-heavy positioning",
    "Low volatility suggests stable market conditions"
  ],
  "llm_summary": {
    "summary": [
      "Strong bullish momentum with consistent upward price movement",
      "Positive funding rate indicates long-heavy market sentiment",
      "Low volatility provides favorable entry conditions"
    ],
    "entry": {
      "price": "108500.00",
      "side": "LONG",
      "order_type": "LIMIT",
      "tolerance_percent": 0.2,
      "reasoning": "Bullish momentum with stable conditions suggests LONG entry"
    },
    "severity": "MEDIUM",
    "sentiment_change": false
  }
}
```

---

### Test Endpoints

#### Test LLM

Test the LLM integration with sample data.

**Endpoint**: `GET /api/test/llm`

**Example Request**:
```javascript
// Development
fetch('http://localhost:8080/api/test/llm')
  .then(res => res.json())
  .then(data => console.log(data));

// Production
fetch('https://api.hopiumbot.com/api/test/llm')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Response Structure**:
```typescript
interface TestLLMResponse {
  status: "testing";
  llm_available: boolean;
  success?: boolean;
  summary?: LLMSummary;
  summary_count?: number;
  entry_side?: "LONG" | "SHORT";
  entry_price?: string;
  severity?: "HIGH" | "MEDIUM" | "LOW";
  sentiment_change?: boolean;
  llm_error?: string;
  error?: string;
}
```

---

## WebSocket API

The WebSocket API provides real-time push updates for market summaries and alerts.

### Connection

**Development URL**: `ws://localhost:8080/ws`
**Production URL**: `wss://api.hopiumbot.com/ws`

**Connection Example** (JavaScript):
```javascript
// Using WS_URL configuration
const ws = new WebSocket(WS_URL);

// Or hardcoded (not recommended)
// Development: const ws = new WebSocket('ws://localhost:8080/ws');
// Production: const ws = new WebSocket('wss://api.hopiumbot.com/ws');

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
};
```

**Connection Management**:
- Server sends ping frames every ~54 seconds
- Client should respond with pong frames (handled automatically by browsers)
- Connection closes if pong not received within 60 seconds
- Maximum message size: 512 bytes

---

### Trading Strategies

HopiumCore supports multiple trading strategies. When subscribing to a symbol, you can choose which strategy to use.

#### Available Strategies

**1. Range Trading (Default)**
- **ID**: `"range_trading"`
- **Description**: Mean-reversion strategy that trades bounces off 24h support/resistance
- **Signal Frequency**: Every 1 minute (when price is in entry zones)
- **Entry Zones**:
  - LONG: Bottom 15% of 24h range
  - SHORT: Top 15% of 24h range
- **Order Type**: Always LIMIT orders
- **Best For**: Ranging markets with clear support/resistance

**2. Momentum (LLM-Powered)**
- **ID**: `"momentum"`
- **Description**: AI-powered trend-following strategy using GPT-5 analysis
- **Signal Frequency**: Every 5 minutes or on significant market changes
- **Triggers**:
  - Momentum shifts (bullish ↔ bearish)
  - Funding rate changes
  - Price spikes (>1%)
  - Volatility/liquidity changes
- **Order Type**: LIMIT or MARKET (based on volatility)
- **Best For**: Trending markets with clear momentum

#### Strategy Selection

- **Default**: If no strategy is specified, `range_trading` is used
- **Switching**: Unsubscribe and resubscribe with a different strategy
- **Multiple**: Subscribe to the same symbol with different strategies (not currently supported per subscription, but can maintain multiple connections)

---

### Client-to-Server Messages

All client messages must be valid JSON objects with the following structure:

```typescript
interface WebSocketMessage {
  type: string;           // Message type (see below)
  symbol?: string;       // Trading pair symbol (for subscribe/unsubscribe)
  id?: number;           // Request ID for correlating responses
  payload?: any;         // Additional payload (not used in current implementation)
}
```

#### Subscribe to Symbol

Subscribe to receive updates for a specific trading pair with a chosen strategy.

**Message**:
```json
{
  "type": "subscribe",
  "symbol": "BTCUSDT",
  "strategy": "range_trading",
  "id": 1
}
```

**Parameters**:
- `symbol` (required): Trading pair (e.g., "BTCUSDT")
- `strategy` (optional): Strategy to use. Options:
  - `"range_trading"` (default): Mean-reversion strategy based on 24h range
  - `"momentum"`: LLM-based trend-following strategy
- `id` (optional): Request ID for tracking responses

**Response**:
```json
{
  "type": "subscribed",
  "symbol": "BTCUSDT",
  "strategy": "range_trading",
  "id": 1,
  "payload": {
    "subscribed": ["BTCUSDT"],
    "strategies": {
      "BTCUSDT": "range_trading"
    },
    "message": "Subscribed to BTCUSDT with range_trading strategy. Updates will be pushed automatically."
  }
}
```

**Immediate Signal on Subscribe**:
Upon successful subscription, the server immediately sends the current position signal (if available):
```json
{
  "type": "summary",
  "symbol": "BTCUSDT",
  "strategy": "range_trading",
  "payload": {
    "summary": {
      "entry": {
        "price": "108500.00",
        "side": "LONG",
        "order_type": "LIMIT",
        "tolerance_percent": 0.3,
        "reasoning": "Price near support..."
      },
      "severity": "high"
    },
    "timestamp": "2025-10-31T15:00:00Z",
    "message": "Current range trading signal (sent on subscription)"
  }
}
```

**TypeScript Example**:
```typescript
function subscribe(ws: WebSocket, symbol: string, strategy: string = 'range_trading', id: number) {
  ws.send(JSON.stringify({
    type: 'subscribe',
    symbol: symbol,
    strategy: strategy,
    id: id
  }));
}
```

---

#### Unsubscribe from Symbol

Unsubscribe from updates for a specific trading pair.

**Message**:
```json
{
  "type": "unsubscribe",
  "symbol": "BTCUSDT",
  "id": 2
}
```

**Response**:
```json
{
  "type": "unsubscribed",
  "symbol": "BTCUSDT",
  "id": 2,
  "payload": {
    "subscribed": []
  }
}
```

---

#### List Subscriptions

Get a list of currently subscribed symbols.

**Message**:
```json
{
  "type": "list_subscriptions",
  "id": 3
}
```

**Response**:
```json
{
  "type": "subscriptions",
  "id": 3,
  "payload": {
    "subscribed": ["BTCUSDT", "ETHUSDT"]
  }
}
```

---

#### Ping

Send a ping to check connection health. Server responds with pong.

**Message**:
```json
{
  "type": "ping",
  "id": 4
}
```

**Response**:
```json
{
  "type": "pong",
  "id": 4
}
```

---

### Server-to-Client Messages

#### Summary Update

Pushed automatically when a new LLM summary is generated (every 5 minutes or on significant change).

**Message Structure**:
```typescript
interface SummaryMessage {
  type: "summary";
  symbol: string;
  data: {
    summary: LLMSummary;           // Full LLM summary object
    timestamp: string;              // ISO 8601 timestamp
    symbol: string;                 // Trading pair symbol
    previous_side?: string;         // Previous side (if sentiment changed)
  };
}
```

**Example**:
```json
{
  "type": "summary",
  "symbol": "BTCUSDT",
  "data": {
    "summary": {
      "summary": [
        "Strong bullish momentum detected",
        "Low volatility provides entry opportunity"
      ],
      "entry": {
        "price": "108500.00",
        "side": "LONG",
        "order_type": "LIMIT",
        "tolerance_percent": 0.2,
        "reasoning": "Favorable market conditions"
      },
      "severity": "MEDIUM",
      "sentiment_change": false
    },
    "timestamp": "2025-01-30T15:05:00Z",
    "symbol": "BTCUSDT",
    "previous_side": "LONG"
  }
}
```

---

#### Alert Message

Pushed immediately when a significant market change is detected.

**Message Structure**:
```typescript
interface AlertMessage {
  type: "alert";
  symbol: string;
  data: {
    change_type: string;            // Type of change (see below)
    description: string;            // Human-readable description
    timestamp: string;              // ISO 8601 timestamp
  };
}
```

**Change Types**:
- `momentum_shift`: Momentum changed from bullish to bearish or vice versa
- `funding_flip`: Funding rate sign flipped (positive to negative or vice versa)
- `price_spike`: Price changed by more than 1%
- `volatility_spike`: Spread increased by more than 50%
- `liquidity_drop`: Liquidity decreased by more than 50%
- `sentiment_change`: LLM sentiment direction changed

**Example**:
```json
{
  "type": "alert",
  "symbol": "BTCUSDT",
  "data": {
    "change_type": "momentum_shift",
    "description": "Momentum changed from bullish to bearish",
    "timestamp": "2025-01-30T15:10:00Z"
  }
}
```

---

#### Error Message

Sent when an error occurs processing a client message.

**Message Structure**:
```typescript
interface ErrorMessage {
  type: "error";
  id?: number;                      // Request ID (if applicable)
  payload: {
    error: string;                  // Error message
  };
}
```

**Example**:
```json
{
  "type": "error",
  "id": 1,
  "payload": {
    "error": "symbol is required for subscribe"
  }
}
```

---

## Complete WebSocket Example

**TypeScript Example**:
```typescript
class HopiumWebSocketClient {
  private ws: WebSocket | null = null;
  private subscriptions: Set<string> = new Set();
  private messageId = 0;

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('Connected to HopiumCore WebSocket');
        resolve();
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
      };
    });
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'subscribed':
        this.subscriptions.add(message.symbol);
        console.log('Subscribed to:', message.symbol);
        break;
      
      case 'unsubscribed':
        this.subscriptions.delete(message.symbol);
        console.log('Unsubscribed from:', message.symbol);
        break;
      
      case 'summary':
        this.onSummary?.(message.data);
        break;
      
      case 'alert':
        this.onAlert?.(message.data);
        break;
      
      case 'error':
        console.error('Server error:', message.payload.error);
        break;
      
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  subscribe(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      symbol: symbol,
      id: ++this.messageId
    }));
  }

  unsubscribe(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    this.ws.send(JSON.stringify({
      type: 'unsubscribe',
      symbol: symbol,
      id: ++this.messageId
    }));
  }

  listSubscriptions(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    this.ws.send(JSON.stringify({
      type: 'list_subscriptions',
      id: ++this.messageId
    }));
  }

  // Event handlers (set by caller)
  onSummary?: (data: any) => void;
  onAlert?: (data: any) => void;

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage
const client = new HopiumWebSocketClient(WS_URL); // Uses configured WS_URL

// Or hardcoded (not recommended)
// Development: const client = new HopiumWebSocketClient('ws://localhost:8080/ws');
// Production: const client = new HopiumWebSocketClient('wss://api.hopiumbot.com/ws');

client.onSummary = (data) => {
  console.log('New summary:', data.summary);
  console.log('Entry recommendation:', data.summary.entry);
};

client.onAlert = (data) => {
  console.warn('Alert:', data.change_type, data.description);
};

await client.connect();
client.subscribe('BTCUSDT');
```

---

## Error Handling

### HTTP Errors

All HTTP endpoints return standard HTTP status codes:
- `200 OK`: Success
- `400 Bad Request`: Invalid request parameters
- `405 Method Not Allowed`: Wrong HTTP method
- `500 Internal Server Error`: Server error

Error responses include a JSON body with error details:
```json
{
  "error": "Failed to fetch market data: ..."
}
```

### WebSocket Errors

WebSocket errors are sent as error messages:
```json
{
  "type": "error",
  "id": 1,
  "payload": {
    "error": "symbol is required for subscribe"
  }
}
```

---

## Best Practices

1. **Polling vs WebSocket**: Use HTTP endpoints for one-time requests, WebSocket for real-time updates
2. **Reconnection**: Implement automatic reconnection logic for WebSocket connections
3. **Error Handling**: Always handle errors and implement retry logic
4. **Rate Limiting**: Be mindful of rate limits (currently none enforced, but may be added)
5. **Subscription Management**: Only subscribe to symbols you need to reduce server load
6. **Message IDs**: Use message IDs to correlate requests and responses
7. **Type Safety**: Use TypeScript interfaces for type safety in frontend applications

---

## Data Types Reference

### Severity Levels
- `HIGH`: Significant direction change detected
- `MEDIUM`: Strong trading signal
- `LOW`: Neutral or weak signal

### Momentum Values
- `bullish`: Price trending upward (>1% increase)
- `bearish`: Price trending downward (>1% decrease)
- `neutral`: Price stable (±1%)

### Volatility Levels
- `low`: Spread < 0.05% of price
- `moderate`: Spread 0.05% - 0.1% of price
- `high`: Spread > 0.1% of price

### Liquidity Levels
- `low`: Total bid+ask quantity < 10
- `moderate`: Total quantity 10 - 100
- `high`: Total quantity > 100

### Funding Sentiment
- `long-heavy`: Positive funding rate (>0.01%)
- `short-heavy`: Negative funding rate (<-0.01%)
- `neutral`: Funding rate near zero

---

---

## HopiumTasks API (Airdrop System)

### User Registration

Register a new user to participate in airdrop tasks.

**Endpoint**: `POST /api/tasks/user/register`

**Request Body**:
```json
{
  "wallet_address": "0xABC123..."
}
```

**Response**:
```json
{
  "wallet_address": "0xABC123...",
  "referral_code": "ABC123XY",
  "total_points": 0,
  "created_at": "2025-11-01T12:00:00Z",
  "updated_at": "2025-11-01T12:00:00Z"
}
```

---

### Get User Profile

Get complete user profile including tasks and referral stats.

**Endpoint**: `GET /api/tasks/user/{wallet_address}`

**Response**:
```json
{
  "user": {
    "wallet_address": "0xABC123...",
    "referral_code": "ABC123XY",
    "total_points": 60,
    "created_at": "2025-11-01T12:00:00Z",
    "updated_at": "2025-11-01T12:00:00Z"
  },
  "completed_tasks": [
    {
      "id": 1,
      "wallet_address": "0xABC123...",
      "task_type": "JOIN_DISCORD",
      "task_data": {},
      "points_awarded": 500,
      "completed_at": "2025-11-01T12:05:00Z",
      "verified": true
    }
  ],
  "referral_stats": {
    "referral_code": "ABC123XY",
    "total_referrals": 5,
    "completed_referrals": 1,
    "pending_referrals": 4,
    "total_referral_points": 1000
  }
}
```

---

### Discord OAuth Flow

#### Step 1: Initiate OAuth

**Endpoint**: `GET /api/tasks/discord/auth`

**Query Parameters**:
- `wallet_address` (required): User's wallet address

**Example**:
```javascript
const response = await fetch(`${BASE_URL}/api/tasks/discord/auth?wallet_address=0xABC123`);
const data = await response.json();
// data.auth_url = "https://discord.com/oauth2/authorize?client_id=...&state=xyz..."

// Redirect user to Discord
window.location.href = data.auth_url;
```

**Response**:
```json
{
  "auth_url": "https://discord.com/oauth2/authorize?client_id=...&redirect_uri=...&state=xyz789"
}
```

#### Step 2: User Authorizes on Discord

User is redirected to Discord to authorize. Discord then redirects back to:
```
GET /api/tasks/discord/callback?state=xyz789&code=auth_code
```

#### Step 3: Backend Handles Callback

**Endpoint**: `GET /api/tasks/discord/callback` (handled automatically by Discord)

**Query Parameters**:
- `state`: OAuth state token
- `code`: Authorization code

**Response**: Beautiful HTML success page with:
- ✅ Success checkmark animation
- 🎉 Confetti celebration
- 💰 Points earned display (500 points)
- ⏱️ 3-second countdown
- 🪟 Auto-close window

On error, displays styled error page with specific message.

**What Happens**:
1. Backend verifies state is valid (links to wallet address)
2. Exchanges code for Discord access token
3. Gets Discord user info
4. **Verifies user is in the Discord server** (guild membership)
5. Saves Discord tokens to database
6. **Auto-completes JOIN_DISCORD task** (500 points awarded)
7. If user has pending referral → **auto-completes referral** (referrer gets 1000 points)

**Frontend Implementation**:
```javascript
// 1. User clicks "Connect Discord" - Open in popup for better UX
async function connectDiscord(walletAddress) {
  const response = await fetch(`${BASE_URL}/api/tasks/discord/auth?wallet_address=${walletAddress}`);
  const data = await response.json();
  
  // 2. Open Discord OAuth in popup window
  const popup = window.open(
    data.auth_url,
    'Discord OAuth',
    'width=500,height=700,scrollbars=yes'
  );
  
  // 3. Poll to check when popup closes (user completed OAuth)
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed);
      // Refresh user profile to get updated points
      refreshUserProfile(walletAddress);
    }
  }, 1000);
}

// 4. Refresh user profile after OAuth completes
async function refreshUserProfile(walletAddress) {
  const response = await fetch(`${BASE_URL}/api/tasks/user/${walletAddress}`);
  const profile = await response.json();
  
  // Update UI with new points and completed tasks
  updateUI(profile);
}
```

---

### Enter Referral Code

Allow a user to enter a referral code when signing up.

**Endpoint**: `POST /api/tasks/referral/enter`

**Request Body**:
```json
{
  "wallet_address": "0xDEF456...",
  "referral_code": "ABC123XY"
}
```

**Response**:
```json
{
  "success": true,
  "referrer_address": "0xABC123...",
  "status": "PENDING",
  "referral": {
    "id": 1,
    "referrer_address": "0xABC123...",
    "referee_address": "0xDEF456...",
    "referral_code": "ABC123XY",
    "status": "PENDING",
    "twitter_verified": false,
    "discord_joined": false,
    "points_awarded": 0,
    "created_at": "2025-11-01T12:00:00Z"
  }
}
```

**Note**: Points are awarded to referrer only when referee completes Discord OAuth (joins server).

---

### Get Referral Info

Get referral statistics for a user (how many people they referred).

**Endpoint**: `GET /api/tasks/referral/{wallet_address}`

**Response**:
```json
{
  "referral_code": "ABC123XY",
  "total_referrals": 5,
  "completed_referrals": 1,
  "pending_referrals": 4,
  "total_referral_points": 1000
}
```

---

### Leaderboard

#### Get Leaderboard

**Endpoint**: `GET /api/tasks/leaderboard`

**Query Parameters**:
- `limit` (optional, default: 100, max: 1000): Number of entries
- `offset` (optional, default: 0): Pagination offset

**Response**:
```json
{
  "entries": [
    {
      "wallet_address": "0x...",
      "total_points": 500,
      "rank": 1
    },
    {
      "wallet_address": "0x...",
      "total_points": 250,
      "rank": 2
    }
  ],
  "total_users": 1000,
  "limit": 100,
  "offset": 0
}
```

#### Get User Rank

**Endpoint**: `GET /api/tasks/leaderboard/user/{wallet_address}`

**Response**:
```json
{
  "wallet_address": "0xABC123...",
  "total_points": 100,
  "rank": 42,
  "total_users": 1000
}
```

---

### Complete Twitter Follow Task

Complete the Twitter follow task to earn points.

**Endpoint**: `POST /api/tasks/twitter/follow`

**Authentication**: Required (JWT token in Authorization header)

**Requirements**:
- User must be registered
- User must have joined Discord first (completed Discord OAuth)
- Task can only be completed once per user

**Request Body**: None required

**Example Request**:
```javascript
const response = await fetch(`${BASE_URL}/api/tasks/twitter/follow`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "points_awarded": 1000,
  "total_points": 1500,
  "completion": {
    "id": 123,
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "task_type": "FOLLOW_TWITTER",
    "task_data": null,
    "points_awarded": 1000,
    "completed_at": "2025-11-02T15:30:00Z",
    "verified": true
  },
  "message": "Twitter follow task completed! Thank you for following us."
}
```

**Error Responses**:

**401 Unauthorized** - Not authenticated:
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden** - User hasn't joined Discord:
```json
{
  "error": "must join Discord before completing this task"
}
```

**404 Not Found** - User not registered:
```json
{
  "error": "user not found: 0x..."
}
```

**409 Conflict** - Already completed:
```json
{
  "error": "task already completed"
}
```

**Frontend Integration Example**:
```javascript
const TWITTER_URL = 'https://x.com/hopiumbot';

async function completeTwitterFollowTask(jwtToken) {
  // 1. Open Twitter page in new tab
  window.open(TWITTER_URL, '_blank');
  
  // 2. Complete the task
  try {
    const response = await fetch(`${BASE_URL}/api/tasks/twitter/follow`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    console.log(`Success! Earned ${data.points_awarded} points`);
    return data;
  } catch (error) {
    if (error.message.includes('Discord')) {
      console.error('Please join Discord first');
    } else if (error.message.includes('already completed')) {
      console.error('Task already completed');
    }
    throw error;
  }
}
```

---

### Points System

**Task Points**:
- `JOIN_DISCORD`: 500 points (verified via OAuth)
- `FOLLOW_TWITTER`: 1000 points (honor system, requires Discord membership)
- `REFER_FRIEND`: 1000 points (when friend joins Discord)

**Referral Requirements**:
- Friend must join Discord server (verified via OAuth)
- Points awarded to referrer immediately upon friend's Discord connection

---

### TypeScript Interfaces

```typescript
interface User {
  wallet_address: string;
  referral_code: string;
  total_points: number;
  created_at: string;
  updated_at: string;
}

interface TaskCompletion {
  id: number;
  wallet_address: string;
  task_type: 'JOIN_DISCORD' | 'FOLLOW_TWITTER' | 'REFER_FRIEND';
  task_data: Record<string, any>;
  points_awarded: number;
  completed_at: string;
  verified: boolean;
}

interface Referral {
  id: number;
  referrer_address: string;
  referee_address: string;
  referral_code: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  twitter_verified: boolean;
  discord_joined: boolean;
  points_awarded: number;
  created_at: string;
  completed_at?: string;
}

interface UserProfile {
  user: User;
  completed_tasks: TaskCompletion[];
  referral_stats: ReferralStats;
}

interface ReferralStats {
  referral_code: string;
  total_referrals: number;
  completed_referrals: number;
  pending_referrals: number;
  total_referral_points: number;
}

interface LeaderboardEntry {
  wallet_address: string;
  total_points: number;
  rank: number;
}

interface Leaderboard {
  entries: LeaderboardEntry[];
  total_users: number;
  limit: number;
  offset: number;
}
```

---

## AirdropAlpha API (Airdrop Opportunities)

The AirdropAlpha module provides public access to curated airdrop opportunities posted by your team.

### List Airdrops

Get a list of airdrop opportunities with optional filtering.

**Endpoint**: `GET /api/airdrops`

**Query Parameters**:
- `status` (optional): Filter by status (`Active`, `Ended`, `Coming Soon`)
- `limit` (optional, default: 50, max: 100): Number of results
- `offset` (optional, default: 0): Pagination offset

**Example Requests**:
```javascript
// Get all active airdrops
const response = await fetch(`${BASE_URL}/api/airdrops?status=Active&limit=20`);
const data = await response.json();

// Get all airdrops (no filter)
const allAirdrops = await fetch(`${BASE_URL}/api/airdrops`);
```

**Response**:
```json
{
  "airdrops": [
    {
      "id": 3,
      "name": "Simple Protocol",
      "description": "DeFi Lending Platform",
      "status": "Active",
      "farmingGuide": {
        "difficulty": "Easy",
        "steps": [
          {
            "stepNumber": 1,
            "title": "Visit Website",
            "description": "Go to simple-protocol.io and connect wallet"
          },
          {
            "stepNumber": 2,
            "title": "Make a Deposit",
            "description": "Deposit any amount of USDC or ETH"
          },
          {
            "stepNumber": 3,
            "title": "Hold for 30 Days",
            "description": "Keep your funds deposited for at least one month"
          }
        ],
        "requirements": ["Wallet with USDC or ETH", "Minimum $10"],
        "warnings": ["Smart contract risk - funds could be lost"]
      },
      "createdAt": "2025-11-02T15:30:00Z",
      "updatedAt": "2025-11-02T15:30:00Z",
      "createdBy": "ModUsername"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

### Get Specific Airdrop

Get detailed information about a specific airdrop by ID.

**Endpoint**: `GET /api/airdrops/{id}`

**Path Parameters**:
- `id` (required): Airdrop ID

**Example Request**:
```javascript
const response = await fetch(`${BASE_URL}/api/airdrops/3`);
const airdrop = await response.json();
```

**Response**:
```json
{
  "id": 3,
  "name": "Simple Protocol",
  "description": "DeFi Lending Platform",
  "status": "Active",
  "farmingGuide": {
    "difficulty": "Easy",
    "steps": [
      {
        "stepNumber": 1,
        "title": "Visit Website",
        "description": "Go to simple-protocol.io and connect wallet"
      },
      {
        "stepNumber": 2,
        "title": "Make a Deposit",
        "description": "Deposit any amount of USDC or ETH"
      },
      {
        "stepNumber": 3,
        "title": "Hold for 30 Days",
        "description": "Keep your funds deposited for at least one month"
      }
    ],
    "requirements": ["Wallet with USDC or ETH", "Minimum $10"],
    "warnings": ["Smart contract risk - funds could be lost"]
  },
  "createdAt": "2025-11-02T15:30:00Z",
  "updatedAt": "2025-11-02T15:30:00Z",
  "createdBy": "ModUsername"
}
```

---

### TypeScript Interfaces

```typescript
interface Airdrop {
  id: number;
  name: string;
  description: string;
  status: 'Active' | 'Ended' | 'Coming Soon';
  farmingGuide: FarmingGuide;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface FarmingGuide {
  difficulty: 'Easy' | 'Medium' | 'Hard';
  steps: Step[];
  requirements: string[];
  warnings: string[];
}

interface Step {
  stepNumber: number;
  title: string;
  description: string;
}

interface AirdropListResponse {
  airdrops: Airdrop[];
  total: number;
  limit: number;
  offset: number;
}
```

---

### Complete Example

**React/TypeScript Implementation**:
```typescript
import { useState, useEffect } from 'react';

// Interfaces
interface Step {
  stepNumber: number;
  title: string;
  description: string;
}

interface FarmingGuide {
  difficulty: 'Easy' | 'Medium' | 'Hard';
  steps: Step[];
  requirements: string[];
  warnings: string[];
}

interface Airdrop {
  id: number;
  name: string;
  description: string;
  status: 'Active' | 'Ended' | 'Coming Soon';
  farmingGuide: FarmingGuide;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// API Client
class AirdropAPI {
  constructor(private baseUrl: string) {}

  async listAirdrops(
    status?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ airdrops: Airdrop[]; total: number }> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const response = await fetch(
      `${this.baseUrl}/api/airdrops?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch airdrops');
    }

    return await response.json();
  }

  async getAirdrop(id: number): Promise<Airdrop> {
    const response = await fetch(`${this.baseUrl}/api/airdrops/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Airdrop not found');
      }
      throw new Error('Failed to fetch airdrop');
    }

    return await response.json();
  }
}

// React Component Example
function AirdropsList() {
  const [airdrops, setAirdrops] = useState<Airdrop[]>([]);
  const [filter, setFilter] = useState<string>('Active');
  const [loading, setLoading] = useState(true);

  const api = new AirdropAPI(BASE_URL);

  useEffect(() => {
    async function fetchAirdrops() {
      setLoading(true);
      try {
        const data = await api.listAirdrops(filter);
        setAirdrops(data.airdrops);
      } catch (error) {
        console.error('Error fetching airdrops:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAirdrops();
  }, [filter]);

  return (
    <div>
      <h1>Airdrop Opportunities</h1>
      
      {/* Filter buttons */}
      <div>
        <button onClick={() => setFilter('Active')}>Active</button>
        <button onClick={() => setFilter('Coming Soon')}>Coming Soon</button>
        <button onClick={() => setFilter('Ended')}>Ended</button>
      </div>

      {/* Airdrops list */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div>
          {airdrops.map((airdrop) => (
            <div key={airdrop.id} className="airdrop-card">
              <h2>{airdrop.name}</h2>
              <p>{airdrop.description}</p>
              <span className={`status ${airdrop.status.toLowerCase()}`}>
                {airdrop.status}
              </span>
              <span className={`difficulty ${airdrop.farmingGuide.difficulty.toLowerCase()}`}>
                {airdrop.farmingGuide.difficulty}
              </span>
              
              {/* Steps */}
              <div className="steps">
                <h3>How to Farm:</h3>
                {airdrop.farmingGuide.steps.map((step) => (
                  <div key={step.stepNumber} className="step">
                    <strong>Step {step.stepNumber}: {step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                ))}
              </div>

              {/* Requirements */}
              {airdrop.farmingGuide.requirements.length > 0 && (
                <div className="requirements">
                  <h4>Requirements:</h4>
                  <ul>
                    {airdrop.farmingGuide.requirements.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {airdrop.farmingGuide.warnings.length > 0 && (
                <div className="warnings">
                  <h4>⚠️ Warnings:</h4>
                  <ul>
                    {airdrop.farmingGuide.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <small>Posted by {airdrop.createdBy} on {new Date(airdrop.createdAt).toLocaleDateString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### Error Responses

**404 Not Found** (airdrop doesn't exist):
```json
{
  "error": "Airdrop not found"
}
```

**400 Bad Request** (invalid ID):
```json
{
  "error": "Invalid airdrop ID"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Failed to list airdrops: ..."
}
```

---

### Notes

- **Public Endpoints**: No authentication required
- **Real-time Updates**: Airdrops posted in Discord appear immediately via API
- **Pagination**: Use `limit` and `offset` for large result sets
- **Status Values**: `Active`, `Ended`, `Coming Soon`
- **Difficulty Values**: `Easy`, `Medium`, `Hard`

---

## Support

For issues or questions:
- Check `PROJECT_STATUS.md` for current implementation status
- Review server logs for detailed error messages
- See `README.md` for setup and configuration

