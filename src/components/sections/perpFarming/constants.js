// Storage keys
export const STORAGE_KEY = 'perp_farming_settings'
export const STATS_STORAGE_KEY = 'perp_farming_stats'

// Aster Finance Fee Structure
export const MAKER_FEE = 0.00005 // 0.005% (LIMIT orders that make liquidity)
export const TAKER_FEE = 0.0004  // 0.04% (MARKET orders or LIMIT orders that take liquidity)
export const ENTRY_FEE = TAKER_FEE // Conservative estimate - assume taker
export const EXIT_FEE = TAKER_FEE  // MARKET orders are always taker

// Animation constants
export const RUNNING_SPEED_MULTIPLIER = 0.25
export const IDLE_SPEED_MULTIPLIER = 1

// Timing constants
export const PNL_POLL_INTERVAL = 2000 // 2 seconds
export const MESSAGE_CLEANUP_INTERVAL = 10000 // 10 seconds
export const STATS_SAVE_INTERVAL = 30000 // 30 seconds
export const SIGNAL_STATUS_POLL_INTERVAL = 300000 // 5 minutes
export const MESSAGE_UPDATE_THROTTLE = 30000 // 30 seconds

// Grace periods
export const POSITION_GRACE_PERIOD = 60 // seconds
export const REVERSAL_GRACE_PERIOD = 30 // seconds

