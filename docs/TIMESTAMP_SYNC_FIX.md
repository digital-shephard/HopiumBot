# Timestamp Synchronization Fix

## Problem

Users were experiencing the following error when trying to place orders:

```
[OrderManager] Failed to place momentum order: Error: Timestamp for this request was 1000ms ahead of the server's time.
```

This error occurs when the client's system clock is ahead of (or significantly behind) the Aster API server's clock by more than 1000ms (1 second).

## Root Cause

The Aster Finance API has strict timestamp requirements for security:

```javascript
if (timestamp < (serverTime + 1000) && (serverTime - timestamp) <= recvWindow) {
  // process request
} else {
  // reject request - timestamp is too far ahead or behind
}
```

- Timestamps cannot be more than **1000ms ahead** of server time
- Timestamps must be within the `recvWindow` (default: 5000ms)

Previously, the API client was using `Date.now()` directly, which relies on the user's system clock. If the user's clock was ahead by even 1 second, all API requests would fail.

## Solution

Implemented automatic server time synchronization in `AsterApiClient`:

### 1. Server Time Sync Method

```javascript
async syncServerTime() {
  try {
    const beforeRequest = Date.now()
    const response = await fetch(`${this.baseUrl}/fapi/v1/time`)
    const afterRequest = Date.now()
    
    if (!response.ok) {
      console.warn('[AsterApiClient] Failed to sync server time:', response.status)
      return
    }
    
    const data = await response.json()
    const serverTime = data.serverTime
    
    // Calculate network latency (round-trip time / 2)
    const latency = (afterRequest - beforeRequest) / 2
    
    // Calculate offset: serverTime - (our time + latency adjustment)
    this.timeOffset = serverTime - (afterRequest - latency)
    this.lastSyncTime = Date.now()
    
    console.log(`[AsterApiClient] ✅ Time synced - Offset: ${this.timeOffset}ms`)
  } catch (error) {
    console.error('[AsterApiClient] Failed to sync server time:', error)
    // Continue with 0 offset if sync fails
  }
}
```

### 2. Server-Synchronized Timestamp

```javascript
getServerTime() {
  return Date.now() + this.timeOffset
}
```

### 3. Automatic Re-sync

```javascript
async ensureTimeSynced() {
  const timeSinceLastSync = Date.now() - this.lastSyncTime
  if (this.lastSyncTime === 0 || timeSinceLastSync > this.syncInterval) {
    await this.syncServerTime()
  }
}
```

### 4. Integration with API Requests

Before making any signed API request, the client:
1. Calls `ensureTimeSynced()` to check if re-sync is needed
2. Uses `getServerTime()` to get synchronized timestamp
3. Continues with signature generation and request

```javascript
async request(method, endpoint, params = {}, options = {}) {
  const isSigned = options.signed !== false
  if (isSigned) {
    // Ensure time is synced before making signed requests
    await this.ensureTimeSynced()
    
    // Use server-synchronized timestamp
    params.timestamp = this.getServerTime()
    // ... rest of request logic
  }
}
```

### 5. Initialization

Time sync happens automatically when `AsterDexService` is initialized:

```javascript
async initialize(credentials) {
  this.apiClient = new AsterApiClient(credentials.apiKey, credentials.secretKey)
  
  // Sync time with server immediately to prevent timestamp errors
  await this.apiClient.syncServerTime()
  
  this.initialized = true
}
```

## Benefits

✅ **Automatic**: No user intervention required  
✅ **Accurate**: Accounts for network latency  
✅ **Self-healing**: Re-syncs every 60 seconds  
✅ **Graceful**: Falls back to local time if sync fails  
✅ **Transparent**: Logs sync status for debugging  

## Testing

To test the fix:

1. **Change System Clock**: Set your system clock 5 seconds ahead
2. **Start Trading**: Configure Perp Farming and click "Start"
3. **Expected Result**: 
   - Console shows: `[AsterApiClient] ✅ Time synced - Offset: -5000ms (client ahead)`
   - Orders place successfully
   - No timestamp errors

## Technical Details

- **Endpoint**: `GET /fapi/v1/time` (public endpoint, no auth required)
- **Response**: `{ "serverTime": 1699827319559 }`
- **Latency Compensation**: Uses average round-trip time to adjust for network delay
- **Re-sync Interval**: 60 seconds (configurable via `syncInterval`)
- **Fallback**: If sync fails, continues with `timeOffset = 0` (local time)

## Files Modified

- `src/services/dex/aster/AsterApiClient.js` - Added sync methods and offset tracking
- `src/services/dex/aster/AsterDexService.js` - Added initial sync on initialization
- `README.md` - Documented the feature

## API Reference

The Aster Finance API's time synchronization endpoint:

```
GET /fapi/v1/time

Response:
{
  "serverTime": 1499827319559
}
```

This endpoint is used to get the current server time in milliseconds (Unix timestamp).

