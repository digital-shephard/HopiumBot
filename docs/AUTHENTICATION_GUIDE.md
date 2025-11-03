# Authentication Guide

HopiumCore uses **wallet signature-based authentication** to secure user-specific endpoints. This ensures only wallet owners can access and modify their own data.

## 🔐 Authentication Flow

### 1. Request a Challenge

Request a unique message to sign with your wallet:

```bash
POST /api/auth/challenge
Content-Type: application/json

{
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
}
```

**Response:**
```json
{
  "message": "HopiumCore wants you to sign in with your Ethereum account:\n0x742d35Cc6634C0532925a3b844Bc454e4438f44e\n\nNonce: abc123...\nIssued At: 2025-11-01T10:30:00Z\nExpiration Time: 2025-11-01T10:35:00Z",
  "nonce": "abc123def456...",
  "expires_at": "2025-11-01T10:35:00Z"
}
```

> **Note:** The challenge expires in 5 minutes. You must sign and verify within this window.

### 2. Sign the Message

Use your wallet (MetaMask, ethers.js, etc.) to sign the challenge message:

**JavaScript Example (ethers.js v6):**
```javascript
import { BrowserProvider } from 'ethers';

const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const signature = await signer.signMessage(challengeMessage);
```

**JavaScript Example (ethers.js v5):**
```javascript
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
const signature = await signer.signMessage(challengeMessage);
```

### 3. Verify Signature and Get Token

Submit the signature to receive a JWT token:

```bash
POST /api/auth/verify
Content-Type: application/json

{
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "signature": "0xabcd1234...",
  "message": "HopiumCore wants you to sign in..."
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-11-02T10:30:00Z"
}
```

> **Note:** Tokens expire after 24 hours. You'll need to re-authenticate after expiration.

### 4. Use Token in Requests

Include the token in the `Authorization` header for all protected endpoints:

```bash
GET /api/tasks/user/0x742d35Cc6634C0532925a3b844Bc454e4438f44e
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📋 Protected vs Public Endpoints

### 🔒 Protected Endpoints (Require Authentication)

User-specific endpoints that require authentication:

- `POST /api/tasks/user/register` - Register user
- `GET /api/tasks/user/{address}` - Get user profile
- `POST /api/tasks/complete` - Complete a task
- `POST /api/tasks/twitter/follow` - Complete Twitter follow task
- `POST /api/tasks/referral/enter` - Enter referral code
- `POST /api/tasks/referral/verify` - Verify referral completion
- `GET /api/tasks/referral/{address}` - Get referral info
- `GET /api/tasks/discord/auth` - Initiate Discord OAuth

### 🌐 Public Endpoints (No Authentication)

Read-only or public endpoints:

- `POST /api/auth/challenge` - Request auth challenge
- `POST /api/auth/verify` - Verify signature
- `GET /api/perps/*` - All perps/market data endpoints
- `GET /api/tasks/leaderboard` - Public leaderboard
- `GET /api/tasks/leaderboard/user/{address}` - Public user rank
- `GET /api/airdrops` - List airdrop opportunities
- `GET /api/airdrops/{id}` - Get specific airdrop details
- `GET /health` - Health check

## 🔄 Complete Authentication Flow Example

### Frontend Implementation

```javascript
class HopiumCoreAuth {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.token = null;
    this.walletAddress = null;
  }

  async authenticate(walletAddress) {
    // Step 1: Request challenge
    const challengeResponse = await fetch(`${this.apiBaseUrl}/api/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: walletAddress })
    });
    
    const { message, nonce, expires_at } = await challengeResponse.json();
    console.log('Challenge received:', { nonce, expires_at });

    // Step 2: Sign message with wallet
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(message);
    console.log('Message signed');

    // Step 3: Verify signature and get token
    const verifyResponse = await fetch(`${this.apiBaseUrl}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletAddress,
        signature: signature,
        message: message
      })
    });

    const { token, expires_at: tokenExpiry } = await verifyResponse.json();
    
    // Store token
    this.token = token;
    this.walletAddress = walletAddress;
    
    console.log('Authentication successful!');
    console.log('Token expires at:', tokenExpiry);
    
    return token;
  }

  async makeAuthenticatedRequest(endpoint, options = {}) {
    if (!this.token) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      // Token expired or invalid
      throw new Error('Authentication expired. Please re-authenticate.');
    }

    return response;
  }

  // Example: Register user
  async registerUser() {
    const response = await this.makeAuthenticatedRequest('/api/tasks/user/register', {
      method: 'POST'
    });
    return await response.json();
  }

  // Example: Get user profile
  async getUserProfile() {
    const response = await this.makeAuthenticatedRequest(
      `/api/tasks/user/${this.walletAddress}`
    );
    return await response.json();
  }

  // Example: Complete a task
  async completeTask(taskType, taskData = {}) {
    const response = await this.makeAuthenticatedRequest('/api/tasks/complete', {
      method: 'POST',
      body: JSON.stringify({
        task_type: taskType,
        task_data: taskData
      })
    });
    return await response.json();
  }
}

// Usage
const auth = new HopiumCoreAuth('http://localhost:8080');

// Connect wallet and authenticate
const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
const walletAddress = accounts[0];

await auth.authenticate(walletAddress);

// Now make authenticated requests
const user = await auth.registerUser();
console.log('User registered:', user);

const profile = await auth.getUserProfile();
console.log('User profile:', profile);

const completion = await auth.completeTask('follow_twitter', {
  twitter_username: '@hopiumcore'
});
console.log('Task completed:', completion);
```

## 🔌 **WebSocket Authentication**

WebSocket connections **require authentication** to subscribe to real-time updates. Two methods are supported:

### **Method 1: Token in Query Parameter** (Recommended - Simplest)

```javascript
const auth = new HopiumCoreAuth('http://localhost:8080');

// Authenticate first to get token
await auth.authenticate(walletAddress);

// Connect WebSocket with token in URL
const ws = new WebSocket(`ws://localhost:8080/ws?token=${auth.token}`);

ws.onopen = () => {
  console.log('✅ WebSocket connected and authenticated!');
  
  // Subscribe to BTCUSDT with range trading strategy
  ws.send(JSON.stringify({
    type: 'subscribe',
    symbol: 'BTCUSDT',
    strategy: 'range_trading'  // or 'scalp' for high-frequency trading
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
  
  if (data.type === 'summary') {
    console.log('Market summary:', data.data);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
};
```

---

### **Method 2: Token in First Message** (More Secure)

```javascript
const auth = new HopiumCoreAuth('http://localhost:8080');

// Authenticate first to get token
await auth.authenticate(walletAddress);

// Connect without token
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  console.log('WebSocket connected, authenticating...');
  
  // Send authentication message (must be within 5 seconds)
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: auth.token
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'authenticated') {
    console.log('✅ Authenticated:', data.payload.wallet_address);
    
    // Now we can subscribe
    ws.send(JSON.stringify({
      type: 'subscribe',
      symbol: 'BTCUSDT',
      strategy: 'range_trading'
    }));
  }
  
  if (data.type === 'summary') {
    console.log('Market summary:', data.data);
  }
  
  if (data.type === 'auth_error') {
    console.error('Auth failed:', data.payload);
  }
};
```

---

### **Full WebSocket Class with Authentication**

```javascript
class HopiumWebSocket {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace('http', 'ws'); // http -> ws, https -> wss
    this.token = token;
    this.ws = null;
    this.isAuthenticated = false;
  }

  // Method 1: Connect with token in URL (recommended)
  connectWithToken() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${this.baseUrl}/ws?token=${this.token}`);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected and authenticated');
        this.isAuthenticated = true;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.setupMessageHandlers();
    });
  }

  // Method 2: Connect and authenticate via message
  connectWithMessage() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${this.baseUrl}/ws`);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected, sending auth...');
        
        // Send authentication within 5 seconds
        this.ws.send(JSON.stringify({
          type: 'authenticate',
          token: this.token
        }));
      };

      // Wait for authenticated response
      const authHandler = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'authenticated') {
          console.log('✅ Authenticated:', data.payload.wallet_address);
          this.isAuthenticated = true;
          this.ws.removeEventListener('message', authHandler);
          resolve();
        }
        
        if (data.type === 'error' || data.type === 'auth_error') {
          console.error('Auth failed:', data.payload);
          reject(new Error(data.payload.error || 'Authentication failed'));
        }
      };

      this.ws.addEventListener('message', authHandler);
      this.setupMessageHandlers();
    });
  }

  setupMessageHandlers() {
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.isAuthenticated = false;
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'subscribed':
        console.log('✅ Subscribed to:', data.symbol, 'with strategy:', data.strategy);
        break;
        
      case 'summary':
        console.log('📊 Market summary for', data.symbol);
        console.log('Entry:', data.data.summary.entry);
        break;
        
      case 'alert':
        console.log('⚠️ Alert:', data.data.description);
        break;
        
      case 'error':
        console.error('❌ Error:', data.payload);
        break;
    }
  }

  subscribe(symbol, strategy = 'range_trading') {
    if (!this.isAuthenticated) {
      console.error('Cannot subscribe: not authenticated');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      symbol: symbol,
      strategy: strategy  // 'range_trading', 'momentum', or 'scalp'
    }));
  }

  unsubscribe(symbol) {
    this.ws.send(JSON.stringify({
      type: 'unsubscribe',
      symbol: symbol
    }));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage Example
async function setupWebSocket() {
  // 1. Authenticate with HTTP API first
  const auth = new HopiumCoreAuth('http://localhost:8080');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  await auth.authenticate(accounts[0]);

  // 2. Connect WebSocket with token
  const wsClient = new HopiumWebSocket('http://localhost:8080', auth.token);
  
  // Method 1: Token in URL (recommended)
  await wsClient.connectWithToken();
  
  // OR Method 2: Token in message
  // await wsClient.connectWithMessage();

  // 3. Subscribe to symbols with different strategies
  wsClient.subscribe('BTCUSDT', 'range_trading');  // Default: 1-min updates
  
  // OR for high-frequency scalping (30-second updates)
  // wsClient.subscribe('BTCUSDT', 'scalp');

  // 4. Listen for updates (handled by setupMessageHandlers)
}

// Advanced Example: Scalp Strategy for Volume Farming
async function setupScalpTrading() {
  // 1. Authenticate
  const auth = new HopiumCoreAuth('http://localhost:8080');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  await auth.authenticate(accounts[0]);

  // 2. Connect WebSocket with scalp indicator handler
  const wsClient = new HopiumWebSocket('http://localhost:8080', auth.token);
  
  // Override handleMessage to handle scalp_indicator
  const originalHandler = wsClient.handleMessage.bind(wsClient);
  wsClient.handleMessage = (data) => {
    if (data.type === 'scalp_indicator') {
      console.log(`[SCALP] ${data.data.side} @ $${data.data.current_price} | EMA: $${data.data.ema_1min}`);
      
      if (data.data.side === 'LONG' && data.data.confidence === 'high') {
        console.log(`🟢 Place LONG: Entry $${data.data.limit_price} | TP: $${data.data.tp_price} | SL: $${data.data.sl_price}`);
        // Your order placement logic here
      } else if (data.data.side === 'SHORT' && data.data.confidence === 'high') {
        console.log(`🔴 Place SHORT: Entry $${data.data.limit_price} | TP: $${data.data.tp_price} | SL: $${data.data.sl_price}`);
        // Your order placement logic here
      }
    } else {
      originalHandler(data);
    }
  };

  await wsClient.connectWithToken();
  wsClient.subscribe('BTCUSDT', 'scalp');  // Subscribe to scalp strategy
  
  console.log('✅ Scalp strategy active - receiving updates every 30 seconds');
}
```

---

### **WebSocket Authentication Errors**

**Connection Rejected (Invalid Token):**
```
WebSocket connection failed: 401 Unauthorized
```

**Authentication Timeout (5 seconds):**
```json
{
  "type": "error",
  "payload": {
    "error": "Authentication timeout. You must authenticate within 5 seconds of connecting."
  }
}
```

**Connection Limit Exceeded:**
```
WebSocket connection failed: 429 Too Many Requests
Connection limit exceeded: maximum 3 connections per user
```

**Message Rate Limit Exceeded:**
```json
{
  "type": "error",
  "payload": {
    "error": "Message rate limit exceeded: maximum 30 messages per minute"
  }
}
```

**Subscription Limit Exceeded:**
```json
{
  "type": "error",
  "payload": {
    "error": "Subscription limit exceeded: maximum 10 subscriptions per connection"
  }
}
```

---

### **WebSocket Limits**

| Limit | Value | Reason |
|-------|-------|--------|
| **Auth Timeout** | 5 seconds | Must authenticate quickly |
| **Max Connections** | 3 per user | Allow multiple devices |
| **Message Rate** | 30/minute | Prevent spam |
| **Max Subscriptions** | 10 per connection | Reasonable for most use cases |

---

## 🛡️ Security Best Practices

### For Frontend Developers

1. **Never expose JWT tokens**
   - Store tokens securely (sessionStorage, not localStorage for security)
   - Clear tokens on logout
   - Never log tokens to console in production

2. **Handle token expiration**
   - Tokens expire after 24 hours
   - Implement automatic re-authentication
   - Show user-friendly "session expired" messages

3. **Validate wallet addresses**
   - Always verify connected wallet matches authenticated wallet
   - Handle wallet changes (user switching accounts)

4. **Use HTTPS in production**
   - Never send tokens over HTTP
   - Validate SSL certificates

### For Backend Developers

1. **Keep JWT_SECRET secure**
   - Generate strong random secret: `openssl rand -hex 32`
   - Never commit to version control
   - Rotate periodically in production

2. **Monitor for suspicious activity**
   - Log authentication attempts
   - Implement rate limiting (TODO - next security phase)
   - Watch for unusual patterns

## 🔧 Troubleshooting

### "Invalid or expired token"
- Token has expired (24 hour limit)
- Re-authenticate to get new token

### "Signature does not match wallet address"
- Wrong wallet used to sign
- Message was modified
- Ensure you're signing the exact challenge message

### "Invalid or expired nonce"
- Challenge expired (5 minute limit)
- Nonce already used (replay attack prevention)
- Request a new challenge

### "Authentication required"
- Missing Authorization header
- Token not included in request
- Endpoint requires authentication

## 📚 API Response Examples

### Success Response
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXRfYWRkcmVzcyI6IjB4NzQyZDM1Q2M2NjM0QzA1MzI5MjVhM2I4NDRCYzQ1NGU0NDM4ZjQ0ZSIsImV4cCI6MTczMDU1MDYwMCwiaWF0IjoxNzMwNDY0MjAwfQ.signature",
  "expires_at": "2025-11-02T10:30:00Z"
}
```

### Error Responses

**400 Bad Request - Missing wallet address**
```json
{
  "error": "wallet_address is required"
}
```

**401 Unauthorized - Invalid signature**
```json
{
  "error": "Failed to verify signature: signature does not match wallet address"
}
```

**401 Unauthorized - Expired nonce**
```json
{
  "error": "Failed to verify signature: invalid or expired nonce"
}
```

**503 Service Unavailable - Auth not configured**
```json
{
  "error": "Authentication not configured"
}
```

## 🔜 Next Steps

Once you have authentication working:

1. Read the [API Integration Guide](./API_INTEGRATION_GUIDE.md) for full endpoint documentation
2. Explore the [HopiumTasks API](./API_INTEGRATION_GUIDE.md#hopiumtasks-api-reference) for task completion
3. Check out [WebSocket documentation](./API_INTEGRATION_GUIDE.md#websocket-api) for real-time updates

## ⚠️ Important Notes

- **Wallet ownership is proof of identity** - Anyone with access to the wallet can authenticate
- **Nonces are single-use** - Each challenge can only be verified once
- **Tokens are bearer tokens** - Treat them like passwords
- **No password recovery** - Authentication is tied to wallet ownership
- **Case sensitivity** - Wallet addresses are normalized to checksum format

