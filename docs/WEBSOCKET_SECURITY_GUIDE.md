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

