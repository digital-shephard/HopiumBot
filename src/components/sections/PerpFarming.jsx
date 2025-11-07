import { useState, useEffect, useRef } from 'react'
import './PerpFarming.css'
import asterLogo from '../../assets/aster_logo.png'
import OrderManager from '../../services/orderManager'
import { HopiumWebSocketClient } from '../../services/websocket'
import AsterDexService from '../../services/dex/aster/AsterDexService'
import { useAuth } from '../../contexts/AuthContext'
import API_CONFIG from '../../config/api'

const STORAGE_KEY = 'perp_farming_settings'
const STATS_STORAGE_KEY = 'perp_farming_stats'

// Aster Finance Fee Structure
const MAKER_FEE = 0.00005 // 0.005% (LIMIT orders that make liquidity)
const TAKER_FEE = 0.0004  // 0.04% (MARKET orders or LIMIT orders that take liquidity)
const ENTRY_FEE = TAKER_FEE // Conservative estimate - assume taker
const EXIT_FEE = TAKER_FEE  // MARKET orders are always taker

// Smart Mode exit statements
const SMART_MODE_STATEMENTS = {
  low_confidence: [
    "Confidence dropped, cutting losses early",
    "Market looking shaky, taking the small loss",
    "Signal weakening, protecting capital",
    "Better safe than sorry, exiting position",
    "Trade not playing out, minimizing damage",
    "Confidence fading, preserving funds",
    "Smart exit - avoiding deeper losses",
    "Early exit activated, capital protected",
    "Signal deteriorating, closing position",
    "Not worth the risk, exiting early",
    "Confidence too low, cutting losses",
    "Protecting the bag, closing position",
    "Trade losing steam, smart exit triggered",
    "Risk management activated",
    "Better to exit now than wait for SL",
    "Confidence dropped, damage control mode",
    "Smart mode saved you from a bigger loss",
    "Early detection, early exit",
    "Capital preservation > holding hope",
    "Trade invalidated, closing early"
  ],
  reversal: [
    "Market direction flipped, exiting",
    "Signal reversed, closing position",
    "Direction changed, taking the exit",
    "Market switched sides, closing out"
  ]
}

// Get random Smart Mode statement based on exit reason
function getSmartModeStatement(reason) {
  let statements
  
  if (reason === 'reversal') {
    statements = SMART_MODE_STATEMENTS.reversal
  } else {
    // low_confidence_threshold or consecutive_low_confidence
    statements = SMART_MODE_STATEMENTS.low_confidence
  }
  
  const randomIndex = Math.floor(Math.random() * statements.length)
  return statements[randomIndex]
}

function PerpFarming({ onBotMessageChange, onBotStatusChange }) {
  // Get auth context for WebSocket authentication
  const { authService } = useAuth()
  
  const [showModal, setShowModal] = useState(false)
  const [asterApiKey, setAsterApiKey] = useState('')
  const [asterSecretKey, setAsterSecretKey] = useState('')
  const [capital, setCapital] = useState('')
  const [leverage, setLeverage] = useState(75)
  const [takeProfit, setTakeProfit] = useState(10)
  const [stopLoss, setStopLoss] = useState(10)
  const [tpSlMode, setTpSlMode] = useState('percent') // 'percent' or 'dollar'
  const [positionSize, setPositionSize] = useState(10)
  const [strategy, setStrategy] = useState('range_trading')
  const [orderType, setOrderType] = useState('LIMIT') // 'LIMIT' or 'MARKET'
  const [orderTimeout, setOrderTimeout] = useState(120) // Order timeout in seconds (default 120)
  const [autoMode, setAutoMode] = useState(false) // Auto Mode - Hourly Scanner (replaces all other strategies)
  const [smartMode, setSmartMode] = useState(true) // Smart Mode - active position management
  const [smartModeMinPnl, setSmartModeMinPnl] = useState(-50) // Minimum PNL before Smart Mode can exit (default -$50)
  const [trustLowConfidence, setTrustLowConfidence] = useState(false) // Allow trading on low confidence signals
  const [breakEvenMode, setBreakEvenMode] = useState(false)
  const [breakEvenLossTolerance, setBreakEvenLossTolerance] = useState(20) // Loss tolerance in dollars for breakeven mode
  const [trailingBreakEven, setTrailingBreakEven] = useState(false)
  const [trailingIncrement, setTrailingIncrement] = useState(20) // Dollar increment for trailing stop (default $20)
  const [shakeApiKey, setShakeApiKey] = useState(false)
  const [shakeSecretKey, setShakeSecretKey] = useState(false)
  const [shakeCapital, setShakeCapital] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [tradingSymbols, setTradingSymbols] = useState([]) // Array of symbols being traded
  const [allowedEquity, setAllowedEquity] = useState('')
  const [pnl, setPnl] = useState(0)
  const [prevPnl, setPrevPnl] = useState(0)
  const [overallPnl, setOverallPnl] = useState(0)
  const [totalTrades, setTotalTrades] = useState(0)
  const [estimatedFees, setEstimatedFees] = useState(0)
  const [botMessage, setBotMessage] = useState('Initializing...')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showPairSelection, setShowPairSelection] = useState(false) // Toggle between settings and pair selection
  const [availableSymbols, setAvailableSymbols] = useState([]) // List of symbols from API
  const [selectedPairs, setSelectedPairs] = useState(['BTCUSDT']) // Default to BTC, max 5
  const [loadingSymbols, setLoadingSymbols] = useState(false)
  const [hourlyPositions, setHourlyPositions] = useState([]) // Track Auto Mode positions
  
  const orderManagerRef = useRef(null)
  const wsClientRef = useRef(null)
  const errorHandlerRef = useRef(null)
  const speedChangeTimeRef = useRef(Date.now())
  const previousSpeedRef = useRef(1)
  const lineStartTimesRef = useRef(new Map())
  const pnlPollIntervalRef = useRef(null)
  const lastPositionCountRef = useRef(0)
  const lastPnlRef = useRef(0)
  const peakPnlRef = useRef(0)
  const trailingStopRef = useRef(0)
  const bestBreakEvenPnlRef = useRef(Number.NEGATIVE_INFINITY) // Track best (closest to 0) PnL for breakeven loss tolerance

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY)
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        setAsterApiKey(settings.asterApiKey || '')
        setAsterSecretKey(settings.asterSecretKey || '')
        setCapital(settings.capital || '')
        setLeverage(settings.leverage !== undefined ? settings.leverage : 75)
        setTakeProfit(settings.takeProfit !== undefined ? settings.takeProfit : 10)
        setStopLoss(settings.stopLoss !== undefined ? settings.stopLoss : 10)
        setTpSlMode(settings.tpSlMode || 'percent')
        setPositionSize(settings.positionSize !== undefined ? settings.positionSize : 10)
        setStrategy(settings.strategy || 'range_trading')
        setOrderType(settings.orderType || 'LIMIT')
        setOrderTimeout(settings.orderTimeout !== undefined ? settings.orderTimeout : 120)
        setAutoMode(settings.autoMode || false) // Auto Mode (Hourly Scanner)
        setSmartMode(settings.smartMode !== undefined ? settings.smartMode : true) // Default enabled
        setSmartModeMinPnl(settings.smartModeMinPnl !== undefined ? settings.smartModeMinPnl : -50)
        setTrustLowConfidence(settings.trustLowConfidence || false)
        setBreakEvenMode(settings.breakEvenMode || false)
        setBreakEvenLossTolerance(settings.breakEvenLossTolerance !== undefined ? settings.breakEvenLossTolerance : 20)
        setTrailingBreakEven(settings.trailingBreakEven || false)
        setTrailingIncrement(settings.trailingIncrement !== undefined ? settings.trailingIncrement : 20)
        setSelectedPairs(settings.selectedPairs || ['BTCUSDT']) // Load selected pairs
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }

    // Fetch available symbols from API on mount
    fetchAvailableSymbols()

    // Load stats from localStorage
    const savedStats = localStorage.getItem(STATS_STORAGE_KEY)
    if (savedStats) {
      try {
        const stats = JSON.parse(savedStats)
        setOverallPnl(stats.overallPnl || 0)
        setTotalTrades(stats.totalTrades || 0)
      } catch (error) {
        console.error('Error loading stats:', error)
      }
    }
  }, [])

  // Fetch available symbols from API
  const fetchAvailableSymbols = async () => {
    setLoadingSymbols(true)
    try {
      const response = await API_CONFIG.fetch(API_CONFIG.endpoints.symbols, {
        includeAuth: true // Requires authentication
      })
      setAvailableSymbols(response.symbols || [])
      console.log('[PerpFarming] Loaded symbols:', response.symbols)
    } catch (error) {
      console.error('[PerpFarming] Error fetching symbols:', error)
      // Fallback to default symbols
      setAvailableSymbols(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
    } finally {
      setLoadingSymbols(false)
    }
  }

  // Handle pair selection toggle
  const togglePairSelection = (symbol) => {
    setSelectedPairs((prev) => {
      if (prev.includes(symbol)) {
        // Deselect - ensure at least 1 pair is selected
        if (prev.length === 1) {
          return prev // Can't deselect last pair
        }
        return prev.filter((s) => s !== symbol)
      } else {
        // Select - max 5 pairs
        if (prev.length >= 5) {
          return prev // Already at max
        }
        return [...prev, symbol]
      }
    })
  }

  // Helper function to format percentage display
  const formatPercentage = (value) => {
    return value === 0 ? 'None' : `${value}%`
  }

  // Helper function to save stats to localStorage
  const saveStats = (newOverallPnl, newTotalTrades) => {
    const stats = {
      overallPnl: newOverallPnl,
      totalTrades: newTotalTrades,
      lastUpdated: Date.now()
    }
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats))
    console.log(`[Stats] Saved:`, stats)
  }

  const handleStart = async () => {
    let isValid = true
    setValidationError('') // Clear any previous errors

    // Validate API key
    if (!asterApiKey || asterApiKey.trim() === '') {
      setShakeApiKey(true)
      setTimeout(() => setShakeApiKey(false), 500)
      isValid = false
    }

    // Validate API secret
    if (!asterSecretKey || asterSecretKey.trim() === '') {
      setShakeSecretKey(true)
      setTimeout(() => setShakeSecretKey(false), 500)
      isValid = false
    }

    // Validate capital
    const capitalNum = parseFloat(capital)
    if (!capital || capital.trim() === '' || capitalNum === 0 || isNaN(capitalNum)) {
      setShakeCapital(true)
      setTimeout(() => setShakeCapital(false), 500)
      isValid = false
    }

    if (!isValid) {
      return
    }

    // Validate API keys against Aster API
    setIsValidating(true)
    setValidationError('')
    try {
      const dexService = new AsterDexService()
      await dexService.initialize({
        apiKey: asterApiKey.trim(),
        secretKey: asterSecretKey.trim()
      })
      
      // Validate credentials by making an API call
      await dexService.validateCredentials()
      
      // Credentials are valid - proceed
      setIsValidating(false)
      setValidationError('')
      
      // Save settings
      const settings = {
        asterApiKey: asterApiKey.trim(),
        asterSecretKey: asterSecretKey.trim(),
        capital,
        leverage,
        takeProfit,
        stopLoss,
        tpSlMode,
        positionSize,
        strategy,
        orderType,
        orderTimeout,
        autoMode, // Auto Mode (Hourly Scanner)
        smartMode,
        smartModeMinPnl,
        trustLowConfidence,
        breakEvenMode,
        breakEvenLossTolerance,
        trailingBreakEven,
        trailingIncrement,
        selectedPairs // Save selected pairs
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      setShowModal(false)

      // Set running state immediately after API key confirmation
      setIsRunning(true)
      if (onBotStatusChange) onBotStatusChange(true)
      // Format and store capital amount for display
      const capitalNum = parseFloat(capital)
      setAllowedEquity(capitalNum.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      }))

      // Initialize OrderManager and WebSocket (non-blocking)
      try {
        await startTrading(settings)
      } catch (error) {
        handleError(`Failed to start trading: ${error.message}`)
        // Don't set isRunning to false here - let user manually stop if needed
      }
    } catch (error) {
      // Invalid credentials - shake red and show error
      setIsValidating(false)
      setShakeApiKey(true)
      setShakeSecretKey(true)
      setTimeout(() => {
        setShakeApiKey(false)
        setShakeSecretKey(false)
      }, 500)
      
      // Show error message with note about new keys
      const errorMsg = error.message.includes('Invalid API') || error.message.includes('credentials')
        ? 'Invalid API credentials. Please check your API key and secret. New keys may take a while to become active.'
        : `Validation failed: ${error.message}. New keys may take a while to become active.`
      setValidationError(errorMsg)
      handleError(errorMsg)
    }
  }

  const handleError = (errorMessage) => {
    console.error('[PerpFarming]', errorMessage)
    if (errorHandlerRef.current) {
      errorHandlerRef.current(errorMessage)
    }
  }

  // Helper function to close a position and update stats
  const closePosition = async (orderManager, symbol, currentNetPnl) => {
    try {
      const position = await orderManager.dexService.getPosition(symbol)
      const positionAmtRaw = position.positionAmt || '0'
      const positionAmt = parseFloat(positionAmtRaw)
      
      if (positionAmt === 0) {
        console.log(`No position to close for ${symbol}`)
        return
      }
      
      const oppositeSide = positionAmt > 0 ? 'SELL' : 'BUY'
      
      // Use absolute value of RAW string to preserve exact precision
      const quantityStr = positionAmt < 0 ? positionAmtRaw.substring(1) : positionAmtRaw
      
      console.log(`[ClosePosition] Closing ${symbol} with Net PNL: $${currentNetPnl.toFixed(2)}`, {
        rawPositionAmt: positionAmtRaw,
        quantityToClose: quantityStr,
        side: oppositeSide
      })
      
      const result = await orderManager.dexService.placeOrder({
        symbol: symbol,
        side: oppositeSide,
        type: 'MARKET',
        quantity: quantityStr,
        reduceOnly: true,
        rawQuantity: true // Skip formatting - use exact positionAmt
      })
      
      console.log(`[ClosePosition] Order placed:`, result)
      
      // IMMEDIATELY update overall stats with the Net PNL we have right now
      setOverallPnl(prev => {
        const newValue = prev + currentNetPnl
        console.log(`[Stats] IMMEDIATE UPDATE: Overall PNL: $${prev.toFixed(2)} + $${currentNetPnl.toFixed(2)} = $${newValue.toFixed(2)}`)
        
        setTotalTrades(currentTrades => {
          const newTradeCount = currentTrades + 1
          saveStats(newValue, newTradeCount)
          return newTradeCount
        })
        
        return newValue
      })
      
      // Verify position is fully closed
      setTimeout(async () => {
        const updatedPosition = await orderManager.dexService.getPosition(symbol)
        const remainingAmt = parseFloat(updatedPosition.positionAmt)
        if (Math.abs(remainingAmt) > 0.00001) { // Use small tolerance for floating point
          console.warn(`[ClosePosition] ⚠️ WARNING: Position not fully closed! Remaining: ${remainingAmt}`)
        } else {
          console.log(`[ClosePosition] ✅ Position fully closed`)
        }
      }, 1000)
    } catch (error) {
      handleError(`Failed to close position for ${symbol}: ${error.message}`)
    }
  }

  const startTrading = async (settings) => {
    // Initialize OrderManager
    const orderManager = new OrderManager()
    orderManager.onError = handleError
    
    try {
      await orderManager.initialize({
        apiKey: settings.asterApiKey,
        secretKey: settings.asterSecretKey,
        capital: parseFloat(settings.capital),
        leverage: settings.leverage,
        takeProfit: settings.takeProfit,
        stopLoss: settings.stopLoss,
        tpSlMode: settings.tpSlMode,
        positionSize: settings.positionSize,
        orderType: settings.orderType
      })
      
      orderManager.start()
      orderManagerRef.current = orderManager
      
      // Set trading symbols from settings (only if NOT in Auto Mode)
      const tradingPairs = settings.selectedPairs || ['BTCUSDT']
      if (!settings.autoMode) {
        setTradingSymbols(tradingPairs)
      } else {
        // Auto Mode: Wait for hourly scanner signals
        setTradingSymbols([])
      }
      
      // Check for existing positions on ALL selected pairs on startup (only in manual mode)
      if (!settings.autoMode) {
        try {
          for (const symbol of tradingPairs) {
            const existingPosition = await orderManager.dexService.getPosition(symbol)
            const positionAmt = parseFloat(existingPosition.positionAmt || '0')
            
            if (positionAmt !== 0) {
              console.log(`[PerpFarming] 🔍 Detected existing position on ${symbol}:`, {
                symbol: symbol,
                size: positionAmt,
                entryPrice: existingPosition.entryPrice,
                unrealizedPnL: existingPosition.unRealizedProfit
              })
              
              // Add position to tracking immediately
              orderManager.activePositions.set(symbol, {
                symbol: symbol,
                side: positionAmt > 0 ? 'LONG' : 'SHORT',
                quantity: Math.abs(positionAmt),
                entryPrice: parseFloat(existingPosition.entryPrice || '0')
              })
              
              console.log(`[PerpFarming] ✅ Existing position on ${symbol} is now being tracked`)
            }
          }
          console.log(`[PerpFarming] Checked ${tradingPairs.length} pairs for existing positions`)
        } catch (error) {
          console.warn('[PerpFarming] Could not check for existing positions:', error.message)
        }
      } else {
        console.log('[PerpFarming] Auto Mode enabled - waiting for hourly scanner signals')
      }
      
      // Start polling PNL every 2 seconds for real-time updates
      pnlPollIntervalRef.current = setInterval(async () => {
        try {
          const status = orderManager.getStatus()
          const currentPositionCount = status.activePositions ? status.activePositions.length : 0
          
          if (status.activePositions && status.activePositions.length > 0) {
            // Calculate total PNL in dollars from all positions
            let totalPnlDollars = 0
            let totalFees = 0
            
            for (const position of status.activePositions) {
              const currentPosition = await orderManager.dexService.getPosition(position.symbol)
              // unRealizedProfit is the actual dollar amount (before fees)
              const unrealizedProfit = parseFloat(currentPosition.unRealizedProfit || '0')
              const entryPrice = parseFloat(currentPosition.entryPrice || '0')
              const positionAmt = Math.abs(parseFloat(currentPosition.positionAmt || '0'))
              const markPrice = parseFloat(currentPosition.markPrice || '0')
              
              // Calculate fees
              const entryNotional = positionAmt * entryPrice
              const exitNotional = positionAmt * markPrice
              const entryFee = entryNotional * ENTRY_FEE
              const exitFee = exitNotional * EXIT_FEE
              const totalPosFees = entryFee + exitFee
              
              totalPnlDollars += unrealizedProfit
              totalFees += totalPosFees
            }
            
            // Net PNL = Unrealized PNL - Fees
            const netPnl = totalPnlDollars - totalFees
            
            // Update PNL with animation trigger (show NET PNL)
            setPrevPnl(pnl)
            setPnl(netPnl)
            setEstimatedFees(totalFees)
            lastPnlRef.current = netPnl // Store NET PNL for stats
            lastPositionCountRef.current = currentPositionCount
            
            // Update peak PNL tracking for trailing stop
            if (netPnl > peakPnlRef.current) {
              peakPnlRef.current = netPnl
            }
            
            // ALWAYS check dollar-based TP/SL first (regardless of exit strategy)
            // NOTE: TP/SL based on GROSS PNL (before fees) - fees are fixed cost, not price risk
            let positionsClosed = false
            if (settings.tpSlMode === 'dollar') {
              const takeProfitDollars = parseFloat(settings.takeProfit)
              const stopLossDollars = parseFloat(settings.stopLoss)
              
              // Check Take Profit (use gross PNL before fees)
              if (takeProfitDollars > 0 && totalPnlDollars >= takeProfitDollars) {
                console.log(`Take Profit hit: $${totalPnlDollars.toFixed(2)} >= $${takeProfitDollars.toFixed(2)} (gross, before fees)`)
                // Close all positions
                for (const position of status.activePositions) {
                  await closePosition(orderManager, position.symbol, netPnl)
                }
                positionsClosed = true
              }
              
              // Check Stop Loss (use gross PNL before fees)
              if (!positionsClosed && stopLossDollars > 0 && totalPnlDollars <= -stopLossDollars) {
                console.log(`Stop Loss hit: $${totalPnlDollars.toFixed(2)} <= -$${stopLossDollars.toFixed(2)} (gross, before fees)`)
                // Close all positions
                for (const position of status.activePositions) {
                  await closePosition(orderManager, position.symbol, netPnl)
                }
                positionsClosed = true
              }
            }
            
            // If positions weren't closed by TP/SL, check exit strategy modes
            if (!positionsClosed) {
              // Check trailing stop loss (dollar increment based)
              if (settings.trailingBreakEven) {
                const increment = parseFloat(settings.trailingIncrement) || 20
                
                // Calculate how many increments of profit we've achieved
                // For every $X profit, stop loss moves up by $X
                if (peakPnlRef.current >= increment) {
                  // Calculate trailing stop: floor(peak / increment) * increment - increment
                  // Example: If increment is $20 and peak is $65:
                  // - We've hit 3 increments ($20, $40, $60)
                  // - Stop loss is at $40 (2 increments, leaving room for 1 increment pullback)
                  const incrementsAchieved = Math.floor(peakPnlRef.current / increment)
                  const trailingStop = Math.max((incrementsAchieved - 1) * increment, 0)
                  trailingStopRef.current = trailingStop
                  
                  // Check if current PNL dropped below trailing stop
                  if (netPnl <= trailingStop) {
                    console.log(`Trailing Stop Hit: Net PNL $${netPnl.toFixed(2)} <= Trailing Stop $${trailingStop.toFixed(2)} (Peak: $${peakPnlRef.current.toFixed(2)}, Increment: $${increment})`)
                    // Close all positions
                    for (const position of status.activePositions) {
                      await closePosition(orderManager, position.symbol, netPnl)
                    }
                  } else {
                    console.log(`[Trailing] Peak: $${peakPnlRef.current.toFixed(2)}, Stop: $${trailingStop.toFixed(2)}, Current: $${netPnl.toFixed(2)} (Increment: $${increment})`)
                  }
                }
              }
              // Check simple break-even mode (volume farming)
              else if (settings.breakEvenMode) {
                // Track the best (closest to 0 or positive) PnL achieved
                if (netPnl > bestBreakEvenPnlRef.current) {
                  bestBreakEvenPnlRef.current = netPnl
                }
                
                // Close if:
                // 1. PnL is positive (at or above breakeven), OR
                // 2. PnL is within loss tolerance AND we've previously been closer to breakeven
                const lossTolerance = parseFloat(settings.breakEvenLossTolerance) || 20
                const withinTolerance = netPnl >= -lossTolerance
                const previouslyWasCloser = bestBreakEvenPnlRef.current > netPnl
                
                if (netPnl >= 0) {
                  console.log(`Break-even hit: Net PNL $${netPnl.toFixed(2)} >= $0 (after fees)`)
                  // Close all positions at break-even
                  for (const position of status.activePositions) {
                    await closePosition(orderManager, position.symbol, netPnl)
                  }
                } else if (withinTolerance && previouslyWasCloser) {
                  console.log(`Break-even loss tolerance hit: Net PNL $${netPnl.toFixed(2)} (was $${bestBreakEvenPnlRef.current.toFixed(2)}) within tolerance -$${lossTolerance}`)
                  // Close all positions - we were closer to breakeven before and are now within acceptable loss
                  for (const position of status.activePositions) {
                    await closePosition(orderManager, position.symbol, netPnl)
                  }
                }
              }
            }
          } else {
            // No active positions, reset PNL and trailing tracking
            // (Stats are already updated in closePosition function)
            setPrevPnl(pnl)
            setPnl(0)
            setEstimatedFees(0)
            lastPnlRef.current = 0
            lastPositionCountRef.current = 0
            peakPnlRef.current = 0
            trailingStopRef.current = 0
            bestBreakEvenPnlRef.current = Number.NEGATIVE_INFINITY
          }
        } catch (error) {
          console.error('Error polling PNL:', error)
        }
      }, 2000)
      
      // Connect WebSocket (non-blocking - if it fails, we still allow trading)
      try {
        // Get authentication token for WebSocket
        const token = authService.getToken()
        if (!token) {
          throw new Error('Not authenticated. Please connect wallet and sign in.')
        }

        const wsClient = new HopiumWebSocketClient()
        
        // Handle subscription confirmation - track subscribed symbols
        wsClient.onSubscribed = (symbol) => {
          console.log(`[PerpFarming] Subscribed to ${symbol}`)
          // Symbols are already set from settings, no need to update here
        }
        
        wsClient.onSummary = async (summaryData) => {
          try {
            console.log('[PerpFarming] Received range trading data:', summaryData)
            
            // New format: { symbol, strategy, payload: { summary, timestamp, range_1h, range_4h, range_24h, volume_profile, key_levels, tp_price, sl_price, risk_reward, confluence_score, range_data } }
            
            // Defensive: ignore if malformed
            if (!summaryData || !summaryData.payload) {
              console.log('[PerpFarming] No payload found in summary message')
              return
            }
            
            const { symbol, payload } = summaryData
            const { summary, range_data, range_1h, range_4h, range_24h } = payload
            
            console.log('[PerpFarming] Parsed range trading summary:', { 
              symbol, 
              side: summary?.entry?.side,
              severity: summary?.severity,
              confluence_score: payload?.confluence_score,
              range_24h 
            })
            
            // Symbol is already tracked in tradingSymbols array from settings
            
            // Update bot message with reasoning if available
            const reasoning = summary?.entry?.reasoning || 'Analyzing market conditions...'
            setBotMessage(reasoning)
            if (onBotMessageChange) onBotMessageChange(reasoning)
            
            // Skip NEUTRAL signals (safety filters blocked trading)
            if (summary?.entry?.side === 'NEUTRAL') {
              console.log('[PerpFarming] NEUTRAL signal (safety filter), skipping')
              return
            }
            
            // Check if position exists before opening new one
            const status = orderManager.getStatus()
            const hasActivePosition = status.activePositions && status.activePositions.length > 0
            
            if (!hasActivePosition) {
              await orderManager.handleSummary(summaryData)
            } else {
              console.log('Skipping signal - active position exists')
            }
          } catch (error) {
            handleError(`Failed to handle summary: ${error.message}`)
          }
        }
        
        // Handle scalp strategy signals
        wsClient.onScalpIndicator = async (message) => {
          try {
            console.log('[PerpFarming] Received scalp message:', message)
            
            // Extract the actual scalp data
            // WebSocket sends the data in message.data
            const scalpData = message?.data || message
            
            // Defensive: ignore if malformed
            if (!scalpData) {
              console.log('[PerpFarming] No scalp data found in message')
              return
            }
            
            console.log('[PerpFarming] Extracted scalp data:', scalpData)

            // Update bot message with server reasoning (always)
            const reasoning = scalpData.reasoning || 'Calling home for some data...'
            setBotMessage(reasoning)
            if (onBotMessageChange) onBotMessageChange(reasoning)

            // Symbol is already tracked in tradingSymbols array from settings
            
            // Only process LONG/SHORT signals (skip NEUTRAL)
            if (scalpData.side === 'NEUTRAL') {
              console.log('[PerpFarming] NEUTRAL signal, skipping')
              return
            }
            
            // Check if position exists before opening new one
            const status = orderManager.getStatus()
            const hasActivePosition = status.activePositions && status.activePositions.length > 0
            
            console.log('[PerpFarming] Position check:', {
              hasActivePosition,
              confidence: scalpData.confidence,
              side: scalpData.side,
              activePositions: status.activePositions
            })

            // If position exists, check Smart Mode exit conditions
            if (hasActivePosition && settings.smartMode) {
              console.log('[PerpFarming] 🧠 Smart Mode: Checking exit conditions')
              
              // Add signal to position history
              const symbol = scalpData.symbol
              orderManager.addSignalToHistory(symbol, {
                confidence: scalpData.confidence,
                side: scalpData.side
              })

              // Check Smart Mode exit conditions
              const exitDecision = await orderManager.checkSmartModeExit(symbol, {
                confidence: scalpData.confidence,
                side: scalpData.side
              })

              if (exitDecision.shouldExit) {
                // Check if current PNL is above minimum threshold
                const currentNetPnl = lastPnlRef.current || 0
                const minPnl = parseFloat(settings.smartModeMinPnl) || -50
                
                if (currentNetPnl >= minPnl) {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT triggered: ${exitDecision.reason} (PNL: $${currentNetPnl.toFixed(2)} >= min $${minPnl.toFixed(2)})`)
                  
                  // Select random statement based on reason
                  const statement = getSmartModeStatement(exitDecision.reason)
                  setBotMessage(statement)
                  if (onBotMessageChange) onBotMessageChange(statement)
                  
                  // Close position
                  await orderManager.closePositionSmartMode(symbol, exitDecision.details)
                  
                  return // Exit early, don't process new entry
                } else {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT BLOCKED: PNL $${currentNetPnl.toFixed(2)} < min $${minPnl.toFixed(2)} - letting normal TP/SL handle it`)
                }
              }
            }
            
            // Accept high and medium confidence signals, or low if user trusts them
            const shouldTrade = scalpData.confidence === 'high' || 
                                scalpData.confidence === 'medium' || 
                                (scalpData.confidence === 'low' && settings.trustLowConfidence)
            
            if (!hasActivePosition && shouldTrade) {
              console.log(`[PerpFarming] 🎯 Processing ${scalpData.confidence.toUpperCase()} confidence ${scalpData.side} signal @ $${scalpData.limit_price}`)
              if (typeof orderManager.handleScalpSignal === 'function') {
                await orderManager.handleScalpSignal(scalpData)
                console.log('[PerpFarming] ✅ Order placement attempted')
              } else {
                console.error('[PerpFarming] handleScalpSignal is not a function!')
              }
            } else if (hasActivePosition) {
              console.log('[PerpFarming] ⏭️ Skipping scalp signal - active position exists')
            } else {
              console.log(`[PerpFarming] ⏭️ Skipping scalp signal - low confidence (${scalpData.confidence}) ${settings.trustLowConfidence ? '(trust enabled but still skipped)' : '(trust low confidence disabled)'}`)
            }
          } catch (error) {
            handleError(`Failed to handle scalp signal: ${error.message}`)
          }
        }
        
        // Handle momentum strategy signals
        wsClient.onMomentumIndicator = async (message) => {
          try {
            console.log('[PerpFarming] Received momentum message:', message)
            
            // Extract the actual momentum data
            // WebSocket sends the data in message.data
            const momentumData = message?.data || message
            
            // Defensive: ignore if malformed
            if (!momentumData) {
              console.log('[PerpFarming] No momentum data found in message')
              return
            }
            
            console.log('[PerpFarming] Extracted momentum data:', momentumData)

            // Update bot message with server reasoning (always)
            const reasoning = momentumData.reasoning || 'Calling home for some data...'
            setBotMessage(reasoning)
            if (onBotMessageChange) onBotMessageChange(reasoning)

            // Symbol is already tracked in tradingSymbols array from settings
            
            // Only process LONG/SHORT signals when trends are ALIGNED
            if (momentumData.side === 'NEUTRAL' || momentumData.trend_alignment === 'CONFLICTED') {
              console.log('[PerpFarming] NEUTRAL/CONFLICTED signal, skipping')
              return
            }
            
            // Check if position exists before opening new one
            const status = orderManager.getStatus()
            const hasActivePosition = status.activePositions && status.activePositions.length > 0
            
            console.log('[PerpFarming] Momentum position check:', {
              hasActivePosition,
              confidence: momentumData.confidence,
              side: momentumData.side,
              trend_alignment: momentumData.trend_alignment,
              confluence_score: momentumData.confluence_score,
              activePositions: status.activePositions
            })

            // If position exists, check Smart Mode exit conditions
            if (hasActivePosition && settings.smartMode) {
              console.log('[PerpFarming] 🧠 Smart Mode: Checking exit conditions')
              
              // Add signal to position history
              const symbol = momentumData.symbol
              orderManager.addSignalToHistory(symbol, {
                confidence: momentumData.confidence,
                side: momentumData.side
              })

              // Check Smart Mode exit conditions
              const exitDecision = await orderManager.checkSmartModeExit(symbol, {
                confidence: momentumData.confidence,
                side: momentumData.side
              })

              if (exitDecision.shouldExit) {
                // Check if current PNL is above minimum threshold
                const currentNetPnl = lastPnlRef.current || 0
                const minPnl = parseFloat(settings.smartModeMinPnl) || -50
                
                if (currentNetPnl >= minPnl) {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT triggered: ${exitDecision.reason} (PNL: $${currentNetPnl.toFixed(2)} >= min $${minPnl.toFixed(2)})`)
                  
                  // Select random statement based on reason
                  const statement = getSmartModeStatement(exitDecision.reason)
                  setBotMessage(statement)
                  if (onBotMessageChange) onBotMessageChange(statement)
                  
                  // Close position
                  await orderManager.closePositionSmartMode(symbol, exitDecision.details)
                  
                  return // Exit early, don't process new entry
                } else {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT BLOCKED: PNL $${currentNetPnl.toFixed(2)} < min $${minPnl.toFixed(2)} - letting normal TP/SL handle it`)
                }
              }
            }
            
            // Accept high and medium confidence signals, or low if user trusts them
            const shouldTrade = momentumData.confidence === 'high' || 
                                momentumData.confidence === 'medium' || 
                                (momentumData.confidence === 'low' && settings.trustLowConfidence)
            
            if (!hasActivePosition && shouldTrade) {
              console.log(`[PerpFarming] 🎯 Processing ${momentumData.confidence.toUpperCase()} confidence ${momentumData.side} momentum signal @ $${momentumData.limit_price}`)
              if (typeof orderManager.handleMomentumSignal === 'function') {
                await orderManager.handleMomentumSignal(momentumData)
                console.log('[PerpFarming] ✅ Momentum order placement attempted')
              } else {
                console.error('[PerpFarming] handleMomentumSignal is not a function!')
              }
            } else if (hasActivePosition) {
              console.log('[PerpFarming] ⏭️ Skipping momentum signal - active position exists')
            } else {
              console.log(`[PerpFarming] ⏭️ Skipping momentum signal - low confidence (${momentumData.confidence}) ${settings.trustLowConfidence ? '(trust enabled but still skipped)' : '(trust low confidence disabled)'}`)
            }
          } catch (error) {
            handleError(`Failed to handle momentum signal: ${error.message}`)
          }
        }
        
        // Handle momentum X strategy signals (Psychic Candle Reader)
        wsClient.onMomentumX = async (message) => {
          try {
            console.log('[PerpFarming] Received momentum X message:', message)
            
            // Extract the actual momentum X data
            // WebSocket sends the data in message.data
            const momentumXData = message?.data || message
            
            // Defensive: ignore if malformed
            if (!momentumXData) {
              console.log('[PerpFarming] No momentum X data found in message')
              return
            }
            
            console.log('[PerpFarming] Extracted momentum X data:', momentumXData)

            // Update bot message with server reasoning (always)
            const reasoning = momentumXData.reasoning || 'Calling home for some data...'
            setBotMessage(reasoning)
            if (onBotMessageChange) onBotMessageChange(reasoning)

            // Symbol is already tracked in tradingSymbols array from settings
            
            // Skip NEUTRAL signals or FLAT regime (ATR-based regime filter)
            if (momentumXData.side === 'NEUTRAL' || momentumXData.market_regime === 'FLAT') {
              console.log('[PerpFarming] NEUTRAL/FLAT regime signal, skipping')
              return
            }
            
            // Check if position exists before opening new one
            const status = orderManager.getStatus()
            const hasActivePosition = status.activePositions && status.activePositions.length > 0
            
            console.log('[PerpFarming] Momentum X position check:', {
              hasActivePosition,
              confidence: momentumXData.confidence,
              side: momentumXData.side,
              market_regime: momentumXData.market_regime,
              layer_score: momentumXData.layer_score,
              delta_trend: momentumXData.delta_trend,
              orderbook_pressure: momentumXData.orderbook_pressure,
              activePositions: status.activePositions
            })

            // If position exists, check Smart Mode exit conditions
            if (hasActivePosition && settings.smartMode) {
              console.log('[PerpFarming] 🧠 Smart Mode: Checking exit conditions')
              
              // Add signal to position history
              const symbol = momentumXData.symbol
              orderManager.addSignalToHistory(symbol, {
                confidence: momentumXData.confidence,
                side: momentumXData.side
              })

              // Check Smart Mode exit conditions
              const exitDecision = await orderManager.checkSmartModeExit(symbol, {
                confidence: momentumXData.confidence,
                side: momentumXData.side
              })

              if (exitDecision.shouldExit) {
                // Check if current PNL is above minimum threshold
                const currentNetPnl = lastPnlRef.current || 0
                const minPnl = parseFloat(settings.smartModeMinPnl) || -50
                
                if (currentNetPnl >= minPnl) {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT triggered: ${exitDecision.reason} (PNL: $${currentNetPnl.toFixed(2)} >= min $${minPnl.toFixed(2)})`)
                  
                  // Select random statement based on reason
                  const statement = getSmartModeStatement(exitDecision.reason)
                  setBotMessage(statement)
                  if (onBotMessageChange) onBotMessageChange(statement)
                  
                  // Close position
                  await orderManager.closePositionSmartMode(symbol, exitDecision.details)
                  
                  return // Exit early, don't process new entry
                } else {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT BLOCKED: PNL $${currentNetPnl.toFixed(2)} < min $${minPnl.toFixed(2)} - letting normal TP/SL handle it`)
                }
              }
            }
            
            // Accept high and medium confidence signals, or low if user trusts them
            const shouldTrade = momentumXData.confidence === 'high' || 
                                momentumXData.confidence === 'medium' || 
                                (momentumXData.confidence === 'low' && settings.trustLowConfidence)
            
            if (!hasActivePosition && shouldTrade) {
              console.log(`[PerpFarming] 🔮 Processing ${momentumXData.confidence.toUpperCase()} confidence ${momentumXData.side} momentum X signal @ $${momentumXData.limit_price} (${momentumXData.layer_score}/8 layers, ${momentumXData.market_regime} regime)`)
              if (typeof orderManager.handleMomentumXSignal === 'function') {
                await orderManager.handleMomentumXSignal(momentumXData)
                console.log('[PerpFarming] ✅ Momentum X order placement attempted')
              } else {
                console.error('[PerpFarming] handleMomentumXSignal is not a function!')
              }
            } else if (hasActivePosition) {
              console.log('[PerpFarming] ⏭️ Skipping momentum X signal - active position exists')
            } else {
              console.log(`[PerpFarming] ⏭️ Skipping momentum X signal - low confidence (${momentumXData.confidence}) ${settings.trustLowConfidence ? '(trust enabled but still skipped)' : '(trust low confidence disabled)'}`)
            }
          } catch (error) {
            handleError(`Failed to handle momentum X signal: ${error.message}`)
          }
        }
        
        // === AUTO MODE (HOURLY SCANNER) HANDLERS ===
        
        // Handle hourly opportunities (XX:00) - Open 3-5 positions
        wsClient.onHourlyOpportunities = async (message) => {
          try {
            if (!settings.autoMode) return // Only process if Auto Mode enabled
            
            console.log('[PerpFarming] 🔔 Received hourly opportunities:', message)
            
            const oppData = message?.data || message
            if (!oppData || !oppData.top_picks) {
              console.log('[PerpFarming] No opportunities data found')
              return
            }
            
            setBotMessage(`Found ${oppData.top_picks.length} opportunities for ${oppData.hour_window}`)
            if (onBotMessageChange) onBotMessageChange(`Found ${oppData.top_picks.length} opportunities for ${oppData.hour_window}`)
            
            // Calculate capital per position
            const capitalNum = parseFloat(settings.capital)
            const capitalPerPosition = capitalNum / oppData.top_picks.length
            
            // Open position for each opportunity
            const newPositions = []
            for (const pick of oppData.top_picks) {
              try {
                // Get max leverage for this symbol and position size
                const maxLeverage = await orderManager.dexService.getMaxLeverageForNotional(
                  pick.symbol,
                  capitalPerPosition
                )
                
                // Use the minimum of: user's setting, pick's max, or API's max
                const leverage = Math.min(
                  parseInt(settings.leverage),
                  pick.max_leverage || maxLeverage,
                  maxLeverage
                )
                
                console.log(`[AutoMode] Opening ${pick.symbol} ${pick.direction} | Confidence: ${pick.confidence} | Leverage: ${leverage}x | Size: $${capitalPerPosition.toFixed(2)}`)
                
                // Set leverage for this symbol
                await orderManager.dexService.setLeverage(pick.symbol, leverage)
                
                // Calculate position quantity
                const price = pick.suggested_entry || parseFloat(await orderManager.dexService.getPosition(pick.symbol).then(p => p.markPrice))
                const quantity = (capitalPerPosition * leverage) / price
                
                // Place MARKET order (Auto Mode uses market orders)
                const result = await orderManager.dexService.placeOrder({
                  symbol: pick.symbol,
                  side: pick.direction === 'LONG' ? 'BUY' : 'SELL',
                  type: 'MARKET',
                  quantity: quantity
                })
                
                // Track this position
                newPositions.push({
                  id: `${pick.symbol}_${Date.now()}`,
                  symbol: pick.symbol,
                  direction: pick.direction,
                  confidence: pick.confidence,
                  entryPrice: price,
                  size: capitalPerPosition,
                  leverage: leverage,
                  orderId: result.orderId
                })
                
                console.log(`[AutoMode] ✅ Opened ${pick.symbol} position`)
              } catch (error) {
                console.error(`[AutoMode] Failed to open ${pick.symbol}:`, error.message)
                handleError(`Failed to open ${pick.symbol}: ${error.message}`)
              }
            }
            
            setHourlyPositions(newPositions)
            setTradingSymbols(newPositions.map(p => p.symbol))
            
          } catch (error) {
            handleError(`Failed to handle hourly opportunities: ${error.message}`)
          }
        }
        
        // Handle mid-hour opportunities (XX:30) - Close weak, open new
        wsClient.onMidHourOpportunities = async (message) => {
          try {
            if (!settings.autoMode) return
            
            console.log('[PerpFarming] ⚡ Received mid-hour opportunities:', message)
            
            const oppData = message?.data || message
            if (!oppData || !oppData.top_picks) return
            
            setBotMessage(`Mid-hour: ${oppData.top_picks.length} exceptional opportunities`)
            if (onBotMessageChange) onBotMessageChange(`Mid-hour: ${oppData.top_picks.length} exceptional opportunities`)
            
            // Close weak positions (down >1.5%)
            const updatedPositions = []
            for (const pos of hourlyPositions) {
              const position = await orderManager.dexService.getPosition(pos.symbol)
              const pnlPercent = parseFloat(position.unRealizedProfit) / pos.size * 100
              
              if (pnlPercent < -1.5) {
                console.log(`[AutoMode] Closing weak position ${pos.symbol} (${pnlPercent.toFixed(2)}%)`)
                await closePosition(orderManager, pos.symbol, parseFloat(position.unRealizedProfit))
              } else {
                updatedPositions.push(pos)
              }
            }
            
            // Open new exceptional positions if room available
            const maxPositions = 5
            const roomForNew = maxPositions - updatedPositions.length
            
            if (roomForNew > 0 && oppData.top_picks.length > 0) {
              const capitalNum = parseFloat(settings.capital)
              const newPicks = oppData.top_picks.slice(0, roomForNew)
              
              for (const pick of newPicks) {
                // Similar logic as hourly opportunities
                const capitalPerPosition = capitalNum / (updatedPositions.length + newPicks.length)
                const maxLeverage = await orderManager.dexService.getMaxLeverageForNotional(pick.symbol, capitalPerPosition)
                const leverage = Math.min(parseInt(settings.leverage), pick.max_leverage || maxLeverage, maxLeverage)
                
                await orderManager.dexService.setLeverage(pick.symbol, leverage)
                
                const price = pick.suggested_entry
                const quantity = (capitalPerPosition * leverage) / price
                
                const result = await orderManager.dexService.placeOrder({
                  symbol: pick.symbol,
                  side: pick.direction === 'LONG' ? 'BUY' : 'SELL',
                  type: 'MARKET',
                  quantity: quantity
                })
                
                updatedPositions.push({
                  id: `${pick.symbol}_${Date.now()}`,
                  symbol: pick.symbol,
                  direction: pick.direction,
                  confidence: pick.confidence,
                  entryPrice: price,
                  size: capitalPerPosition,
                  leverage: leverage,
                  orderId: result.orderId
                })
                
                console.log(`[AutoMode] ✅ Opened mid-hour position ${pick.symbol}`)
              }
            }
            
            setHourlyPositions(updatedPositions)
            setTradingSymbols(updatedPositions.map(p => p.symbol))
            
          } catch (error) {
            handleError(`Failed to handle mid-hour opportunities: ${error.message}`)
          }
        }
        
        // Handle hour end (XX:59) - Close all positions
        wsClient.onHourEnd = async (message) => {
          try {
            if (!settings.autoMode) return
            
            console.log('[PerpFarming] 🔚 Hour ending, closing all positions:', message)
            
            const hourData = message?.data || message
            
            // Close all hourly positions
            for (const pos of hourlyPositions) {
              const position = await orderManager.dexService.getPosition(pos.symbol)
              const pnl = parseFloat(position.unRealizedProfit)
              await closePosition(orderManager, pos.symbol, pnl)
            }
            
            // Reset positions
            setHourlyPositions([])
            setTradingSymbols([])
            
            // Show hour summary
            if (hourData.hour_window) {
              setBotMessage(`Hour ${hourData.hour_window} ended | Total PnL: $${hourData.total_pnl?.toFixed(2) || '0.00'}`)
              if (onBotMessageChange) onBotMessageChange(`Hour ${hourData.hour_window} ended`)
            }
            
          } catch (error) {
            handleError(`Failed to handle hour end: ${error.message}`)
          }
        }
        
        // Handle position updates
        wsClient.onPositionUpdate = async (message) => {
          try {
            if (!settings.autoMode) return
            
            console.log('[PerpFarming] 📊 Position update:', message)
            
            const posData = message?.data || message
            
            // Update local position tracking
            setHourlyPositions(prev => {
              return prev.map(p => {
                if (p.symbol === posData.symbol) {
                  return { ...p, ...posData }
                }
                return p
              })
            })
            
          } catch (error) {
            console.error('[PerpFarming] Failed to handle position update:', error)
          }
        }
        
        wsClient.onError = (error) => {
          const errorMsg = error.payload?.error || 'Unknown error'
          handleError(`WebSocket error: ${errorMsg}`)
          
          // Check if requires re-authentication
          if (error.payload?.requiresReauth) {
            console.log('[PerpFarming] Authentication expired - showing re-auth modal')
            // Show modal instead of stopping silently
            setShowAuthModal(true)
          }
        }
        
        // Connect with authentication token
        await wsClient.connect(token)
        
        // Only subscribe to manual strategies if Auto Mode is disabled
        // Auto Mode receives hourly_opportunities broadcasts automatically
        if (!settings.autoMode) {
          // Subscribe to all selected pairs with manual strategy
          for (const symbol of tradingPairs) {
            wsClient.subscribe(symbol, settings.strategy)
            console.log(`[PerpFarming] Subscribing to ${symbol} with ${settings.strategy} strategy`)
          }
        } else {
          console.log(`[PerpFarming] Auto Mode enabled - listening for hourly scanner broadcasts`)
          setBotMessage('Auto Mode: Waiting for hourly scanner signals...')
          if (onBotMessageChange) onBotMessageChange('Auto Mode: Waiting for hourly scanner signals...')
        }
        
        wsClientRef.current = wsClient
      } catch (wsError) {
        // WebSocket connection failed, but trading can still continue
        handleError(`WebSocket connection failed: ${wsError.message || 'Server not reachable'}. Trading will continue but may not receive real-time signals.`)
        // Don't throw - allow OrderManager to continue without WebSocket
      }
    } catch (error) {
      // Cleanup on error
      if (orderManagerRef.current) {
        orderManagerRef.current.stop()
        orderManagerRef.current = null
      }
      if (wsClientRef.current) {
        wsClientRef.current.disconnect()
        wsClientRef.current = null
      }
      throw error
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (orderManagerRef.current) {
        orderManagerRef.current.stop()
      }
      if (wsClientRef.current) {
        wsClientRef.current.disconnect()
      }
      if (pnlPollIntervalRef.current) {
        clearInterval(pnlPollIntervalRef.current)
      }
    }
  }, [])

  // Set up error handler for RobotWidget
  useEffect(() => {
    errorHandlerRef.current = (error) => {
      if (window._robotWidgetErrorHandler) {
        window._robotWidgetErrorHandler(error)
      }
    }
  }, [])

  // Periodically save stats to localStorage as backup (every 30 seconds)
  useEffect(() => {
    if (!isRunning) return
    
    const saveInterval = setInterval(() => {
      saveStats(overallPnl, totalTrades)
    }, 30000)
    
    return () => clearInterval(saveInterval)
  }, [isRunning, overallPnl, totalTrades])

  const handleCloseModal = () => {
    setShowModal(false)
    setShowPairSelection(false) // Reset to settings view
    setValidationError('') // Clear error when closing modal
  }

  const handleStop = () => {
    // Stop order manager
    if (orderManagerRef.current) {
      orderManagerRef.current.stop()
      orderManagerRef.current = null
    }

    // Disconnect WebSocket
    if (wsClientRef.current) {
      wsClientRef.current.disconnect()
      wsClientRef.current = null
    }

    // Stop PNL polling
    if (pnlPollIntervalRef.current) {
      clearInterval(pnlPollIntervalRef.current)
      pnlPollIntervalRef.current = null
    }

    setIsRunning(false)
    if (onBotStatusChange) onBotStatusChange(false)
    setTradingSymbols([])
    setAllowedEquity('')
    setPnl(0)
    setPrevPnl(0)
    setEstimatedFees(0)
    peakPnlRef.current = 0
    trailingStopRef.current = 0
  }

  const handleReAuthenticate = async () => {
    setShowAuthModal(false)
    
    try {
      // Re-authenticate through AuthContext
      await authService.authenticate()
      
      // If auth was successful, bot will continue running
      console.log('[PerpFarming] Re-authentication successful')
    } catch (error) {
      console.error('[PerpFarming] Re-authentication failed:', error)
      handleError('Re-authentication failed. Please stop and restart the bot.')
      handleStop()
    }
  }

  const handleCircleClick = () => {
    // If already running, do nothing (user should use stop button)
    if (isRunning) {
      return
    }

    // Check if settings are saved
    const savedSettings = localStorage.getItem(STORAGE_KEY)
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        // Verify all required fields exist
        if (settings.asterApiKey && settings.asterSecretKey && settings.capital) {
          // Settings exist, start trading directly
          handleStart()
        } else {
          // Settings incomplete, open modal
          setShowModal(true)
        }
      } catch (error) {
        // Error parsing settings, open modal
        setShowModal(true)
      }
    } else {
      // No settings saved, open modal
      setShowModal(true)
    }
  }

  // Generate random angles and properties for more organic distribution
  const generateRandomLine = () => {
    const angle = Math.random() * 360;
    const delay = Math.random() * 2;
    const distance = 60 + Math.random() * 20; // Vary starting distance
    const duration = 3 + Math.random() * 2; // Vary animation speed
    const length = 300 + Math.random() * 200; // Vary line length
    
    return { angle, delay, distance, duration, length };
  };

  const lines = useRef(Array.from({ length: 60 }, generateRandomLine)).current

  // Track speed changes to maintain animation continuity
  useEffect(() => {
    const currentSpeed = isRunning ? 0.25 : 1
    if (previousSpeedRef.current !== currentSpeed) {
      const now = Date.now()
      
      // Record each line's position when speed changes
      lines.forEach((line, i) => {
        if (!lineStartTimesRef.current.has(i)) {
          lineStartTimesRef.current.set(i, now - (line.delay * 1000))
        }
        const lineStartTime = lineStartTimesRef.current.get(i)
        const elapsed = (now - lineStartTime) / 1000 // seconds since line started
        const cycleProgress = (elapsed % line.duration) / line.duration
        
        // Update start time to account for new speed
        const newDuration = line.duration * currentSpeed
        const adjustedStartTime = now - (cycleProgress * newDuration * 1000)
        lineStartTimesRef.current.set(i, adjustedStartTime)
      })
      
      speedChangeTimeRef.current = now
      previousSpeedRef.current = currentSpeed
    }
  }, [isRunning, lines])

  // Calculate animation offset to maintain continuity when speed changes
  const getAnimationOffset = (line, index) => {
    const currentSpeed = isRunning ? 0.25 : 1
    const now = Date.now()
    
    if (!lineStartTimesRef.current.has(index)) {
      lineStartTimesRef.current.set(index, now - (line.delay * 1000))
      return 0
    }
    
    const lineStartTime = lineStartTimesRef.current.get(index)
    const elapsed = (now - lineStartTime) / 1000 // seconds since line started
    const newDuration = line.duration * currentSpeed
    const cycleProgress = (elapsed % newDuration) / newDuration
    
    // Calculate negative delay to maintain current position
    const offsetDelay = -(cycleProgress * newDuration)
    return offsetDelay
  }

  return (
    <div className="section perp-farming">
      <div 
        className="light-lines-container"
        style={{
          '--speed-multiplier': isRunning ? 0.25 : 1
        }}
      >
        {lines.map((line, i) => {
          const offsetDelay = getAnimationOffset(line, i)
          const adjustedDelay = line.delay + offsetDelay
          return (
            <div 
              key={i} 
              className="light-line"
              style={{
                '--angle': `${line.angle}deg`,
                '--delay': `${adjustedDelay}s`,
                '--distance': `${line.distance}vh`,
                '--duration': `${line.duration}s`,
                '--length': `${line.length}px`
              }}
            />
          )
        })}
      </div>
      
      <div className="section-content">
        {/* Overall Stats Display - Absolutely positioned at top */}
        {isRunning && (
          <div className="overall-stats">
            <div className="stats-row">
              <div className="stat-item">
                <div className="stat-label">Overall P/L</div>
                <div className={`stat-value ${overallPnl > 0 ? 'positive' : overallPnl < 0 ? 'negative' : 'neutral'}`}>
                  {overallPnl > 0 ? '+' : ''}{overallPnl < 0 ? '-' : ''}${Math.abs(overallPnl).toFixed(2)}
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Total Trades</div>
                <div className="stat-value">{totalTrades}</div>
              </div>
            </div>
            <button 
              className="reset-stats-button"
              onClick={() => {
                if (window.confirm('Reset all trading statistics?')) {
                  setOverallPnl(0)
                  setTotalTrades(0)
                  saveStats(0, 0)
                }
              }}
            >
              Reset Stats
            </button>
          </div>
        )}
        
        <h1 className={`section-title ${isRunning ? 'fade-out' : ''}`}>Perp Farming</h1>
        <p className={`section-description ${isRunning ? 'fade-out' : ''}`}>
          Advanced perpetual farming strategies for maximum yield
        </p>
        
        <div className="aster-circle-container">

          {isRunning && tradingSymbols.length > 0 && (
            <div className="trading-status">
              Trading {tradingSymbols.join(', ')}
            </div>
          )}
          {isRunning && tradingSymbols.length === 0 && (
            <div className="trading-status">
              Waiting for signals...
            </div>
          )}
          {isRunning && allowedEquity && (
            <div className="equity-display">
              <div className="equity-label">Capital</div>
              <div className="equity-amount">${allowedEquity}</div>
            </div>
          )}
          {isRunning && (
            <div className="pnl-display">
              <div className="pnl-label">Net PNL</div>
              <div className={`pnl-amount ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral'} ${prevPnl !== pnl ? 'animate' : ''}`}>
                {pnl > 0 ? '+' : ''}{pnl < 0 ? '-' : ''}${Math.abs(pnl).toFixed(2)}
              </div>
              {estimatedFees > 0 && (
                <div className="fees-display">
                  Fees: ${estimatedFees.toFixed(2)}
                </div>
              )}
            </div>
          )}
          <div 
            className={`aster-circle ${!isRunning ? 'clickable' : ''}`}
            onClick={handleCircleClick}
          >
            <div className="aster-placeholder">
              <img src={asterLogo} alt="Aster Logo" className="logo-image" />
            </div>
          </div>
          <button 
            className={`setup-button ${isRunning ? 'stop-button' : ''}`}
            onClick={() => isRunning ? handleStop() : setShowModal(true)}
          >
            {isRunning ? 'Stop' : 'Setup'}
          </button>
        </div>
      </div>

      {/* Risk Settings Modal */}
      {showModal && (
        <div className="risk-modal-overlay" onClick={handleCloseModal}>
          <div className="risk-modal" onClick={(e) => e.stopPropagation()}>
            <button className="risk-modal-close" onClick={handleCloseModal}>×</button>
            <div className="risk-modal-wrapper">
              <h2 className="risk-modal-title">{showPairSelection ? 'Select Pairs' : 'Risk Settings'}</h2>
              
              {/* Back button when in pair selection view */}
              {showPairSelection && (
                <button 
                  className="pair-back-button"
                  onClick={() => setShowPairSelection(false)}
                >
                  ← Back to Settings
                </button>
              )}
              
              <div className="risk-modal-content">
              
              {/* Pair Selection View */}
              {showPairSelection ? (
                <div className="pair-selection-content">
                  <div className="pair-selection-info">
                    <p>Select up to 5 trading pairs to track simultaneously</p>
                    <p className="pair-selection-count">
                      {selectedPairs.length} / 5 selected
                      {selectedPairs.length >= 5 && <span className="max-reached"> (Max reached)</span>}
                    </p>
                  </div>
                  
                  {loadingSymbols ? (
                    <div className="loading-symbols">Loading available pairs...</div>
                  ) : (
                    <div className="pairs-list">
                      {availableSymbols.map((symbol) => {
                        const isSelected = selectedPairs.includes(symbol)
                        const isMaxReached = selectedPairs.length >= 5 && !isSelected
                        
                        return (
                          <label 
                            key={symbol} 
                            className={`pair-checkbox-item ${isSelected ? 'selected' : ''} ${isMaxReached ? 'disabled' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePairSelection(symbol)}
                              disabled={isMaxReached}
                            />
                            <span className="pair-symbol">{symbol}</span>
                            {isSelected && <span className="check-mark">✓</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                // Risk Settings View
                <>
              {/* Auto Mode Checkbox - At the VERY top */}
              <div className="risk-form-group auto-mode-section">
                <label className="risk-label">Auto Mode 🤖</label>
                <label className="breakeven-option">
                  <input
                    type="checkbox"
                    checked={autoMode}
                    onChange={(e) => setAutoMode(e.target.checked)}
                    className="breakeven-radio"
                  />
                  <span className="breakeven-option-text">
                    🔥 Enable Hourly Scanner (Fully Automated Trading)
                  </span>
                </label>
                <div className="breakeven-description">
                  Automatically scans ALL pairs every hour, opens 3-5 best opportunities with even capital split, and closes all positions at hour end. Uses MARKET orders only. Your capital, TP/SL settings still apply. All other manual settings are ignored.
                </div>
              </div>
              
              {/* Pair Selection Button - Only show when not in pair selection view AND Auto Mode is OFF */}
              {!autoMode && (
                <div className="pair-selection-header">
                  <button 
                    className="pair-selection-button"
                    onClick={() => setShowPairSelection(true)}
                  >
                    <span className="pair-count">{selectedPairs.length} pair{selectedPairs.length !== 1 ? 's' : ''} selected</span>
                    <span className="pair-arrow">→</span>
                  </button>
                  <div className="selected-pairs-preview">
                    {selectedPairs.slice(0, 3).join(', ')}
                    {selectedPairs.length > 3 && ` +${selectedPairs.length - 3} more`}
                  </div>
                </div>
              )}

              {/* Smart Mode Checkbox - Only show if Auto Mode is OFF */}
              {!autoMode && (
              <div className="risk-form-group smart-mode-section">
                <label className="risk-label">Smart Mode</label>
                <label className="breakeven-option">
                  <input
                    type="checkbox"
                    checked={smartMode}
                    onChange={(e) => setSmartMode(e.target.checked)}
                    className="breakeven-radio"
                  />
                  <span className="breakeven-option-text">
                    🧠 Active Position Management
                  </span>
                </label>
                <div className="breakeven-description">
                  Monitors confidence changes and exits early when signals weaken. Exits on: (1) Signal reversal, (2) Low confidence + 50% to SL, (3) 2 consecutive low signals.
                </div>
                {smartMode && (
                  <div className="breakeven-tolerance-section" style={{ marginTop: '12px' }}>
                    <label className="risk-label">Minimum PNL for Smart Exit</label>
                    <input
                      type="number"
                      value={smartModeMinPnl}
                      onChange={(e) => setSmartModeMinPnl(parseFloat(e.target.value) || -50)}
                      className="risk-input"
                      placeholder="-50"
                      step="10"
                    />
                    <div className="breakeven-description">
                      Smart Mode won't exit if Net PNL is below this threshold. Set to 0 to only exit at breakeven or better. Default: -$50
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Trust Low Confidence Checkbox - Only show if Auto Mode is OFF */}
              {!autoMode && (
              <div className="risk-form-group">
                <label className="risk-label">Signal Confidence</label>
                <label className="breakeven-option">
                  <input
                    type="checkbox"
                    checked={trustLowConfidence}
                    onChange={(e) => setTrustLowConfidence(e.target.checked)}
                    className="breakeven-radio"
                  />
                  <span className="breakeven-option-text">
                    ⚠️ Trust Low Confidence Signals
                  </span>
                </label>
                <div className="breakeven-description">
                  By default, only high and medium confidence signals are traded. Enable this to also trade low confidence signals. Warning: May increase losses.
                </div>
              </div>
              )}

              <div className="risk-form-group">
                <label className="risk-label">Aster API Key</label>
                <input
                  type="text"
                  className={`risk-input ${shakeApiKey ? 'shake-red' : ''}`}
                  value={asterApiKey}
                  onChange={(e) => {
                    setAsterApiKey(e.target.value)
                    setValidationError('') // Clear error when user starts typing
                  }}
                  placeholder="Enter your Aster API key"
                />
              </div>

              <div className="risk-form-group">
                <label className="risk-label">Aster API Secret</label>
                <input
                  type="password"
                  className={`risk-input ${shakeSecretKey ? 'shake-red' : ''}`}
                  value={asterSecretKey}
                  onChange={(e) => {
                    setAsterSecretKey(e.target.value)
                    setValidationError('') // Clear error when user starts typing
                  }}
                  placeholder="Enter your Aster API secret"
                />
              </div>

              <div className="risk-form-group">
                <label className="risk-label">Capital Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`risk-input ${shakeCapital ? 'shake-red' : ''}`}
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  placeholder="Enter capital amount"
                />
              </div>

              <div className="risk-form-group">
                <label className="risk-label">
                  Leverage: {leverage}x
                </label>
                <div className="risk-slider-container">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="risk-slider leverage-slider"
                    style={{
                      background: `linear-gradient(to right, 
                        #00ff00 0%, 
                        #00ff00 25%, 
                        #ffff00 25%, 
                        #ffff00 50%, 
                        #ff9900 50%, 
                        #ff9900 75%, 
                        #ff0000 75%, 
                        #ff0000 100%)`
                    }}
                  />
                  <div className="risk-slider-labels">
                    <span>1x</span>
                    <span>25x</span>
                    <span>50x</span>
                    <span>75x</span>
                    <span>100x</span>
                  </div>
                </div>
              </div>

              <div className="risk-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="risk-label" style={{ margin: 0 }}>TP/SL Mode</label>
                  <div className="tpsl-toggle">
                    <button 
                      className={`toggle-option ${tpSlMode === 'percent' ? 'active' : ''}`}
                      onClick={() => setTpSlMode('percent')}
                    >
                      %
                    </button>
                    <button 
                      className={`toggle-option ${tpSlMode === 'dollar' ? 'active' : ''}`}
                      onClick={() => setTpSlMode('dollar')}
                    >
                      $
                    </button>
                  </div>
                </div>
              </div>

              <div className="risk-form-group">
                <label className="risk-label">
                  Take Profit: {tpSlMode === 'percent' ? formatPercentage(takeProfit) : `$${takeProfit}`}
                </label>
                {tpSlMode === 'percent' ? (
                  <div className="risk-slider-container">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={takeProfit}
                      onChange={(e) => setTakeProfit(Number(e.target.value))}
                      className="risk-slider"
                    />
                    <div className="risk-slider-labels">
                      <span>None</span>
                      <span>100%</span>
                    </div>
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="risk-input"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="Enter dollar amount"
                  />
                )}
              </div>

              <div className="risk-form-group">
                <label className="risk-label">
                  Stop Loss: {tpSlMode === 'percent' ? formatPercentage(stopLoss) : `$${stopLoss}`}
                </label>
                {tpSlMode === 'percent' ? (
                  <div className="risk-slider-container">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(Number(e.target.value))}
                      className="risk-slider"
                    />
                    <div className="risk-slider-labels">
                      <span>None</span>
                      <span>100%</span>
                    </div>
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="risk-input"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="Enter dollar amount"
                  />
                )}
              </div>

              <div className="risk-form-group">
                <label className="risk-label">
                  Position Size: {positionSize}%
                </label>
                <div className="risk-slider-container">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={positionSize}
                    onChange={(e) => setPositionSize(Number(e.target.value))}
                    className="risk-slider position-size-slider"
                    style={{
                      background: `linear-gradient(to right, 
                        #00ff00 0%, 
                        #00ff00 50%, 
                        #ffff00 50%, 
                        #ffff00 75%, 
                        #ff0000 75%, 
                        #ff0000 100%)`
                    }}
                  />
                  <div className="risk-slider-labels">
                    <span>1%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* Order Type - Hide if Auto Mode (uses MARKET only) */}
              {!autoMode && (
              <div className="risk-form-group">
                <label className="risk-label">Order Type</label>
                <div className="order-type-toggle">
                  <button 
                    className={`toggle-option ${orderType === 'LIMIT' ? 'active' : ''}`}
                    onClick={() => setOrderType('LIMIT')}
                  >
                    LIMIT
                  </button>
                  <button 
                    className={`toggle-option ${orderType === 'MARKET' ? 'active' : ''}`}
                    onClick={() => setOrderType('MARKET')}
                  >
                    MARKET
                  </button>
                </div>
                <div className="strategy-description">
                  {orderType === 'LIMIT'
                    ? '📍 Uses server limit price. May not fill if price moves away.'
                    : '⚡ Instant fill at market price. Ignores server limit price and APEs in!'
                  }
                </div>
              </div>
              )}

              {/* Order Timeout - Hide if Auto Mode (uses MARKET only) */}
              {!autoMode && (
              <div className="risk-form-group">
                <label className="risk-label">Limit Order Timeout: {orderTimeout}s</label>
                <input
                  type="range"
                  min="30"
                  max="300"
                  step="30"
                  value={orderTimeout}
                  onChange={(e) => setOrderTimeout(parseInt(e.target.value))}
                  className="risk-slider"
                />
                <div className="slider-labels">
                  <span>30s</span>
                  <span>150s</span>
                  <span>300s</span>
                </div>
                <div className="strategy-description">
                  ⏱️ Cancel unfilled LIMIT orders after this time to allow new signals
                </div>
              </div>
              )}

              {/* Strategy - Hide if Auto Mode (uses scanner) */}
              {!autoMode && (
              <div className="risk-form-group">
                <label className="risk-label">Trading Strategy</label>
                <select
                  className="risk-input"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                >
                  <option value="range_trading">Range Trading (Mean Reversion)</option>
                  <option value="momentum">Momentum (LLM-Powered)</option>
                  <option value="scalp">Aggressive Reversion Scalping ⚡</option>
                  <option value="momentum_x">Momentum X (Psychic Candle Reader) 🔥</option>
                </select>
                <div className="strategy-description">
                  {strategy === 'range_trading' 
                    ? '📊 Trades bounces off 24h support/resistance levels'
                    : strategy === 'momentum'
                    ? '🤖 AI-powered trend-following using GPT-5 analysis'
                    : strategy === 'scalp'
                    ? '⚡ Ultra-fast 30-second signals, optimized for 75x leverage'
                    : '🔮 8-layer whipsaw scalper with delta, orderbook, FVG analysis @ 100x'
                  }
                </div>
              </div>
              )}

              {/* Exit Strategy - Available for all modes */}
              <div className="risk-form-group">
                <label className="risk-label">Exit Strategy</label>
                
                {/* Simple Break-Even Option */}
                <label className="breakeven-option">
                  <input
                    type="radio"
                    name="exitStrategy"
                    checked={breakEvenMode && !trailingBreakEven}
                    onChange={() => {
                      setBreakEvenMode(true)
                      setTrailingBreakEven(false)
                    }}
                    className="breakeven-radio"
                  />
                  <span className="breakeven-option-text">
                    Simple Break-Even (Volume Farming)
                  </span>
                </label>
                {breakEvenMode && !trailingBreakEven && (
                  <>
                    <div className="breakeven-description">
                      💰 Closes at Net PNL ≥ $0. Minimizes risk, maximizes volume.
                    </div>
                    <div className="breakeven-tolerance-section">
                      <label className="risk-label">Loss Tolerance</label>
                      <input
                        type="number"
                        value={breakEvenLossTolerance}
                        onChange={(e) => setBreakEvenLossTolerance(parseFloat(e.target.value) || 0)}
                        className="risk-input"
                        placeholder="20"
                        min="0"
                        step="5"
                      />
                      <div className="breakeven-description">
                        If PnL gets close to breakeven then falls back, will close when it returns within -${breakEvenLossTolerance}
                      </div>
                    </div>
                  </>
                )}

                {/* Trailing Break-Even Option */}
                <label className="breakeven-option">
                  <input
                    type="radio"
                    name="exitStrategy"
                    checked={trailingBreakEven}
                    onChange={() => {
                      setBreakEvenMode(false)
                      setTrailingBreakEven(true)
                    }}
                    className="breakeven-radio"
                  />
                  <span className="breakeven-option-text">
                    Trailing Break-Even Stop Loss
                  </span>
                </label>
                {trailingBreakEven && (
                  <div className="trailing-config">
                    <div className="breakeven-description">
                      🎯 For every ${trailingIncrement} profit, stop loss moves up ${trailingIncrement}. Normal TP still applies.
                    </div>
                    
                    <div className="trailing-setting">
                      <label className="risk-label">Trailing Increment: ${trailingIncrement}</label>
                      <div className="risk-slider-container">
                        <input
                          type="range"
                          min="5"
                          max="100"
                          step="5"
                          value={trailingIncrement}
                          onChange={(e) => setTrailingIncrement(Number(e.target.value))}
                          className="risk-slider"
                        />
                        <div className="risk-slider-labels">
                          <span>$5</span>
                          <span>$50</span>
                          <span>$100</span>
                        </div>
                      </div>
                      <div className="breakeven-description">
                        Example: At ${trailingIncrement} increment, reaching $60 profit sets stop at $40 (allows one ${trailingIncrement} pullback)
                      </div>
                    </div>
                  </div>
                )}

                {/* Standard TP/SL Option */}
                <label className="breakeven-option">
                  <input
                    type="radio"
                    name="exitStrategy"
                    checked={!breakEvenMode && !trailingBreakEven}
                    onChange={() => {
                      setBreakEvenMode(false)
                      setTrailingBreakEven(false)
                    }}
                    className="breakeven-radio"
                  />
                  <span className="breakeven-option-text">
                    Standard TP/SL (Manual Settings Above)
                  </span>
                </label>
              </div>

              {validationError && (
                <div className="risk-error-message">
                  {validationError}
                </div>
              )}

              <button className="risk-save-button" onClick={handleStart} disabled={isRunning || isValidating}>
                {isRunning ? 'Running...' : isValidating ? 'Validating...' : 'Start'}
              </button>
              </>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Auth Re-verification Modal */}
      {showAuthModal && (
        <div className="risk-modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="risk-modal auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="risk-modal-close" onClick={() => setShowAuthModal(false)}>×</button>
            <div className="risk-modal-wrapper">
              <h2 className="risk-modal-title">Re-Authentication Required</h2>
              <div className="auth-modal-content">
                <div className="auth-modal-icon">⚠️</div>
                <p className="auth-modal-message">
                  Your authentication session has expired. Please sign the authentication message in your wallet to continue trading.
                </p>
                <div className="auth-modal-buttons">
                  <button 
                    className="auth-modal-button primary"
                    onClick={handleReAuthenticate}
                  >
                    Re-Authenticate
                  </button>
                  <button 
                    className="auth-modal-button secondary"
                    onClick={() => {
                      setShowAuthModal(false)
                      handleStop()
                    }}
                  >
                    Stop Bot
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PerpFarming
