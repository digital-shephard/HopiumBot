/**
 * TypeScript type definitions for HopiumCore WebSocket API
 * These types can be used for IDE autocomplete and type checking
 */

// ============================================================================
// Base Message Types
// ============================================================================

/**
 * Base structure for all WebSocket messages
 */
export interface WebSocketMessage {
  type: string
  symbol?: string
  id?: number
  payload?: any
}

/**
 * Client-to-server message types
 */
export type ClientMessageType = 
  | 'subscribe'
  | 'unsubscribe'
  | 'list_subscriptions'
  | 'ping'

/**
 * Server-to-client message types
 */
export type ServerMessageType = 
  | 'subscribed'
  | 'unsubscribed'
  | 'subscriptions'
  | 'pong'
  | 'summary'
  | 'alert'
  | 'error'

// ============================================================================
// Client-to-Server Messages
// ============================================================================

export interface SubscribeMessage extends WebSocketMessage {
  type: 'subscribe'
  symbol: string
  id: number
}

export interface UnsubscribeMessage extends WebSocketMessage {
  type: 'unsubscribe'
  symbol: string
  id: number
}

export interface ListSubscriptionsMessage extends WebSocketMessage {
  type: 'list_subscriptions'
  id: number
}

export interface PingMessage extends WebSocketMessage {
  type: 'ping'
  id: number
}

// ============================================================================
// Server-to-Client Response Messages
// ============================================================================

export interface SubscribedResponse extends WebSocketMessage {
  type: 'subscribed'
  symbol: string
  id: number
  payload: {
    subscribed: string[]
  }
}

export interface UnsubscribedResponse extends WebSocketMessage {
  type: 'unsubscribed'
  symbol: string
  id: number
  payload: {
    subscribed: string[]
  }
}

export interface SubscriptionsResponse extends WebSocketMessage {
  type: 'subscriptions'
  id: number
  payload: {
    subscribed: string[]
  }
}

export interface PongResponse extends WebSocketMessage {
  type: 'pong'
  id: number
}

// ============================================================================
// Market Data Types
// ============================================================================

/**
 * Current market state
 */
export interface CurrentMarketData {
  price: string
  mark_price: string
  funding_rate: string
  index_price: string
  spread: string
  bid_price: string
  ask_price: string
  bid_qty: string
  ask_qty: string
  volume_24h: string
}

/**
 * Market trends over time periods
 */
export interface MarketTrends {
  price_1h: string
  price_24h: string
  funding_rate_1h: string
  spread_1h: string
  volume_1h?: string
}

/**
 * Market indicators
 */
export type MomentumValue = 'bullish' | 'bearish' | 'neutral'
export type VolatilityLevel = 'low' | 'moderate' | 'high'
export type LiquidityLevel = 'low' | 'moderate' | 'high'
export type FundingSentiment = 'long-heavy' | 'short-heavy' | 'neutral'

export interface MarketIndicators {
  momentum: MomentumValue
  volatility: VolatilityLevel
  liquidity: LiquidityLevel
  funding_sentiment: FundingSentiment
}

/**
 * Entry recommendation from LLM
 */
export interface EntryRecommendation {
  price: string
  side: 'LONG' | 'SHORT'
  order_type: 'LIMIT' | 'MARKET'
  tolerance_percent: number
  reasoning: string
}

/**
 * Severity level for trading signals
 */
export type SeverityLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * LLM summary and analysis
 */
export interface LLMSummary {
  summary: string[]
  entry: EntryRecommendation
  severity: SeverityLevel
  sentiment_change: boolean
}

/**
 * Aggregated market snapshot
 */
export interface AggregatedSnapshot {
  timestamp: string
  symbol: string
  current: CurrentMarketData
  trends: MarketTrends
  indicators: MarketIndicators
  context: string[]
  llm_summary?: LLMSummary
}

// ============================================================================
// Server Push Messages
// ============================================================================

/**
 * Summary update message (pushed every 5 minutes or on significant change)
 */
export interface SummaryMessage {
  type: 'summary'
  symbol: string
  data: {
    summary: LLMSummary
    timestamp: string
    symbol: string
    previous_side?: string
  }
}

/**
 * Alert change types
 */
export type AlertChangeType = 
  | 'momentum_shift'
  | 'funding_flip'
  | 'price_spike'
  | 'volatility_spike'
  | 'liquidity_drop'
  | 'sentiment_change'

/**
 * Alert message (pushed immediately on significant change)
 */
export interface AlertMessage {
  type: 'alert'
  symbol: string
  data: {
    change_type: AlertChangeType
    description: string
    timestamp: string
  }
}

/**
 * Error message from server
 */
export interface ErrorMessage {
  type: 'error'
  id?: number
  payload: {
    error: string
  }
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * All possible client messages
 */
export type ClientMessage = 
  | SubscribeMessage
  | UnsubscribeMessage
  | ListSubscriptionsMessage
  | PingMessage

/**
 * All possible server messages
 */
export type ServerMessage = 
  | SubscribedResponse
  | UnsubscribedResponse
  | SubscriptionsResponse
  | PongResponse
  | SummaryMessage
  | AlertMessage
  | ErrorMessage

// ============================================================================
// Event Handler Types
// ============================================================================

export type SummaryHandler = (data: SummaryMessage['data']) => void
export type AlertHandler = (data: AlertMessage['data']) => void
export type ErrorHandler = (error: ErrorMessage) => void
export type ConnectionHandler = () => void
export type DisconnectionHandler = (event: CloseEvent) => void






