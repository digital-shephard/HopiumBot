/**
 * useWebSocket Hook
 * 
 * React hook for managing authenticated WebSocket connections to HopiumCore
 * 
 * Features:
 * - Automatic authentication with JWT token
 * - Auto-connect/disconnect based on auth state
 * - Handles token expiration and reconnection
 * - Easy subscription management
 * - Real-time updates via callbacks
 * 
 * @example
 * ```javascript
 * import { useWebSocket } from '../hooks/useWebSocket'
 * import { useAuth } from '../contexts/AuthContext'
 * 
 * function TradingDashboard() {
 *   const { token, isAuthenticated } = useAuth()
 *   const { connected, subscribe, updates, error } = useWebSocket(token, isAuthenticated)
 *   
 *   useEffect(() => {
 *     if (connected) {
 *       subscribe('BTCUSDT', 'range_trading')
 *     }
 *   }, [connected])
 *   
 *   return (
 *     <div>
 *       <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
 *       {updates.map(update => <div key={update.timestamp}>{update.symbol}</div>)}
 *     </div>
 *   )
 * }
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { HopiumWebSocketClient } from '../services/websocket'

/**
 * Hook for managing authenticated WebSocket connection
 * 
 * @param {string} token - JWT authentication token
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {Object} options - Optional configuration
 * @param {boolean} options.autoConnect - Auto-connect when authenticated (default: true)
 * @param {boolean} options.autoReconnect - Auto-reconnect on disconnect (default: true)
 * @param {number} options.maxReconnectDelay - Max delay between reconnect attempts in ms (default: 30000)
 * @returns {Object} WebSocket state and methods
 */
export function useWebSocket(token, isAuthenticated, options = {}) {
  const {
    autoConnect = true,
    autoReconnect = true,
    maxReconnectDelay = 30000
  } = options

  // State
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [updates, setUpdates] = useState([])
  const [alerts, setAlerts] = useState([])
  const [subscriptions, setSubscriptions] = useState([])

  // Refs
  const clientRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectDelayRef = useRef(3000) // Start with 3 second delay

  /**
   * Initialize WebSocket client (once)
   */
  useEffect(() => {
    if (!clientRef.current) {
      console.log('[useWebSocket] Initializing WebSocket client')
      clientRef.current = new HopiumWebSocketClient()
      
      // Set up event handlers
      clientRef.current.onConnect = () => {
        console.log('[useWebSocket] Connected')
        setConnected(true)
        setConnecting(false)
        setError(null)
        reconnectDelayRef.current = 3000 // Reset reconnect delay on successful connection
      }

      clientRef.current.onDisconnect = (event) => {
        console.log('[useWebSocket] Disconnected')
        setConnected(false)
        setConnecting(false)
        setSubscriptions([])
        
        // Handle reconnection
        if (autoReconnect && isAuthenticated && token && event.code !== 1000) {
          // Don't reconnect on normal closure (1000)
          scheduleReconnect()
        }
      }

      clientRef.current.onSummary = (data) => {
        console.log('[useWebSocket] Received summary for', data.symbol)
        setUpdates(prev => [...prev, { 
          type: 'summary', 
          ...data,
          receivedAt: new Date().toISOString()
        }])
      }

      clientRef.current.onAlert = (data) => {
        console.log('[useWebSocket] Received alert:', data.change_type)
        setAlerts(prev => [...prev, {
          ...data,
          receivedAt: new Date().toISOString()
        }])
      }

      clientRef.current.onError = (errorData) => {
        const errorMsg = errorData.payload?.error || 'WebSocket error'
        console.error('[useWebSocket] Error:', errorMsg)
        setError(errorMsg)
        
        // Check if requires re-authentication
        if (errorData.payload?.requiresReauth) {
          console.warn('[useWebSocket] Re-authentication required')
          setConnected(false)
          setConnecting(false)
        }
      }

      clientRef.current.onSubscribed = (symbol) => {
        console.log('[useWebSocket] Subscribed to', symbol)
        setSubscriptions(prev => [...new Set([...prev, symbol])])
      }
    }

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (clientRef.current?.isConnected()) {
        console.log('[useWebSocket] Disconnecting on unmount')
        clientRef.current.disconnect()
      }
    }
  }, []) // Only run once

  /**
   * Schedule reconnection with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    console.log(`[useWebSocket] Reconnecting in ${reconnectDelayRef.current}ms...`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (isAuthenticated && token && !connected && !connecting) {
        console.log('[useWebSocket] Attempting reconnect...')
        connectToWebSocket(token)
        
        // Exponential backoff (double delay, max 30 seconds)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, maxReconnectDelay)
      }
    }, reconnectDelayRef.current)
  }, [isAuthenticated, token, connected, connecting, maxReconnectDelay])

  /**
   * Connect to WebSocket
   */
  const connectToWebSocket = useCallback(async (authToken) => {
    if (!authToken || !clientRef.current) {
      console.warn('[useWebSocket] Cannot connect: missing token or client')
      return
    }

    if (clientRef.current.isConnected()) {
      console.log('[useWebSocket] Already connected')
      return
    }

    try {
      setConnecting(true)
      setError(null)
      await clientRef.current.connect(authToken)
    } catch (err) {
      console.error('[useWebSocket] Connection failed:', err)
      setError(err.message || 'Failed to connect to WebSocket')
      setConnecting(false)
      
      // Schedule reconnect if appropriate
      if (autoReconnect && isAuthenticated) {
        scheduleReconnect()
      }
    }
  }, [autoReconnect, isAuthenticated, scheduleReconnect])

  /**
   * Auto-connect when authenticated
   */
  useEffect(() => {
    if (autoConnect && isAuthenticated && token && !connected && !connecting) {
      console.log('[useWebSocket] Auto-connecting...')
      connectToWebSocket(token)
    } else if (!isAuthenticated && connected) {
      // Disconnect if user logs out
      console.log('[useWebSocket] User logged out, disconnecting...')
      disconnect()
    }
  }, [autoConnect, isAuthenticated, token, connected, connecting, connectToWebSocket])

  /**
   * Manual connect
   */
  const connect = useCallback(() => {
    if (!token) {
      console.warn('[useWebSocket] Cannot connect: no token')
      setError('Authentication required. Please sign in.')
      return
    }
    connectToWebSocket(token)
  }, [token, connectToWebSocket])

  /**
   * Disconnect
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (clientRef.current) {
      clientRef.current.disconnect()
    }
    setConnected(false)
    setConnecting(false)
    setSubscriptions([])
  }, [])

  /**
   * Subscribe to a symbol
   */
  const subscribe = useCallback((symbol, strategy = 'range_trading') => {
    if (!clientRef.current?.isConnected()) {
      console.warn('[useWebSocket] Cannot subscribe: not connected')
      setError('Not connected. Please connect first.')
      return
    }

    try {
      clientRef.current.subscribe(symbol, strategy)
    } catch (err) {
      console.error('[useWebSocket] Subscribe failed:', err)
      setError(err.message)
    }
  }, [])

  /**
   * Unsubscribe from a symbol
   */
  const unsubscribe = useCallback((symbol) => {
    if (!clientRef.current?.isConnected()) {
      console.warn('[useWebSocket] Cannot unsubscribe: not connected')
      return
    }

    try {
      clientRef.current.unsubscribe(symbol)
      setSubscriptions(prev => prev.filter(s => s !== symbol))
    } catch (err) {
      console.error('[useWebSocket] Unsubscribe failed:', err)
      setError(err.message)
    }
  }, [])

  /**
   * Clear updates history
   */
  const clearUpdates = useCallback(() => {
    setUpdates([])
  }, [])

  /**
   * Clear alerts history
   */
  const clearAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    // State
    connected,
    connecting,
    error,
    updates,
    alerts,
    subscriptions,
    
    // Methods
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    clearUpdates,
    clearAlerts,
    clearError,
    
    // Client reference (for advanced usage)
    client: clientRef.current
  }
}

export default useWebSocket

