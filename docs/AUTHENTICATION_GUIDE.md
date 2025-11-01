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

