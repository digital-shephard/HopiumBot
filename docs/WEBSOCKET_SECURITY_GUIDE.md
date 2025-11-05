# WebSocket Security Guide

HopiumCore WebSocket connections **require authentication** to prevent unauthorized access to real-time market updates.

## 🔐 **Authentication Methods**

### **Method 1: Token in Query Parameter** (Recommended)

**Simplest approach** - include JWT token in the WebSocket URL:

```javascript
const ws = new WebSocket(`ws://localhost:8080/ws?token=${jwtToken}`);
```

**✅ Pros:**
- Simple to implement
- Token validated immediately on connection
- Connection rejected if token invalid

**⚠️ Cons:**
- Token visible in URL (may appear in logs)

---

### **Method 2: Token in First Message** (More Secure)

**Secure approach** - send token as first message after connecting:

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: jwtToken
  }));
};
```

**✅ Pros:**
- Token not in URL (not logged)
- More secure

**⚠️ Cons:**
- Must authenticate within 5 seconds
- Slightly more complex

---

## 🚦 **Connection Flow**

### **Method 1 Flow (Token in URL)**

```
1. Client connects with token → ws://localhost:8080/ws?token=eyJhbGc...
2. Server validates token immediately
   ✅ Valid → Connection established (authenticated)
   ❌ Invalid → Connection rejected (401)
3. Client can immediately send subscribe messages
```

### **Method 2 Flow (Token in Message)**

```
1. Client connects → ws://localhost:8080/ws
2. Server starts 5-second auth timeout
3. Client sends authenticate message with token
4. Server validates token
   ✅ Valid → Client marked as authenticated
   ❌ Invalid → Connection closed
   ⏱️ Timeout → Connection closed after 5 seconds
5. Client can send subscribe messages after authentication
```

---

## 📊 **Security Limits**

### **1. Authentication Timeout**
- **Limit:** 5 seconds
- **Applies to:** Unauthenticated connections (Method 2)
- **Behavior:** Connection automatically closed if not authenticated within 5 seconds

### **2. Connection Limit Per User**
- **Limit:** 3 simultaneous connections
- **Per:** Authenticated wallet address
- **Behavior:** 4th connection attempt returns 429 Too Many Requests
- **Use case:** Allows phone + laptop + backup device

### **3. Message Rate Limit**
- **Limit:** 30 messages per minute per connection
- **Includes:** Subscribe, unsubscribe, ping messages
- **Excludes:** Server-pushed updates (don't count against limit)
- **Behavior:** Messages over limit receive error response

### **4. Subscription Limit**
- **Limit:** 10 symbols per connection
- **Behavior:** Attempting to subscribe to 11th symbol receives error
- **Workaround:** Open multiple connections (up to 3 per user)

---

## 🎯 **Typical Usage Patterns**

### **Single Symbol Trading Bot**

```javascript
// Connect once
const ws = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);

ws.onopen = () => {
  // Subscribe to 1 symbol
  ws.send(JSON.stringify({
    type: 'subscribe',
    symbol: 'BTCUSDT',
    strategy: 'range_trading'
  }));
};

// Receive updates (pushed by server, doesn't count against rate limit)
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  if (update.type === 'summary') {
    processSignal(update.data);
  }
};
```

**Message usage:** ~2 messages/session (connect + subscribe)

---

### **Multi-Symbol Dashboard**

```javascript
// Connect once
const ws = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);

ws.onopen = () => {
  // Subscribe to multiple symbols
  ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'].forEach(symbol => {
    ws.send(JSON.stringify({
      type: 'subscribe',
      symbol: symbol,
      strategy: 'range_trading'
    }));
  });
};
```

**Message usage:** ~4 messages/session (connect + 3 subscribes)

---

### **Multi-Device User**

```javascript
// Phone
const ws1 = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);

// Laptop
const ws2 = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);

// Backup device
const ws3 = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);

// ✅ All 3 connections allowed (max 3 per user)

// 4th device
const ws4 = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);
// ❌ Connection rejected: 429 Too Many Requests
```

---

## ⚠️ **Error Handling**

### **Connection Rejected (Invalid Token)**

**HTTP Response:**
```
401 Unauthorized
Invalid authentication token
```

**Client receives:**
```
WebSocket connection to 'ws://localhost:8080/ws?token=invalid' failed: 
Error during WebSocket handshake: Unexpected response code: 401
```

**What to do:**
- Token is invalid or expired
- Re-authenticate to get new token
- Try connecting again

---

### **Authentication Timeout (Method 2)**

**Server sends before closing:**
```json
{
  "type": "error",
  "id": 0,
  "payload": {
    "error": "Authentication timeout. You must authenticate within 5 seconds of connecting."
  }
}
```

**Then:** Connection closed by server

**What to do:**
- Authenticate faster (send message immediately after `onopen`)
- Or use Method 1 (token in URL) to avoid timeout

---

### **Connection Limit Exceeded**

**HTTP Response:**
```
429 Too Many Requests
Connection limit exceeded: maximum 3 connections per user
```

**What to do:**
- Close one of your existing connections
- Or use a different wallet address

---

### **Message Rate Limit Exceeded**

**Server sends:**
```json
{
  "type": "error",
  "id": 123,
  "payload": {
    "error": "Message rate limit exceeded: maximum 30 messages per minute"
  }
}
```

**What to do:**
- Reduce message frequency
- Wait for rate limit to reset (1 minute)
- Server-pushed updates don't count against your limit

---

### **Subscription Limit Exceeded**

**Server sends:**
```json
{
  "type": "error",
  "id": 456,
  "payload": {
    "error": "Subscription limit exceeded: maximum 10 subscriptions per connection"
  }
}
```

**What to do:**
- Unsubscribe from unused symbols
- Or open another connection (up to 3 total)

---

## 📡 **Strategy Message Formats**

### **Overview of Strategies**

| Strategy | ID | Update Frequency | Message Type | Use Case |
|----------|----|-----------------|--------------| ---------|
| **Range Trading** | `range_trading` | Every 1 minute | `summary` | Multi-TF + volume profile + 6-layer confluence |
| **Momentum** | `momentum` | Every 1 minute | `momentum_indicator` | Directional scalping (trend-aligned volume farming) |
| **Scalp** | `scalp` | Every 30 seconds | `scalp_indicator` | High-frequency volume farming @ 75x |

---

### **🎯 Scalp Strategy** (High-Frequency Volume Farming)

**Subscribe:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  symbol: 'BTCUSDT',
  strategy: 'scalp'
}));
```

**Message Format:**
```typescript
{
  type: "scalp_indicator",
  symbol: "BTCUSDT",
  strategy: "scalp",
  data: {
    symbol: string;
    timestamp: string;              // ISO 8601
    current_price: number;
    ema_1min: number;              // 1-minute EMA
    side: "LONG" | "SHORT" | "NEUTRAL";
    limit_price: number;           // 0 if NEUTRAL
    tp_price: number;              // 0 if NEUTRAL
    sl_price: number;              // 0 if NEUTRAL
    tp_percent: 0.15;              // Always 0.15%
    sl_percent: 0.10;              // Always 0.10%
    confidence: "high" | "medium" | "low";
    reasoning: string;
    expected_hold_minutes: 2;      // 1-3 minutes
    range_high_5min: number;
    range_low_5min: number;
    position_in_range: number;     // 0.0 to 1.0
  }
}
```

**Update Frequency:** Every 30 seconds

**Signal Types:**

**1. LONG Signal** (Price below EMA):
```json
{
  "type": "scalp_indicator",
  "symbol": "BTCUSDT",
  "strategy": "scalp",
  "data": {
    "symbol": "BTCUSDT",
    "timestamp": "2025-11-03T13:30:00Z",
    "current_price": 107500.00,
    "ema_1min": 107525.00,
    "side": "LONG",
    "limit_price": 107478.50,
    "tp_price": 107661.25,
    "sl_price": 107392.50,
    "tp_percent": 0.15,
    "sl_percent": 0.10,
    "confidence": "high",
    "reasoning": "Price 0.02% below EMA (107525.00). Mean reversion opportunity. Price in bottom 30% of 5min range.",
    "expected_hold_minutes": 2,
    "range_high_5min": 107650.00,
    "range_low_5min": 107450.00,
    "position_in_range": 0.25
  }
}
```

**Frontend Action:**
```javascript
if (data.side === 'LONG' && data.confidence === 'high') {
  // Place limit buy at 107478.50
  // Set TP at 107661.25 (+0.15%)
  // Set SL at 107392.50 (-0.10%)
}
```

**2. SHORT Signal** (Price above EMA):
```json
{
  "type": "scalp_indicator",
  "symbol": "BTCUSDT",
  "strategy": "scalp",
  "data": {
    "symbol": "BTCUSDT",
    "timestamp": "2025-11-03T13:30:30Z",
    "current_price": 107550.00,
    "ema_1min": 107525.00,
    "side": "SHORT",
    "limit_price": 107571.50,
    "tp_price": 107388.75,
    "sl_price": 107657.50,
    "tp_percent": 0.15,
    "sl_percent": 0.10,
    "confidence": "high",
    "reasoning": "Price 0.02% above EMA (107525.00). Mean reversion opportunity. Price in top 30% of 5min range.",
    "expected_hold_minutes": 2,
    "range_high_5min": 107600.00,
    "range_low_5min": 107450.00,
    "position_in_range": 0.75
  }
}
```

**Frontend Action:**
```javascript
if (data.side === 'SHORT' && data.confidence === 'high') {
  // Place limit sell at 107571.50
  // Set TP at 107388.75 (-0.15%)
  // Set SL at 107657.50 (+0.10%)
}
```

**3. NEUTRAL Signal** (Price near EMA - NO TRADE):
```json
{
  "type": "scalp_indicator",
  "symbol": "BTCUSDT",
  "strategy": "scalp",
  "data": {
    "symbol": "BTCUSDT",
    "timestamp": "2025-11-03T13:31:00Z",
    "current_price": 107525.00,
    "ema_1min": 107526.00,
    "side": "NEUTRAL",
    "limit_price": 0,
    "tp_price": 0,
    "sl_price": 0,
    "tp_percent": 0.15,
    "sl_percent": 0.10,
    "confidence": "low",
    "reasoning": "Price trading at EMA (deviation: 0.00%). Waiting for clearer setup.",
    "expected_hold_minutes": 2,
    "range_high_5min": 107600.00,
    "range_low_5min": 107450.00,
    "position_in_range": 0.50
  }
}
```

**Frontend Action:**
```javascript
if (data.side === 'NEUTRAL') {
  // Do nothing - wait for next signal
  // Price is too close to EMA for an edge
}
```

**Complete Frontend Handler:**
```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'scalp_indicator') {
    const { data } = msg;
    
    console.log(`[SCALP] ${data.side} @ $${data.current_price} (EMA: $${data.ema_1min})`);
    
    switch(data.side) {
      case 'LONG':
        if (data.confidence === 'high') {
          placeLimitBuy({
            symbol: data.symbol,
            price: data.limit_price,
            takeProfit: data.tp_price,
            stopLoss: data.sl_price
          });
        }
        break;
        
      case 'SHORT':
        if (data.confidence === 'high') {
          placeLimitSell({
            symbol: data.symbol,
            price: data.limit_price,
            takeProfit: data.tp_price,
            stopLoss: data.sl_price
          });
        }
        break;
        
      case 'NEUTRAL':
        // Wait for next signal (comes in 30 seconds)
        console.log('Waiting for setup...', data.reasoning);
        break;
    }
  }
};
```

**Key Points:**
- ✅ **Always broadcasts** every 30 seconds (even NEUTRAL)
- ✅ **Prices are 0** when side is NEUTRAL (ignore these signals)
- ✅ **High confidence** means price is also in extreme 5-min range
- ✅ **Expected 50-80 signals/hour** for LONG/SHORT (rest are NEUTRAL)
- ✅ **Optimized for 75x leverage** (0.15% TP = 11% gain, 0.10% SL = 7.5% loss)

---

### **📊 Range Trading Strategy** ⚡ **ENHANCED**

**Subscribe:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  symbol: 'BTCUSDT',
  strategy: 'range_trading'  // or omit (default)
}));
```

**Message Format:**
```typescript
{
  type: "summary",
  symbol: "BTCUSDT",
  strategy: "range_trading",
  payload: {
    summary: {
      entry: {
        price: string;
        side: "LONG" | "SHORT" | "NEUTRAL";  // ⚠️ NEUTRAL added for safety filters
        order_type: "LIMIT";
        tolerance_percent: number;
        reasoning: string;
      },
      severity: "high" | "medium" | "low";
      sentiment_change?: boolean;
    },
    timestamp: string;
    
    // Multi-timeframe ranges (NEW)
    range_1h: { high: number; low: number; size: number; size_percent: number; position_in_range: number; };
    range_4h: { high: number; low: number; size: number; size_percent: number; position_in_range: number; };
    range_24h: { high: number; low: number; size: number; size_percent: number; position_in_range: number; };
    
    // Volume profile (NEW)
    volume_profile?: {
      poc: number;
      value_area_high: number;
      value_area_low: number;
      high_volume_nodes: number[];
      low_volume_nodes: number[];
    };
    
    // Key levels (NEW)
    key_levels?: Array<{
      price: number;
      type: "support" | "resistance" | "poc" | "gap";
      strength: number;
      distance: number;
      source: string;
    }>;
    
    // Trading details (NEW)
    tp_price?: number;
    sl_price?: number;
    risk_reward?: number;
    confluence_score?: number;  // 0-6 layers
    
    // Legacy support
    range_data: {
      daily_high: number;
      daily_low: number;
      range_size: number;
      position_in_range: number;
      current_price: number;
    };
  }
}
```

**Update Frequency:** Every 1 minute (only when in entry zones AND safety filters pass)

**Key Points:**
- ✅ **Can return NEUTRAL** when safety filters block trading (trends, breakouts, volatility)
- ✅ **Multi-timeframe confluence** (1h, 4h, 24h ranges)
- ✅ **Volume profile support/resistance** (POC, Value Area, HVN)
- ✅ **TP/SL with risk/reward ratios**
- ✅ **Confluence scoring** (0-6 layers for trade quality)
- ✅ **Safety filters**: Blocks trades during >1% trends, breakouts, >3% volatility, >5% ranges
- ✅ **Entry zones widened** to 20% (from 15%) for more opportunities
- ⚠️ **Fewer signals** than before due to safety filters (5-15/day instead of 10-20)
- ✅ **Backward compatible** with legacy `range_data` field

---

### **🎯 Momentum Strategy** (Directional Volume Farming) ⚡ **NEW**

**Subscribe:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  symbol: 'BTCUSDT',
  strategy: 'momentum'
}));
```

**Message Format:**
```typescript
{
  type: "momentum_indicator",
  symbol: "BTCUSDT",
  strategy: "momentum",
  data: {
    symbol: string;
    timestamp: string;
    current_price: number;
    
    // Trend context
    trend_1h: "UP" | "DOWN" | "NEUTRAL";
    trend_4h: "UP" | "DOWN" | "NEUTRAL";
    trend_alignment: "ALIGNED" | "CONFLICTED" | "NEUTRAL";
    trend_strength: number;
    
    // Technical
    macd: number;
    rsi: number;
    
    // Signal
    side: "LONG" | "SHORT" | "NEUTRAL";
    limit_price: number;
    tp_price: number;
    sl_price: number;
    tp_percent: 0.08;
    sl_percent: 0.20;
    
    // Quality
    confidence: "high" | "medium" | "low";
    confluence_score: number;  // 0-7 layers
    reasoning: string;
    expected_hold_minutes: number;
  }
}
```

**Update Frequency:** Every 1 minute

**Signal Types:**

**1. Aligned Downtrend SHORT** (Bear Market Perfect):
```json
{
  "type": "momentum_indicator",
  "symbol": "BTCUSDT",
  "strategy": "momentum",
  "data": {
    "symbol": "BTCUSDT",
    "timestamp": "2025-11-04T10:30:00Z",
    "current_price": 68500.00,
    "trend_1h": "DOWN",
    "trend_4h": "DOWN",
    "trend_alignment": "ALIGNED",
    "trend_strength": 2.5,
    "macd": -8.5,
    "rsi": 42.0,
    "side": "SHORT",
    "limit_price": 68513.70,
    "tp_price": 68445.20,
    "sl_price": 68637.00,
    "tp_percent": 0.08,
    "sl_percent": 0.20,
    "confidence": "high",
    "confluence_score": 6,
    "reasoning": "DIRECTIONAL SHORT: Trend=DOWN/DOWN. MACD bearish (-8.50), RSI: 42.0. ✅ 1h+4h downtrends aligned. 🔥 EXCELLENT DIRECTIONAL SHORT.",
    "expected_hold_minutes": 5
  }
}
```

**Frontend Action:**
```javascript
if (data.side === 'SHORT' && data.trend_alignment === 'ALIGNED') {
  // Both 1h and 4h trending down - take SHORT
  placeLimitOrder({
    symbol: data.symbol,
    side: 'SELL',
    price: data.limit_price,
    takeProfit: data.tp_price,
    stopLoss: data.sl_price
  });
}
```

**2. Conflicted Trends NEUTRAL**:
```json
{
  "type": "momentum_indicator",
  "data": {
    "trend_1h": "UP",
    "trend_4h": "DOWN",
    "trend_alignment": "CONFLICTED",
    "side": "NEUTRAL",
    "reasoning": "CONFLICTED TRENDS: 1h=UP, 4h=DOWN. Waiting for alignment."
  }
}
```

**Key Points:**
- ✅ **Directional bias** - Only LONGs in uptrends, only SHORTs in downtrends
- ✅ **Perfect for bear markets** - Detects downtrends, blocks LONGs, spams SHORTs
- ✅ **Volume farming** - 1-min updates for multiple entries
- ✅ **7-layer confluence** - Trend + sweep + gap + pullback + RSI + MACD + regime
- ✅ **NEVER fights trend** - If DOWN, no LONGs. If UP, no SHORTs
- ✅ **Returns NEUTRAL** when trends conflict (waits for clarity)
- ✅ **All detectors integrated** - Uses same tech as scalp strategy
- ⚠️ **Expected 10-20 signals/day** (fewer than scalp, more than range)

---

## 🔧 **Best Practices**

### **1. Reuse Connections**

```javascript
// ✅ Good: One connection, multiple subscriptions
const ws = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);
ws.send({ type: 'subscribe', symbol: 'BTCUSDT' });
ws.send({ type: 'subscribe', symbol: 'ETHUSDT' });

// ❌ Bad: Multiple connections for same user
const ws1 = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);
const ws2 = new WebSocket(`ws://api.hopiumbot.com/ws?token=${token}`);
// Wastes connection limit
```

### **2. Handle Token Expiration**

```javascript
ws.onclose = (event) => {
  if (event.code === 1008) { // Policy violation (auth failed)
    console.log('Token expired, re-authenticating...');
    await auth.authenticate(walletAddress);
    reconnectWebSocket();
  }
};
```

### **3. Minimize Messages**

```javascript
// ✅ Good: Subscribe once, receive unlimited updates
ws.send({ type: 'subscribe', symbol: 'BTCUSDT' });
// Server pushes updates (doesn't count against your rate limit)

// ❌ Bad: Polling by sending repeated messages
setInterval(() => {
  ws.send({ type: 'ping' }); // Counts against rate limit
}, 1000);
```

### **4. Clean Up on Disconnect**

```javascript
window.addEventListener('beforeunload', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
});
```

---

## 🧪 **Testing WebSocket Auth**

### **Test 1: Connect with Valid Token**

```javascript
const token = 'eyJhbGc...'; // Your valid JWT token
const ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

ws.onopen = () => {
  console.log('✅ Connected successfully!');
};
```

**Expected:** Connection succeeds

---

### **Test 2: Connect with Invalid Token**

```javascript
const ws = new WebSocket('ws://localhost:8080/ws?token=invalid');

ws.onerror = (error) => {
  console.error('❌ Connection rejected (as expected)');
};
```

**Expected:** Connection fails with 401

---

### **Test 3: Connect Without Auth (Timeout)**

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onmessage = (event) => {
  console.log('Received:', event.data);
  // After 5 seconds: "Authentication timeout..."
};
```

**Expected:** Connection closes after 5 seconds

---

### **Test 4: Exceed Connection Limit**

```javascript
// Open 3 connections (max)
const ws1 = new WebSocket(`ws://localhost:8080/ws?token=${token}`);
const ws2 = new WebSocket(`ws://localhost:8080/ws?token=${token}`);
const ws3 = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

// Try 4th connection
const ws4 = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

ws4.onerror = (error) => {
  console.error('❌ 4th connection rejected (as expected)');
};
```

**Expected:** 4th connection fails with 429

---

## 📚 **Complete Example (React Hook)**

```javascript
// useHopiumWebSocket.js
import { useState, useEffect, useRef } from 'react';

export function useHopiumWebSocket(token) {
  const [connected, setConnected] = useState(false);
  const [updates, setUpdates] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    // Connect with token in URL
    const ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setConnected(true);

      // Subscribe to BTCUSDT
      ws.send(JSON.stringify({
        type: 'subscribe',
        symbol: 'BTCUSDT',
        strategy: 'range_trading'
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'summary') {
        setUpdates(prev => [...prev, data]);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Cleanup on unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [token]);

  return { connected, updates };
}

// Usage in component
function TradingDashboard() {
  const { token } = useHopiumAuth();
  const { connected, updates } = useHopiumWebSocket(token);

  return (
    <div>
      <h1>Market Updates</h1>
      <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      
      {updates.map((update, i) => (
        <div key={i}>
          <h3>{update.symbol}</h3>
          <p>Side: {update.data.summary.entry.side}</p>
          <p>Price: {update.data.summary.entry.price}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## 📊 **Summary**

**WebSocket Security Features:**
- ✅ **Authentication required** (JWT token)
- ✅ **Two auth methods** (query param or message)
- ✅ **5-second auth timeout** (Method 2)
- ✅ **Connection limits** (3 per user)
- ✅ **Message rate limiting** (30/minute)
- ✅ **Subscription limits** (10/connection)

**For Production:**
- Use Method 1 (token in URL) for simplicity
- Or Method 2 (token in message) for better security
- Both are production-ready and secure

**Your WebSocket is now protected!** 🛡️

