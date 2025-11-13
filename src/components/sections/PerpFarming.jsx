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

function PerpFarming({ onBotMessageChange, onBotMessagesChange, onBotStatusChange }) {
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
  const [autoMode, setAutoMode] = useState(false) // Auto Mode - Portfolio Scanner (replaces all other strategies)
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
  const [positionPnls, setPositionPnls] = useState([]) // Individual position PnLs: [{ symbol, pnl }, ...]
  const [showClosePositionModal, setShowClosePositionModal] = useState(false)
  const [selectedPositionToClose, setSelectedPositionToClose] = useState(null)
  const [addToExcludeList, setAddToExcludeList] = useState(false)
  const [botMessage, setBotMessage] = useState('Initializing...')
  const [botMessages, setBotMessages] = useState({})
  const lastMessageUpdateRef = useRef({})
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showPairSelection, setShowPairSelection] = useState(false) // Toggle between settings and pair selection
  const [availableSymbols, setAvailableSymbols] = useState([]) // List of symbols from API
  const [selectedPairs, setSelectedPairs] = useState(['BTCUSDT']) // Default to BTC, max 5
  const [loadingSymbols, setLoadingSymbols] = useState(false)
  const [portfolioPositions, setPortfolioPositions] = useState([]) // Track Auto Mode (Portfolio Scanner V2) positions
  const [excludedPairs, setExcludedPairs] = useState([]) // Pairs to exclude from Auto Mode (manual trading)
  const [showExclusionList, setShowExclusionList] = useState(false) // Toggle for exclusion list modal
  
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
  const signalHistoryRef = useRef(new Map()) // Track signal history per symbol: { entryTime, signals: [], lastSide, lastConfidence }
  const peakPnlPerSymbolRef = useRef(new Map()) // Track peak PNL per symbol for trailing stops in Auto Mode
  const trailingStopPerSymbolRef = useRef(new Map()) // Track trailing stop per symbol for Auto Mode
  const signalStatusPollRef = useRef(null) // Track signal status poll interval
  const portfolioPositionsRef = useRef([]) // Current portfolio positions (for polling)
  const excludedPairsRef = useRef([]) // Current excluded pairs (for polling)

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY)
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        console.log('[PerpFarming] Loading settings from localStorage:', {
          capital: settings.capital,
          capitalParsed: parseFloat(settings.capital || '0'),
          positionSize: settings.positionSize,
          autoMode: settings.autoMode
        })
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
        setAutoMode(settings.autoMode || false) // Auto Mode (Portfolio Scanner)
        setSmartMode(settings.smartMode !== undefined ? settings.smartMode : true) // Default enabled
        setSmartModeMinPnl(settings.smartModeMinPnl !== undefined ? settings.smartModeMinPnl : -50)
        setTrustLowConfidence(settings.trustLowConfidence || false)
        setBreakEvenMode(settings.breakEvenMode || false)
        setBreakEvenLossTolerance(settings.breakEvenLossTolerance !== undefined ? settings.breakEvenLossTolerance : 20)
        setTrailingBreakEven(settings.trailingBreakEven || false)
        setTrailingIncrement(settings.trailingIncrement !== undefined ? settings.trailingIncrement : 20)
        setSelectedPairs(settings.selectedPairs || ['BTCUSDT']) // Load selected pairs
        setExcludedPairs(settings.excludedPairs || []) // Load excluded pairs
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

  // Filter botMessages to only include symbols with active positions
  const filterActiveMessages = (messages, orderManager) => {
    if (!orderManager) return messages
    
    const status = orderManager.getStatus()
    const activeSymbols = new Set()
    
    // Get active positions
    if (status.activePositions && status.activePositions.length > 0) {
      status.activePositions.forEach(pos => {
        if (pos.symbol) activeSymbols.add(pos.symbol)
      })
    }
    
    // Get pending orders (they will become positions)
    if (status.activeOrders && status.activeOrders.length > 0) {
      status.activeOrders.forEach(order => {
        if (order.symbol) activeSymbols.add(order.symbol)
      })
    }
    
    // Filter messages to only include active symbols
    const filtered = {}
    for (const [sym, msg] of Object.entries(messages)) {
      if (activeSymbols.has(sym)) {
        filtered[sym] = msg
      }
    }
    
    return filtered
  }

  const updateBotMessage = (symbol, message) => {
    const now = Date.now()
    const lastUpdate = lastMessageUpdateRef.current[symbol] || 0
    const timeSinceUpdate = (now - lastUpdate) / 1000
    
    if (timeSinceUpdate < 30) {
      console.log(`[BotMessage] Skipping update for ${symbol} (${timeSinceUpdate.toFixed(0)}s since last update, need 30s)`)
      return
    }
    
    // Only update message if symbol has an active position or pending order
    if (orderManagerRef.current) {
      const status = orderManagerRef.current.getStatus()
      const hasActivePosition = status.activePositions?.some(p => p.symbol === symbol)
      const hasPendingOrder = status.activeOrders?.some(o => o.symbol === symbol)
      
      if (!hasActivePosition && !hasPendingOrder) {
        console.log(`[BotMessage] Skipping update for ${symbol} - no active position or pending order`)
        return
      }
    }
    
    lastMessageUpdateRef.current[symbol] = now
    
    setBotMessages(prev => {
      const updated = { ...prev, [symbol]: message }
      
      // Filter to only active positions before passing to parent
      const filtered = orderManagerRef.current 
        ? filterActiveMessages(updated, orderManagerRef.current)
        : updated
      
      if (onBotMessagesChange) {
        onBotMessagesChange(filtered)
      }
      
      const messageArray = Object.entries(filtered)
        .map(([sym, msg]) => `[${sym}] ${msg}`)
        .join('\n\n')
      
      setBotMessage(messageArray || 'Waiting for signals...')
      
      if (onBotMessageChange) {
        onBotMessageChange(messageArray || 'Waiting for signals...')
      }
      
      return updated
    })
  }

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
        autoMode, // Auto Mode (Portfolio Scanner)
        smartMode,
        smartModeMinPnl,
        trustLowConfidence,
        breakEvenMode,
        breakEvenLossTolerance,
        trailingBreakEven,
        trailingIncrement,
        selectedPairs, // Save selected pairs
        excludedPairs // Save excluded pairs
      }
      console.log('[PerpFarming] Saving settings to localStorage:', {
        capital: settings.capital,
        capitalParsed: parseFloat(settings.capital),
        positionSize: settings.positionSize,
        autoMode: settings.autoMode
      })
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

  // Helper function to format quantity according to stepSize (round down to valid step)
  const formatQuantityToStepSize = (quantity, stepSize) => {
    const step = parseFloat(stepSize)
    const rounded = Math.floor(quantity / step) * step
    const decimals = stepSize.includes('.') ? stepSize.split('.')[1].length : 0
    return parseFloat(rounded.toFixed(decimals))
  }

  // Helper function to close position in chunks (respecting MARKET_LOT_SIZE limits)
  const closePositionInChunks = async (orderManager, symbol, logPrefix = '[ClosePosition]') => {
    // Get exact position amount from API
    const position = await orderManager.dexService.getPosition(symbol)
    const positionAmtRaw = position.positionAmt || '0'
    const positionAmt = parseFloat(positionAmtRaw)
    
    if (positionAmt === 0) {
      console.log(`${logPrefix} No position to close for ${symbol}`)
      return
    }
    
    const oppositeSide = positionAmt > 0 ? 'SELL' : 'BUY'
    const totalToClose = Math.abs(positionAmt)
    
    console.log(`${logPrefix} Closing ${symbol} position: ${totalToClose}`, {
      rawPositionAmt: positionAmtRaw,
      side: oppositeSide
    })
    
    // Get MARKET_LOT_SIZE limits for this symbol
    let marketLotSize
    try {
      marketLotSize = await orderManager.dexService.getMarketLotSize(symbol)
      console.log(`${logPrefix} Market lot size for ${symbol}:`, marketLotSize)
    } catch (error) {
      console.warn(`${logPrefix} Failed to get market lot size, using defaults:`, error.message)
      marketLotSize = { minQty: 1, maxQty: 999999999, stepSize: '1' }
    }
    
    // Split position into chunks if needed
    let remainingToClose = totalToClose
    let ordersFilled = 0
    const maxChunkSize = marketLotSize.maxQty * 0.95 // Use 95% of max to be safe
    
    console.log(`${logPrefix} Will close ${remainingToClose} in chunks of max ${maxChunkSize} (stepSize: ${marketLotSize.stepSize})`)
    
    while (remainingToClose > parseFloat(marketLotSize.minQty) * 0.1) { // Must be above minQty
      // Calculate chunk size for this order (capped by maxQty)
      let chunkSize = Math.min(remainingToClose, maxChunkSize)
      
      // CRITICAL: Format to stepSize to respect exchange rules
      chunkSize = formatQuantityToStepSize(chunkSize, marketLotSize.stepSize)
      
      // Ensure we don't try to close less than minQty
      if (chunkSize < marketLotSize.minQty) {
        console.log(`${logPrefix} Remaining ${remainingToClose} < minQty ${marketLotSize.minQty}, closing exact amount`)
        chunkSize = remainingToClose
      }
      
      console.log(`${logPrefix} Attempting to close chunk: ${chunkSize} (formatted to stepSize ${marketLotSize.stepSize})`)
      
      try {
        // Place order to close this chunk
        const result = await orderManager.dexService.placeOrder({
          symbol: symbol,
          side: oppositeSide,
          type: 'MARKET',
          quantity: chunkSize,
          reduceOnly: true
        })
        
        console.log(`${logPrefix} ✅ Order ${ordersFilled + 1} filled: ${chunkSize} @ MARKET`, result)
        ordersFilled++
        
        // Check remaining position
        const updatedPosition = await orderManager.dexService.getPosition(symbol)
        const updatedAmt = Math.abs(parseFloat(updatedPosition.positionAmt || '0'))
        
        console.log(`${logPrefix} Remaining after order ${ordersFilled}: ${updatedAmt}`)
        
        if (updatedAmt < marketLotSize.minQty * 0.1) {
          // Position fully closed (or remaining dust is negligible)
          console.log(`${logPrefix} 🎉 Position fully closed in ${ordersFilled} order(s)`)
          break
        }
        
        // Update remaining for next iteration
        remainingToClose = updatedAmt
        
      } catch (orderError) {
        console.error(`${logPrefix} ❌ Error placing order ${ordersFilled + 1}:`, orderError.message)
        console.error(`${logPrefix} Failed chunk details:`, {
          chunkSize,
          remaining: remainingToClose,
          maxAllowed: marketLotSize.maxQty,
          stepSize: marketLotSize.stepSize
        })
        
        // Re-throw - let caller handle the error
        throw orderError
      }
      
      // Safety check: prevent infinite loops
      if (ordersFilled > 50) {
        console.error(`${logPrefix} ⚠️ Too many orders (${ordersFilled}), stopping`)
        throw new Error(`Failed to close position after ${ordersFilled} attempts`)
      }
    }
  }

  // Helper function to close a position and update stats
  const closePosition = async (orderManager, symbol, currentNetPnl) => {
    try {
      // Close position in chunks (respecting market lot size limits)
      await closePositionInChunks(orderManager, symbol, '[ClosePosition]')
      
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
      
      // Clear signal history for this symbol
      signalHistoryRef.current.delete(symbol)
      
      // Clear trailing stop tracking for this symbol
      peakPnlPerSymbolRef.current.delete(symbol)
      trailingStopPerSymbolRef.current.delete(symbol)
      
      setTradingSymbols(prev => prev.filter(s => s !== symbol))
      console.log(`[ClosePosition] Removed ${symbol} from trading symbols`)
      
      setBotMessages(prev => {
        const updated = { ...prev }
        delete updated[symbol]
        delete lastMessageUpdateRef.current[symbol]
        
        // Filter to only active positions before passing to parent
        const filtered = orderManagerRef.current 
          ? filterActiveMessages(updated, orderManagerRef.current)
          : updated
        
        if (onBotMessagesChange) {
          onBotMessagesChange(filtered)
        }
        
        const messageArray = Object.entries(filtered)
          .map(([sym, msg]) => `[${sym}] ${msg}`)
          .join('\n\n')
        
        setBotMessage(messageArray || 'Waiting for signals...')
        
        if (onBotMessageChange) {
          onBotMessageChange(messageArray || 'Waiting for signals...')
        }
        
        return updated
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

  // Handle position badge click to open close confirmation modal
  const handlePositionBadgeClick = (positionData) => {
    setSelectedPositionToClose(positionData)
    setAddToExcludeList(false)
    setShowClosePositionModal(true)
  }

  // Handle confirmed position close from modal
  const handleConfirmClosePosition = async () => {
    if (!selectedPositionToClose || !orderManagerRef.current) {
      return
    }

    const { symbol, pnl } = selectedPositionToClose
    
    try {
      console.log(`[Manual Close] Closing ${symbol} with Net PNL: $${pnl.toFixed(2)}`)
      
      // Close the position
      await closePosition(orderManagerRef.current, symbol, pnl)
      
      // Remove from portfolio positions if in Auto Mode
      setPortfolioPositions(prev => prev.filter(p => p.symbol !== symbol))
      
      // Add to exclusion list if checkbox was checked
      if (addToExcludeList) {
        setExcludedPairs(prev => {
          if (!prev.includes(symbol)) {
            const updated = [...prev, symbol]
            console.log(`[Manual Close] Added ${symbol} to exclusion list`)
            // Save to localStorage
            const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            settings.excludedPairs = updated
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
            return updated
          }
          return prev
        })
        
        // Update the ref for polling loop
        excludedPairsRef.current = [...excludedPairsRef.current, symbol]
      }
      
      // Close modal and reset state
      setShowClosePositionModal(false)
      setSelectedPositionToClose(null)
      setAddToExcludeList(false)
    } catch (error) {
      console.error(`[Manual Close] Error closing ${symbol}:`, error)
      handleError(`Failed to close ${symbol}: ${error.message}`)
    }
  }

  // Smart Mode: Intelligent exit decision based on signal quality and trends
  const checkSmartExit = (symbol, newSignal, currentNetPnl, options = {}) => {
    const { isAutoMode = false } = options
    // Get or create signal history for this symbol
    if (!signalHistoryRef.current.has(symbol)) {
      signalHistoryRef.current.set(symbol, {
        entryTime: Date.now(),
        entrySide: newSignal.side,
        entryConfidence: newSignal.confidence,
        signals: [],
        peakConfidence: newSignal.confidence,
        consecutiveLowCount: 0,
        consecutiveOppositeCount: 0
      })
    }
    
    const history = signalHistoryRef.current.get(symbol)
    const confidenceScore = { high: 3, medium: 2, low: 1, neutral: 0 }
    
    // Add new signal to history (keep last 10)
    history.signals.push({
      timestamp: Date.now(),
      side: newSignal.side,
      confidence: newSignal.confidence,
      score: confidenceScore[newSignal.confidence] || 0,
      pnl: currentNetPnl
    })
    if (history.signals.length > 10) history.signals.shift()
    
    const currentScore = confidenceScore[newSignal.confidence] || 0
    const entryScore = confidenceScore[history.entryConfidence] || 0
    const timeInPosition = (Date.now() - history.entryTime) / 1000 // seconds
    
    // Update consecutive counters
    if (newSignal.confidence === 'low') {
      history.consecutiveLowCount++
    } else {
      history.consecutiveLowCount = 0
    }
    
    if (newSignal.side !== history.entrySide && newSignal.side !== 'NEUTRAL') {
      history.consecutiveOppositeCount++
    } else {
      history.consecutiveOppositeCount = 0
    }
    
    console.log(`[SmartMode] ${symbol} | Entry: ${history.entrySide} (${history.entryConfidence}) | Current: ${newSignal.side} (${newSignal.confidence}) | PNL: $${currentNetPnl.toFixed(2)} | Time: ${timeInPosition.toFixed(0)}s`)
    
    // === EXIT RULES (ordered by priority) ===
    
    // 1. IMMEDIATE EXIT: Strong reversal (high confidence opposite direction)
    if (newSignal.side !== history.entrySide && 
        newSignal.side !== 'NEUTRAL' && 
        newSignal.confidence === 'high') {
      return {
        shouldExit: true,
        reason: 'strong_reversal',
        statement: `High confidence ${newSignal.side} signal detected - reversing position`,
        details: { entryScore, currentScore, timeInPosition }
      }
    }
    
    // 2. AGGRESSIVE EXIT: Profitable + any opposite signal
    if (currentNetPnl > 10 && 
        newSignal.side !== history.entrySide && 
        newSignal.side !== 'NEUTRAL') {
      return {
        shouldExit: true,
        reason: 'profit_protection_reversal',
        statement: `Locking in $${currentNetPnl.toFixed(2)} profit - reversal signal detected`,
        details: { entryScore, currentScore, timeInPosition, pnl: currentNetPnl }
      }
    }
    
    // 3. CONFIDENCE DECAY: Held for >2min + confidence dropped 2+ levels
    // DISABLED FOR AUTO MODE - only exit on signal flips
    if (!isAutoMode && timeInPosition > 120 && (entryScore - currentScore) >= 2) {
      return {
        shouldExit: true,
        reason: 'confidence_decay',
        statement: `Confidence decayed from ${history.entryConfidence} to ${newSignal.confidence} after ${(timeInPosition / 60).toFixed(1)} minutes`,
        details: { entryScore, currentScore, timeInPosition }
      }
    }
    
    // 4. CONSECUTIVE WEAKNESS: 3+ consecutive low confidence signals
    // DISABLED FOR AUTO MODE - only exit on signal flips
    if (!isAutoMode && history.consecutiveLowCount >= 3) {
      return {
        shouldExit: true,
        reason: 'persistent_low_confidence',
        statement: `${history.consecutiveLowCount} consecutive low confidence signals - cutting losses`,
        details: { consecutiveLowCount: history.consecutiveLowCount, timeInPosition }
      }
    }
    
    // 5. OPPOSITE DIRECTION PERSISTENCE: 2+ consecutive opposite signals (any confidence)
    // DISABLED FOR AUTO MODE - only exit on signal flips
    if (!isAutoMode && history.consecutiveOppositeCount >= 2) {
      return {
        shouldExit: true,
        reason: 'persistent_reversal',
        statement: `${history.consecutiveOppositeCount} consecutive ${newSignal.side} signals - trend reversed`,
        details: { consecutiveOppositeCount: history.consecutiveOppositeCount, timeInPosition }
      }
    }
    
    // 6. PROFIT EROSION: Was up >$20, now back to breakeven or negative
    // DISABLED FOR AUTO MODE - only exit on signal flips
    const maxPastPnl = Math.max(...history.signals.map(s => s.pnl), 0)
    if (!isAutoMode && maxPastPnl > 20 && currentNetPnl <= 5 && newSignal.confidence === 'low') {
      return {
        shouldExit: true,
        reason: 'profit_erosion',
        statement: `Profit eroded from $${maxPastPnl.toFixed(2)} to $${currentNetPnl.toFixed(2)} - exiting before worse`,
        details: { maxPastPnl, currentNetPnl, timeInPosition }
      }
    }
    
    // 7. STALE POSITION: Held >5min + low confidence + losing money
    // DISABLED FOR AUTO MODE - only exit on signal flips
    if (!isAutoMode && 
        timeInPosition > 300 && 
        newSignal.confidence === 'low' && 
        currentNetPnl < -10) {
      return {
        shouldExit: true,
        reason: 'stale_losing_position',
        statement: `Position stale (${(timeInPosition / 60).toFixed(1)}min) with low confidence and negative PNL`,
        details: { timeInPosition, currentNetPnl, confidence: newSignal.confidence }
      }
    }
    
    // 8. DOWNTREND: Last 3 signals show declining confidence scores
    // DISABLED FOR AUTO MODE - only exit on signal flips
    if (!isAutoMode && history.signals.length >= 3) {
      const recent3 = history.signals.slice(-3)
      const scores = recent3.map(s => s.score)
      const isDowntrend = scores[0] > scores[1] && scores[1] > scores[2]
      
      if (isDowntrend && currentNetPnl < 0) {
        return {
          shouldExit: true,
          reason: 'confidence_downtrend',
          statement: `Confidence trending down: ${recent3.map(s => s.confidence).join(' → ')}`,
          details: { scores, currentNetPnl, timeInPosition }
        }
      }
    }
    
    // No exit conditions met
    console.log(`[SmartMode] ${symbol} - Holding position (no exit conditions met)`)
    return { shouldExit: false }
  }

  const startTrading = async (settings) => {
    // Initialize OrderManager
    const orderManager = new OrderManager()
    orderManager.onError = handleError
    
    const capitalParsed = parseFloat(settings.capital)
    console.log('[PerpFarming] Initializing OrderManager with settings:', {
      capitalRaw: settings.capital,
      capitalParsed: capitalParsed,
      positionSize: settings.positionSize,
      autoMode: settings.autoMode
    })
    
    try {
      await orderManager.initialize({
        apiKey: settings.asterApiKey,
        secretKey: settings.asterSecretKey,
        capital: capitalParsed,
        leverage: settings.leverage,
        takeProfit: settings.takeProfit,
        stopLoss: settings.stopLoss,
        tpSlMode: settings.tpSlMode,
        positionSize: settings.positionSize,
        orderType: settings.orderType,
        trustLowConfidence: settings.trustLowConfidence,
        autoMode: settings.autoMode
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
          
          // === AUTO MODE POSITION MANAGEMENT ===
          if (settings.autoMode && status.activePositions && status.activePositions.length > 0) {
            const excludedList = settings.excludedPairs || []
            
            for (const position of status.activePositions) {
              // Skip excluded pairs
              if (excludedList.includes(position.symbol)) {
                continue
              }
              
              const portfolioPos = portfolioPositions.find(p => p.symbol === position.symbol)
              if (!portfolioPos) continue
              
              const currentPosition = await orderManager.dexService.getPosition(position.symbol)
              const markPrice = parseFloat(currentPosition.markPrice || '0')
              const unrealizedProfit = parseFloat(currentPosition.unRealizedProfit || '0')
              const entryPrice = parseFloat(currentPosition.entryPrice || '0')
              const positionAmt = Math.abs(parseFloat(currentPosition.positionAmt || '0'))
              
              // Calculate Net PNL for this symbol
              const entryNotional = positionAmt * entryPrice
              const exitNotional = positionAmt * markPrice
              const totalFees = (entryNotional * ENTRY_FEE) + (exitNotional * EXIT_FEE)
              const symbolNetPnl = unrealizedProfit - totalFees
              
              // 1. LOCAL INVALIDATION CHECK (Highest Priority)
              if (portfolioPos.invalidationPrice) {
                const invalidationPrice = portfolioPos.invalidationPrice
                const isInvalidated = portfolioPos.side === 'LONG' 
                  ? markPrice < invalidationPrice 
                  : markPrice > invalidationPrice
                
                if (isInvalidated) {
                  console.log(`[Local Invalidation] 🚨 ${position.symbol} ${portfolioPos.side} invalidated: price $${markPrice} crossed $${invalidationPrice}`)
                  await closePosition(orderManager, position.symbol, symbolNetPnl)
                  setPortfolioPositions(prev => prev.filter(p => p.symbol !== position.symbol))
                  continue // Skip to next position
                }
              }
              
              // 2. INTELLIGENT TP TRAILING (Auto Mode Only)
              const serverTP = portfolioPos.serverTP
              if (serverTP && !portfolioPos.tpHit) {
                // Check if TP price reached
                const tpReached = portfolioPos.side === 'LONG' 
                  ? markPrice >= serverTP 
                  : markPrice <= serverTP
                
                if (tpReached) {
                  console.log(`[Auto TP] 🎯 ${position.symbol} TP HIT! Server TP: $${serverTP}, Current: $${markPrice}, Net PNL: $${symbolNetPnl.toFixed(2)}`)
                  
                  // Calculate trailing increment (% move from entry to TP)
                  const priceMove = Math.abs(serverTP - entryPrice)
                  const trailingIncrement = priceMove // Use absolute price increment
                  
                  console.log(`[Auto TP] Setting SL at TP: $${serverTP} | Trail increment: $${trailingIncrement.toFixed(6)} | Initial PNL: $${symbolNetPnl.toFixed(2)}`)
                  
                  // Update position to enable trailing
                  setPortfolioPositions(prev => prev.map(p => 
                    p.symbol === position.symbol 
                      ? { 
                          ...p, 
                          tpHit: true,
                          tpHitPrice: markPrice,
                          tpHitPnl: symbolNetPnl,
                          trailingIncrement: trailingIncrement,
                          currentSL: serverTP,  // Set SL at TP (even if negative PNL)
                          isTrailing: true
                        }
                      : p
                  ))
                  
                  updateBotMessage(position.symbol, `🎯 TP HIT @ $${serverTP.toFixed(6)} | Net PNL: ${symbolNetPnl >= 0 ? '+' : ''}$${symbolNetPnl.toFixed(2)} | Trailing SL active`)
                }
              }
              
              // 3. TRAILING STOP CHECK (After TP Hit)
              if (portfolioPos.isTrailing && portfolioPos.currentSL) {
                const currentSL = portfolioPos.currentSL
                const trailingIncrement = portfolioPos.trailingIncrement
                const tpHitPnl = portfolioPos.tpHitPnl || 0
                
                // Check if SL hit
                const slHit = portfolioPos.side === 'LONG' 
                  ? markPrice <= currentSL 
                  : markPrice >= currentSL
                
                if (slHit) {
                  console.log(`[Auto Trailing] 🛑 ${position.symbol} Trailing SL HIT! Price $${markPrice} hit SL $${currentSL}`)
                  console.log(`[Auto Trailing] Initial TP PNL: $${tpHitPnl.toFixed(2)}, Final PNL: $${symbolNetPnl.toFixed(2)}`)
                  await closePosition(orderManager, position.symbol, symbolNetPnl)
                  setPortfolioPositions(prev => prev.filter(p => p.symbol !== position.symbol))
                  continue
                }
                
                // Trail upward if price moved favorably
                const priceFromTP = portfolioPos.side === 'LONG' 
                  ? markPrice - portfolioPos.tpHitPrice 
                  : portfolioPos.tpHitPrice - markPrice
                
                if (priceFromTP > 0) {
                  // Calculate new SL based on price movement beyond TP
                  const incrementsAchieved = Math.floor(priceFromTP / trailingIncrement)
                  
                  if (incrementsAchieved > 0) {
                    const newSL = portfolioPos.side === 'LONG'
                      ? portfolioPos.serverTP + (incrementsAchieved * trailingIncrement)
                      : portfolioPos.serverTP - (incrementsAchieved * trailingIncrement)
                    
                    if (newSL !== currentSL) {
                      console.log(`[Auto Trailing] 📈 ${position.symbol} SL trailing: $${currentSL.toFixed(6)} → $${newSL.toFixed(6)} (${incrementsAchieved} increment${incrementsAchieved > 1 ? 's' : ''})`)
                      
                      setPortfolioPositions(prev => prev.map(p => 
                        p.symbol === position.symbol 
                          ? { ...p, currentSL: newSL }
                          : p
                      ))
                      
                      updateBotMessage(position.symbol, `📈 Trailing @ $${newSL.toFixed(6)} | Net PNL: ${symbolNetPnl >= 0 ? '+' : ''}$${symbolNetPnl.toFixed(2)} | Gain from TP: +$${(symbolNetPnl - tpHitPnl).toFixed(2)}`)
                    }
                  }
                }
              }
            }
          }
          
          // Sync tradingSymbols with actual active positions
          // This catches positions closed by orderManager directly (TP/SL, Smart Mode, etc.)
          if (status.activePositions) {
            const activeSymbols = status.activePositions.map(p => p.symbol)
            setTradingSymbols(prev => {
              // Only update if different to avoid unnecessary re-renders
              const prevSorted = [...prev].sort().join(',')
              const activeSorted = [...activeSymbols].sort().join(',')
              if (prevSorted !== activeSorted) {
                console.log('[PNL Poll] Syncing trading symbols:', { prev, active: activeSymbols })
                return activeSymbols
              }
              return prev
            })
            
            // Also sync portfolioPositions if in Auto Mode
            if (settings.autoMode) {
              const excludedList = settings.excludedPairs || []
              setPortfolioPositions(prev => {
                // Filter to only active positions AND not excluded
                const filtered = prev.filter(p => 
                  activeSymbols.includes(p.symbol) && !excludedList.includes(p.symbol)
                )
                if (filtered.length !== prev.length) {
                  console.log('[PNL Poll] Syncing portfolio positions - removed closed/excluded positions')
                  return filtered
                }
                return prev
              })
            }
          } else {
            // No active positions, clear trading symbols
            setTradingSymbols(prev => {
              if (prev.length > 0) {
                console.log('[PNL Poll] No active positions - clearing trading symbols')
                return []
              }
              return prev
            })
            
            // Clear individual position PnLs
            setPositionPnls([])
            
            // Clear portfolio positions too if in Auto Mode
            if (settings.autoMode) {
              setPortfolioPositions(prev => {
                if (prev.length > 0) {
                  console.log('[PNL Poll] Clearing portfolio positions')
                  return []
                }
                return prev
              })
            }
          }
          
          if (status.activePositions && status.activePositions.length > 0) {
            // Calculate total PNL in dollars from all positions
            let totalPnlDollars = 0
            let totalFees = 0
            const individualPnls = []
            
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
              
              // Calculate individual position net PnL
              const positionNetPnl = unrealizedProfit - totalPosFees
              individualPnls.push({ symbol: position.symbol, pnl: positionNetPnl })
              
              totalPnlDollars += unrealizedProfit
              totalFees += totalPosFees
            }
            
            // Update individual position PnLs
            setPositionPnls(individualPnls)
            
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
                console.log(`[TP/SL] Attempting to close all ${status.activePositions.length} positions with TOTAL Net PNL: $${netPnl.toFixed(2)}`)
                
                // FIRST: Try to close ALL positions - collect any errors
                const closeResults = []
                for (const position of status.activePositions) {
                  try {
                    await closePositionInChunks(orderManager, position.symbol, '[TP/SL]')
                    closeResults.push({ symbol: position.symbol, success: true })
                    
                    signalHistoryRef.current.delete(position.symbol)
                    peakPnlPerSymbolRef.current.delete(position.symbol)
                    trailingStopPerSymbolRef.current.delete(position.symbol)
                    console.log(`[TP/SL] ✅ Successfully closed ${position.symbol}`)
                  } catch (error) {
                    closeResults.push({ symbol: position.symbol, success: false, error: error.message })
                    console.error(`[TP/SL] ❌ Failed to close ${position.symbol}:`, error.message)
                  }
                }
                
                // Check if ALL positions closed successfully
                const allClosed = closeResults.every(r => r.success)
                const successCount = closeResults.filter(r => r.success).length
                
                if (allClosed) {
                  // ONLY update PNL if ALL positions closed successfully
                  setOverallPnl(prev => {
                    const newValue = prev + netPnl
                    console.log(`[Stats] ✅ Dollar TP SUCCESS: Overall PNL: $${prev.toFixed(2)} + $${netPnl.toFixed(2)} = $${newValue.toFixed(2)}`)
                    
                    setTotalTrades(currentTrades => {
                      const newTradeCount = currentTrades + status.activePositions.length
                      saveStats(newValue, newTradeCount)
                      return newTradeCount
                    })
                    
                    return newValue
                  })
                } else {
                  console.error(`[TP/SL] ⚠️ PARTIAL CLOSE: ${successCount}/${status.activePositions.length} positions closed. PNL NOT updated.`)
                  console.error('[TP/SL] Failed positions:', closeResults.filter(r => !r.success))
                }
                
                setTradingSymbols([])
                setBotMessages({})
                lastMessageUpdateRef.current = {}
                
                positionsClosed = true
              }
              
              // Check Stop Loss (use gross PNL before fees)
              if (!positionsClosed && stopLossDollars > 0 && totalPnlDollars <= -stopLossDollars) {
                console.log(`Stop Loss hit: $${totalPnlDollars.toFixed(2)} <= -$${stopLossDollars.toFixed(2)} (gross, before fees)`)
                console.log(`[TP/SL] Attempting to close all ${status.activePositions.length} positions with TOTAL Net PNL: $${netPnl.toFixed(2)}`)
                
                // FIRST: Try to close ALL positions - collect any errors
                const closeResults = []
                for (const position of status.activePositions) {
                  try {
                    await closePositionInChunks(orderManager, position.symbol, '[TP/SL]')
                    closeResults.push({ symbol: position.symbol, success: true })
                    
                    signalHistoryRef.current.delete(position.symbol)
                    peakPnlPerSymbolRef.current.delete(position.symbol)
                    trailingStopPerSymbolRef.current.delete(position.symbol)
                    console.log(`[TP/SL] ✅ Successfully closed ${position.symbol}`)
                  } catch (error) {
                    closeResults.push({ symbol: position.symbol, success: false, error: error.message })
                    console.error(`[TP/SL] ❌ Failed to close ${position.symbol}:`, error.message)
                  }
                }
                
                // Check if ALL positions closed successfully
                const allClosed = closeResults.every(r => r.success)
                const successCount = closeResults.filter(r => r.success).length
                
                if (allClosed) {
                  // ONLY update PNL if ALL positions closed successfully
                  setOverallPnl(prev => {
                    const newValue = prev + netPnl
                    console.log(`[Stats] ✅ Dollar SL SUCCESS: Overall PNL: $${prev.toFixed(2)} + $${netPnl.toFixed(2)} = $${newValue.toFixed(2)}`)
                    
                    setTotalTrades(currentTrades => {
                      const newTradeCount = currentTrades + status.activePositions.length
                      saveStats(newValue, newTradeCount)
                      return newTradeCount
                    })
                    
                    return newValue
                  })
                } else {
                  console.error(`[TP/SL] ⚠️ PARTIAL CLOSE: ${successCount}/${status.activePositions.length} positions closed. PNL NOT updated.`)
                  console.error('[TP/SL] Failed positions:', closeResults.filter(r => !r.success))
                }
                
                setTradingSymbols([])
                setBotMessages({})
                lastMessageUpdateRef.current = {}
                
                positionsClosed = true
              }
            }
            
            // If positions weren't closed by TP/SL, check exit strategy modes
            if (!positionsClosed) {
              // Check trailing stop loss (dollar increment based)
              if (settings.trailingBreakEven) {
                const increment = parseFloat(settings.trailingIncrement) || 20
                
                // In Auto Mode, track trailing stops per symbol
                if (settings.autoMode) {
                  // Get dollar SL for hard stop protection
                  const hardStopLoss = settings.tpSlMode === 'dollar' ? parseFloat(settings.stopLoss) : 0
                  
                  // Check trailing stop per symbol
                  for (const position of status.activePositions) {
                    const symbol = position.symbol
                    const currentPosition = await orderManager.dexService.getPosition(symbol)
                    const unrealizedProfit = parseFloat(currentPosition.unRealizedProfit || '0')
                    const entryPrice = parseFloat(currentPosition.entryPrice || '0')
                    const positionAmt = Math.abs(parseFloat(currentPosition.positionAmt || '0'))
                    const markPrice = parseFloat(currentPosition.markPrice || '0')
                    
                    // Calculate fees for this symbol
                    const entryNotional = positionAmt * entryPrice
                    const exitNotional = positionAmt * markPrice
                    const entryFee = entryNotional * ENTRY_FEE
                    const exitFee = exitNotional * EXIT_FEE
                    const totalPosFees = entryFee + exitFee
                    const symbolNetPnl = unrealizedProfit - totalPosFees
                    
                    // HARD STOP LOSS: Per-symbol SL check (even if trailing stop not activated)
                    // Protects positions that go negative without ever reaching positive peak
                    if (hardStopLoss > 0 && symbolNetPnl <= -hardStopLoss) {
                      console.log(`[Hard SL] ${symbol} Stop Hit: Net PNL $${symbolNetPnl.toFixed(2)} <= -$${hardStopLoss.toFixed(2)}`)
                      await closePosition(orderManager, symbol, symbolNetPnl)
                      peakPnlPerSymbolRef.current.delete(symbol)
                      trailingStopPerSymbolRef.current.delete(symbol)
                      continue // Skip to next position
                    }
                    
                    // Track peak PNL per symbol
                    const currentPeak = peakPnlPerSymbolRef.current.get(symbol) || 0
                    if (symbolNetPnl > currentPeak) {
                      peakPnlPerSymbolRef.current.set(symbol, symbolNetPnl)
                    }
                    const symbolPeak = peakPnlPerSymbolRef.current.get(symbol) || 0
                    
                    // Calculate trailing stop per symbol (only if peak is positive)
                    if (symbolPeak >= increment) {
                      const incrementsAchieved = Math.floor(symbolPeak / increment)
                      const symbolTrailingStop = Math.max((incrementsAchieved - 1) * increment, 0)
                      trailingStopPerSymbolRef.current.set(symbol, symbolTrailingStop)
                      
                      // Check if current PNL dropped below trailing stop for this symbol
                      if (symbolNetPnl <= symbolTrailingStop) {
                        console.log(`[Trailing] ${symbol} Stop Hit: Net PNL $${symbolNetPnl.toFixed(2)} <= Trailing Stop $${symbolTrailingStop.toFixed(2)} (Peak: $${symbolPeak.toFixed(2)}, Increment: $${increment})`)
                        await closePosition(orderManager, symbol, symbolNetPnl)
                        // Remove from tracking
                        peakPnlPerSymbolRef.current.delete(symbol)
                        trailingStopPerSymbolRef.current.delete(symbol)
                      } else {
                        console.log(`[Trailing] ${symbol} Peak: $${symbolPeak.toFixed(2)}, Stop: $${symbolTrailingStop.toFixed(2)}, Current: $${symbolNetPnl.toFixed(2)} (Increment: $${increment})`)
                      }
                    }
                  }
                } else {
                  // Manual Mode: Use total PNL (existing behavior)
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
                      console.log(`[Trailing] Attempting to close all ${status.activePositions.length} positions with TOTAL Net PNL: $${netPnl.toFixed(2)}`)
                      
                      // FIRST: Try to close ALL positions - collect any errors
                      const closeResults = []
                      for (const position of status.activePositions) {
                        try {
                          await closePositionInChunks(orderManager, position.symbol, '[Trailing]')
                          closeResults.push({ symbol: position.symbol, success: true })
                          
                          signalHistoryRef.current.delete(position.symbol)
                          peakPnlPerSymbolRef.current.delete(position.symbol)
                          trailingStopPerSymbolRef.current.delete(position.symbol)
                          console.log(`[Trailing] ✅ Successfully closed ${position.symbol}`)
                        } catch (error) {
                          closeResults.push({ symbol: position.symbol, success: false, error: error.message })
                          console.error(`[Trailing] ❌ Failed to close ${position.symbol}:`, error.message)
                        }
                      }
                      
                      // Check if ALL positions closed successfully
                      const allClosed = closeResults.every(r => r.success)
                      const successCount = closeResults.filter(r => r.success).length
                      
                      if (allClosed) {
                        // ONLY update PNL if ALL positions closed successfully
                        setOverallPnl(prev => {
                          const newValue = prev + netPnl
                          console.log(`[Stats] ✅ Trailing SL SUCCESS: Overall PNL: $${prev.toFixed(2)} + $${netPnl.toFixed(2)} = $${newValue.toFixed(2)}`)
                          
                          setTotalTrades(currentTrades => {
                            const newTradeCount = currentTrades + status.activePositions.length
                            saveStats(newValue, newTradeCount)
                            return newTradeCount
                          })
                          
                          return newValue
                        })
                      } else {
                        console.error(`[Trailing] ⚠️ PARTIAL CLOSE: ${successCount}/${status.activePositions.length} positions closed. PNL NOT updated.`)
                        console.error('[Trailing] Failed positions:', closeResults.filter(r => !r.success))
                      }
                      
                      setTradingSymbols([])
                      setBotMessages({})
                      lastMessageUpdateRef.current = {}
                    } else {
                      console.log(`[Trailing] Peak: $${peakPnlRef.current.toFixed(2)}, Stop: $${trailingStop.toFixed(2)}, Current: $${netPnl.toFixed(2)} (Increment: $${increment})`)
                    }
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
                  console.log(`[BreakEven] Attempting to close all ${status.activePositions.length} positions with TOTAL Net PNL: $${netPnl.toFixed(2)}`)
                  
                  // FIRST: Try to close ALL positions - collect any errors
                  const closeResults = []
                  for (const position of status.activePositions) {
                    try {
                      await closePositionInChunks(orderManager, position.symbol, '[BreakEven]')
                      closeResults.push({ symbol: position.symbol, success: true })
                      
                      signalHistoryRef.current.delete(position.symbol)
                      peakPnlPerSymbolRef.current.delete(position.symbol)
                      trailingStopPerSymbolRef.current.delete(position.symbol)
                      console.log(`[BreakEven] ✅ Successfully closed ${position.symbol}`)
                    } catch (error) {
                      closeResults.push({ symbol: position.symbol, success: false, error: error.message })
                      console.error(`[BreakEven] ❌ Failed to close ${position.symbol}:`, error.message)
                    }
                  }
                  
                  // Check if ALL positions closed successfully
                  const allClosed = closeResults.every(r => r.success)
                  const successCount = closeResults.filter(r => r.success).length
                  
                  if (allClosed) {
                    // ONLY update PNL if ALL positions closed successfully
                    setOverallPnl(prev => {
                      const newValue = prev + netPnl
                      console.log(`[Stats] ✅ BreakEven SUCCESS: Overall PNL: $${prev.toFixed(2)} + $${netPnl.toFixed(2)} = $${newValue.toFixed(2)}`)
                      
                      setTotalTrades(currentTrades => {
                        const newTradeCount = currentTrades + status.activePositions.length
                        saveStats(newValue, newTradeCount)
                        return newTradeCount
                      })
                      
                      return newValue
                    })
                  } else {
                    console.error(`[BreakEven] ⚠️ PARTIAL CLOSE: ${successCount}/${status.activePositions.length} positions closed. PNL NOT updated.`)
                    console.error('[BreakEven] Failed positions:', closeResults.filter(r => !r.success))
                  }
                  
                  setTradingSymbols([])
                  setBotMessages({})
                  lastMessageUpdateRef.current = {}
                } else if (withinTolerance && previouslyWasCloser) {
                  console.log(`Break-even loss tolerance hit: Net PNL $${netPnl.toFixed(2)} (was $${bestBreakEvenPnlRef.current.toFixed(2)}) within tolerance -$${lossTolerance}`)
                  console.log(`[BreakEven] Attempting to close all ${status.activePositions.length} positions with TOTAL Net PNL: $${netPnl.toFixed(2)}`)
                  
                  // FIRST: Try to close ALL positions - collect any errors
                  const closeResults = []
                  for (const position of status.activePositions) {
                    try {
                      await closePositionInChunks(orderManager, position.symbol, '[BreakEven]')
                      closeResults.push({ symbol: position.symbol, success: true })
                      
                      signalHistoryRef.current.delete(position.symbol)
                      peakPnlPerSymbolRef.current.delete(position.symbol)
                      trailingStopPerSymbolRef.current.delete(position.symbol)
                      console.log(`[BreakEven] ✅ Successfully closed ${position.symbol}`)
                    } catch (error) {
                      closeResults.push({ symbol: position.symbol, success: false, error: error.message })
                      console.error(`[BreakEven] ❌ Failed to close ${position.symbol}:`, error.message)
                    }
                  }
                  
                  // Check if ALL positions closed successfully
                  const allClosed = closeResults.every(r => r.success)
                  const successCount = closeResults.filter(r => r.success).length
                  
                  if (allClosed) {
                    // ONLY update PNL if ALL positions closed successfully
                    setOverallPnl(prev => {
                      const newValue = prev + netPnl
                      console.log(`[Stats] ✅ BreakEven Tolerance SUCCESS: Overall PNL: $${prev.toFixed(2)} + $${netPnl.toFixed(2)} = $${newValue.toFixed(2)}`)
                      
                      setTotalTrades(currentTrades => {
                        const newTradeCount = currentTrades + status.activePositions.length
                        saveStats(newValue, newTradeCount)
                        return newTradeCount
                      })
                      
                      return newValue
                    })
                  } else {
                    console.error(`[BreakEven] ⚠️ PARTIAL CLOSE: ${successCount}/${status.activePositions.length} positions closed. PNL NOT updated.`)
                    console.error('[BreakEven] Failed positions:', closeResults.filter(r => !r.success))
                  }
                  
                  setTradingSymbols([])
                  setBotMessages({})
                  lastMessageUpdateRef.current = {}
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
              
              const symbol = scalpData.symbol
              const currentNetPnl = lastPnlRef.current || 0
              const minPnl = parseFloat(settings.smartModeMinPnl) || -50
              
              // Check if PNL is above minimum threshold before running Smart Mode
              if (currentNetPnl >= minPnl) {
                const exitDecision = checkSmartExit(symbol, {
                  side: scalpData.side,
                  confidence: scalpData.confidence
                }, currentNetPnl)

                if (exitDecision.shouldExit) {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT: ${exitDecision.reason}`)
                  console.log(`[PerpFarming] 🧠 Details:`, exitDecision.details)
                  
                  setBotMessage(exitDecision.statement)
                  if (onBotMessageChange) onBotMessageChange(exitDecision.statement)
                  
                  // Close position
                  await closePosition(orderManager, symbol, currentNetPnl)
                  
                  return // Exit early, don't process new entry
                }
              } else {
                console.log(`[PerpFarming] 🧠 Smart Mode DISABLED for this signal: PNL $${currentNetPnl.toFixed(2)} < min $${minPnl.toFixed(2)}`)
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

            // === CLIENT-SIDE ANALYSIS FOR LOW CONFIDENCE SIGNALS ===
            if (momentumData.confidence === 'low') {
              console.log('[PerpFarming] 🧠 Low confidence detected, performing client-side analysis...')
              
              const rsi = momentumData.rsi || 50
              const rsiOversold = rsi < 40
              const rsiOverbought = rsi > 60
              const nearFibSupport = momentumData.near_fib_level?.type === 'support' && momentumData.near_fib_level?.distance < 0.15
              const nearFibResistance = momentumData.near_fib_level?.type === 'resistance' && momentumData.near_fib_level?.distance < 0.15
              const atFibSupport = momentumData.at_fib_support === true
              const atFibResistance = momentumData.at_fib_resistance === true
              const rsiAlignedOversold = momentumData.rsi_alignment === 'ALIGNED_OVERSOLD'
              const rsiAlignedOverbought = momentumData.rsi_alignment === 'ALIGNED_OVERBOUGHT'
              
              // Rule 1: RSI oversold + near/at fib support = LONG
              if ((rsiOversold || rsiAlignedOversold) && (nearFibSupport || atFibSupport)) {
                momentumData.side = 'LONG'
                momentumData.confidence = 'medium'
                momentumData.limit_price = momentumData.near_fib_level?.price || momentumData.current_price
                const fibLevel = momentumData.near_fib_level?.level || 'fib support'
                console.log(`🧠 Client Override: RSI ${rsi.toFixed(1)} oversold + ${fibLevel} support → LONG (upgraded to MEDIUM)`)
                momentumData.reasoning = `Client Analysis: RSI oversold (${rsi.toFixed(1)}) + ${fibLevel} support. Upgraded from low to medium confidence.`
              }
              
              // Rule 2: RSI overbought + near/at fib resistance = SHORT
              else if ((rsiOverbought || rsiAlignedOverbought) && (nearFibResistance || atFibResistance)) {
                momentumData.side = 'SHORT'
                momentumData.confidence = 'medium'
                momentumData.limit_price = momentumData.near_fib_level?.price || momentumData.current_price
                const fibLevel = momentumData.near_fib_level?.level || 'fib resistance'
                console.log(`🧠 Client Override: RSI ${rsi.toFixed(1)} overbought + ${fibLevel} resistance → SHORT (upgraded to MEDIUM)`)
                momentumData.reasoning = `Client Analysis: RSI overbought (${rsi.toFixed(1)}) + ${fibLevel} resistance. Upgraded from low to medium confidence.`
              }
              
              // Rule 3: Multi-timeframe RSI aligned (even if trends neutral)
              else if (rsiAlignedOversold) {
                momentumData.side = 'LONG'
                momentumData.confidence = 'medium'
                console.log(`🧠 Client Override: Multi-timeframe RSI aligned oversold → LONG (upgraded to MEDIUM)`)
                momentumData.reasoning = `Client Analysis: Multi-timeframe RSI oversold alignment detected. Upgraded from low to medium confidence.`
              }
              else if (rsiAlignedOverbought) {
                momentumData.side = 'SHORT'
                momentumData.confidence = 'medium'
                console.log(`🧠 Client Override: Multi-timeframe RSI aligned overbought → SHORT (upgraded to MEDIUM)`)
                momentumData.reasoning = `Client Analysis: Multi-timeframe RSI overbought alignment detected. Upgraded from low to medium confidence.`
              }
              
              // If no override, keep as low confidence
              else {
                console.log(`🧠 Client Analysis: No override criteria met, keeping low confidence ${momentumData.side}`)
              }
            }

            // Update bot message with reasoning (server or client-modified)
            const reasoning = momentumData.reasoning || 'Calling home for some data...'
            setBotMessage(reasoning)
            if (onBotMessageChange) onBotMessageChange(reasoning)

            // Symbol is already tracked in tradingSymbols array from settings
            
            // Only process LONG/SHORT signals when trends are ALIGNED (unless client upgraded from low)
            if (momentumData.side === 'NEUTRAL' || (momentumData.trend_alignment === 'CONFLICTED' && momentumData.confidence !== 'medium')) {
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
              trend_1h: momentumData.trend_1h,
              trend_4h: momentumData.trend_4h,
              confluence_score: momentumData.confluence_score,
              rsi_alignment: momentumData.rsi_alignment,
              at_fib_support: momentumData.at_fib_support,
              at_fib_resistance: momentumData.at_fib_resistance,
              activePositions: status.activePositions
            })

            // If position exists, check Smart Mode exit conditions
            if (hasActivePosition && settings.smartMode) {
              console.log('[PerpFarming] 🧠 Smart Mode: Checking exit conditions')
              
              const symbol = momentumData.symbol
              const currentNetPnl = lastPnlRef.current || 0
              const minPnl = parseFloat(settings.smartModeMinPnl) || -50
              
              // Check if PNL is above minimum threshold before running Smart Mode
              if (currentNetPnl >= minPnl) {
                const exitDecision = checkSmartExit(symbol, {
                  side: momentumData.side,
                  confidence: momentumData.confidence
                }, currentNetPnl)

                if (exitDecision.shouldExit) {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT: ${exitDecision.reason}`)
                  console.log(`[PerpFarming] 🧠 Details:`, exitDecision.details)
                  
                  setBotMessage(exitDecision.statement)
                  if (onBotMessageChange) onBotMessageChange(exitDecision.statement)
                  
                  // Close position
                  await closePosition(orderManager, symbol, currentNetPnl)
                  
                  return // Exit early, don't process new entry
                }
              } else {
                console.log(`[PerpFarming] 🧠 Smart Mode DISABLED for this signal: PNL $${currentNetPnl.toFixed(2)} < min $${minPnl.toFixed(2)}`)
              }
            }
            
            // Accept high and medium confidence signals, or low if user trusts them
            const shouldTrade = momentumData.confidence === 'high' || 
                                momentumData.confidence === 'medium' || 
                                (momentumData.confidence === 'low' && settings.trustLowConfidence)
            
            if (!hasActivePosition && shouldTrade) {
              console.log(`[PerpFarming] 🎯 Processing ${momentumData.confidence.toUpperCase()} confidence ${momentumData.side} momentum signal @ $${momentumData.limit_price} (${momentumData.confluence_score}/10 layers)`)
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
              
              const symbol = momentumXData.symbol
              const currentNetPnl = lastPnlRef.current || 0
              const minPnl = parseFloat(settings.smartModeMinPnl) || -50
              
              // Check if PNL is above minimum threshold before running Smart Mode
              if (currentNetPnl >= minPnl) {
                const exitDecision = checkSmartExit(symbol, {
                  side: momentumXData.side,
                  confidence: momentumXData.confidence
                }, currentNetPnl)

                if (exitDecision.shouldExit) {
                  console.log(`[PerpFarming] 🧠 Smart Mode EXIT: ${exitDecision.reason}`)
                  console.log(`[PerpFarming] 🧠 Details:`, exitDecision.details)
                  
                  setBotMessage(exitDecision.statement)
                  if (onBotMessageChange) onBotMessageChange(exitDecision.statement)
                  
                  // Close position
                  await closePosition(orderManager, symbol, currentNetPnl)
                  
                  return // Exit early, don't process new entry
                }
              } else {
                console.log(`[PerpFarming] 🧠 Smart Mode DISABLED for this signal: PNL $${currentNetPnl.toFixed(2)} < min $${minPnl.toFixed(2)}`)
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
        
        // Handle Order Book Trading signals (Near Real-Time Order Flow)
        wsClient.onOrderBookSignal = async (message) => {
          try {
            console.log('[PerpFarming] Received order book signal:', message)
            
            // Extract the actual order book data
            const orderBookData = message?.data || message
            
            // Defensive: ignore if malformed
            if (!orderBookData) {
              console.log('[PerpFarming] No order book data found in message')
              return
            }
            
            console.log('[PerpFarming] Extracted order book data:', orderBookData)

            let reasoning = orderBookData.reasoning?.join(' ') || 'Analyzing order flow...'
            
            const cvdInfo = `CVD: ${orderBookData.cvd_slope || 'N/A'}`
            const obiInfo = `OBI: ${orderBookData.obi?.toFixed(2) || 'N/A'}`
            reasoning = `${reasoning} | ${cvdInfo} | ${obiInfo}`
            
            if (orderBookData.spoof_detection?.wall_velocity === 'high') {
              reasoning = `⚠️ SPOOF ALERT (${orderBookData.spoof_detection.recent_spoofs} recent) | ${reasoning}`
            }
            
            updateBotMessage(orderBookData.symbol, reasoning)

            // Check if position exists
            const status = orderManager.getStatus()
            const hasActivePosition = status.activePositions && status.activePositions.length > 0
            const currentPosition = hasActivePosition ? status.activePositions[0] : null
            
            console.log('[PerpFarming] Order Book position check:', {
              hasActivePosition,
              currentSide: currentPosition?.side,
              newSide: orderBookData.side,
              confidence: orderBookData.confidence,
              bias_score: orderBookData.bias_score,
              spoof_velocity: orderBookData.spoof_detection?.wall_velocity,
              activePositions: status.activePositions
            })

            // === ORDER BOOK STRATEGY: STAY IN UNTIL REVERSAL ===
            
            // If no position, check if we should enter
            if (!hasActivePosition) {
              // Skip NEUTRAL signals for entry
              if (orderBookData.side === 'NEUTRAL') {
                console.log('[PerpFarming] NEUTRAL signal, no entry')
                return
              }
              
              // Check if spoofing is detected - be more cautious on entry
              const isSpoofing = orderBookData.spoof_detection?.wall_velocity === 'high'
              
              if (isSpoofing) {
                // During spoofing, only allow HIGH confidence entries
                if (orderBookData.confidence === 'high') {
                  console.log(`[PerpFarming] ⚠️ SPOOF ALERT (${orderBookData.spoof_detection.recent_spoofs} recent) but HIGH confidence - allowing entry`)
                } else {
                  console.log(`[PerpFarming] 🚫 BLOCKED: SPOOF ALERT (${orderBookData.spoof_detection.recent_spoofs} recent) + ${orderBookData.confidence} confidence - skipping entry`)
                  return
                }
              }
              
              // Check confidence (respect trustLowConfidence setting)
              const shouldTrade = orderBookData.confidence === 'high' || 
                                  orderBookData.confidence === 'medium' || 
                                  (orderBookData.confidence === 'low' && settings.trustLowConfidence)
              
              if (shouldTrade) {
                console.log(`[PerpFarming] 📊 Opening ${orderBookData.confidence.toUpperCase()} confidence ${orderBookData.side} order book position (Bias: ${orderBookData.bias_score?.toFixed(2)})`)
                
                if (typeof orderManager.handleOrderBookSignal === 'function') {
                  await orderManager.handleOrderBookSignal(orderBookData)
                  console.log('[PerpFarming] ✅ Order book trade placement attempted')
                } else {
                  console.error('[PerpFarming] handleOrderBookSignal is not a function!')
                }
              } else {
                console.log(`[PerpFarming] ⏭️ Skipping order book signal - low confidence (${orderBookData.confidence})`)
              }
            } 
            // If position exists FOR THIS SYMBOL, check for reversal or Smart Mode exit
            else {
              const symbol = orderBookData.symbol
              
              // Calculate PNL for THIS SYMBOL specifically (for multi-pair portfolio mode)
              let symbolNetPnl = 0
              try {
                const symbolPosition = await orderManager.dexService.getPosition(symbol)
                const unrealizedProfit = parseFloat(symbolPosition.unRealizedProfit || '0')
                const entryPrice = parseFloat(symbolPosition.entryPrice || '0')
                const positionAmt = Math.abs(parseFloat(symbolPosition.positionAmt || '0'))
                const markPrice = parseFloat(symbolPosition.markPrice || '0')
                
                // Calculate fees for this symbol
                const entryNotional = positionAmt * entryPrice
                const exitNotional = positionAmt * markPrice
                const entryFee = entryNotional * ENTRY_FEE
                const exitFee = exitNotional * EXIT_FEE
                const totalFees = entryFee + exitFee
                
                symbolNetPnl = unrealizedProfit - totalFees
                console.log(`[Portfolio] ${symbol} Net PNL: $${symbolNetPnl.toFixed(2)} (Gross: $${unrealizedProfit.toFixed(2)}, Fees: $${totalFees.toFixed(2)})`)
              } catch (error) {
                console.error(`[Portfolio] Failed to get PNL for ${symbol}:`, error)
                symbolNetPnl = lastPnlRef.current || 0 // Fallback to total PNL
              }
              
              // First check Smart Mode exit conditions
              if (settings.smartMode) {
                const minPnl = parseFloat(settings.smartModeMinPnl) || -50
                
                // Check if position was just opened (grace period of 60 seconds)
                const position = orderManager.activePositions.get(symbol)
                const positionAge = position ? (Date.now() - position.filledAt) / 1000 : 999
                const gracePeriod = 60 // seconds
                
                if (positionAge < gracePeriod) {
                  console.log(`[Portfolio] ${symbol} is only ${positionAge.toFixed(0)}s old - grace period (${gracePeriod}s) - skipping Smart Mode exit`)
                } else if (symbolNetPnl >= minPnl) {
                  const exitDecision = checkSmartExit(symbol, {
                    side: orderBookData.side,
                    confidence: orderBookData.confidence
                  }, symbolNetPnl, { isAutoMode: settings.autoMode })

                  if (exitDecision.shouldExit) {
                    console.log(`[PerpFarming] 🧠 Smart Mode EXIT: ${exitDecision.reason}`)
                    console.log(`[PerpFarming] 🧠 Details:`, exitDecision.details)
                    
                    const exitMessage = `[${symbol}] ${exitDecision.statement}`
                    setBotMessage(exitMessage)
                    if (onBotMessageChange) onBotMessageChange(exitMessage)
                    
                    await closePosition(orderManager, symbol, symbolNetPnl)
                    
                    // Remove from portfolio tracking if in Auto Mode
                    if (settings.autoMode) {
                      setPortfolioPositions(prev => prev.filter(p => p.symbol !== symbol))
                      setPortfolioSubscriptions(prev => {
                        const newSet = new Set(prev)
                        newSet.delete(symbol)
                        return newSet
                      })
                    }
                    
                    return
                  }
                }
              }
              
              // Check for REVERSAL signal (opposite direction)
              const isReversal = (currentPosition.side === 'LONG' && orderBookData.side === 'SHORT') ||
                                (currentPosition.side === 'SHORT' && orderBookData.side === 'LONG')
              
              if (isReversal) {
                // Check if position was just opened (grace period)
                const position = orderManager.activePositions.get(symbol)
                const positionAge = position ? (Date.now() - position.filledAt) / 1000 : 999
                const reversalGracePeriod = 30 // seconds - shorter grace for reversals
                
                if (positionAge < reversalGracePeriod) {
                  console.log(`[Portfolio] ${symbol} is only ${positionAge.toFixed(0)}s old - grace period (${reversalGracePeriod}s) - skipping reversal`)
                  return
                }
                
                // Check if spoofing is detected - be more cautious
                const isSpoofing = orderBookData.spoof_detection?.wall_velocity === 'high'
                
                if (isSpoofing) {
                  // Only reverse on high confidence during spoofing
                  if (orderBookData.confidence === 'high') {
                    console.log('[PerpFarming] 🔄 HIGH CONFIDENCE REVERSAL during spoofing - reversing position')
                    await closePosition(orderManager, symbol, symbolNetPnl)
                    
                    // Update portfolio tracking if in Auto Mode (changing side)
                    if (settings.autoMode) {
                      setPortfolioPositions(prev => prev.map(p => 
                        p.symbol === symbol ? { ...p, side: orderBookData.side, confidence: orderBookData.confidence } : p
                      ))
                    }
                    
                    // Open new position in opposite direction
                    if (typeof orderManager.handleOrderBookSignal === 'function') {
                      await orderManager.handleOrderBookSignal(orderBookData)
                    }
                  } else {
                    console.log(`[PerpFarming] ⚠️ Reversal signal but spoofing detected (${orderBookData.spoof_detection.recent_spoofs} spoofs) + confidence ${orderBookData.confidence} - holding position`)
                  }
                } else {
                  // No spoofing - reverse on high or medium confidence
                  const shouldReverse = orderBookData.confidence === 'high' || 
                                       orderBookData.confidence === 'medium'
                  
                  if (shouldReverse) {
                    console.log(`[PerpFarming] 🔄 ${orderBookData.confidence.toUpperCase()} CONFIDENCE REVERSAL - reversing position`)
                    await closePosition(orderManager, symbol, symbolNetPnl)
                    
                    // Update portfolio tracking if in Auto Mode (changing side)
                    if (settings.autoMode) {
                      setPortfolioPositions(prev => prev.map(p => 
                        p.symbol === symbol ? { ...p, side: orderBookData.side, confidence: orderBookData.confidence } : p
                      ))
                    }
                    
                    // Open new position in opposite direction
                    if (typeof orderManager.handleOrderBookSignal === 'function') {
                      await orderManager.handleOrderBookSignal(orderBookData)
                    }
                  } else {
                    console.log(`[PerpFarming] ⏭️ Reversal signal but low confidence - holding position`)
                  }
                }
              } else if (orderBookData.side === 'NEUTRAL') {
                // NEUTRAL = STAY IN (this is the key difference from other strategies)
                console.log('[PerpFarming] 📊 NEUTRAL signal - STAYING IN position (order book strategy behavior)')
              } else {
                // Same direction signal = stay in
                console.log(`[PerpFarming] 📊 Confirming ${orderBookData.side} position - staying in`)
              }
            }
          } catch (error) {
            handleError(`Failed to handle order book signal: ${error.message}`)
          }
        }
        
        // === AUTO MODE (PORTFOLIO SCANNER V2) HANDLERS ===
        
        // Handle portfolio picks - Top 3 opportunities using 4H swing structure
        wsClient.onPortfolioPicks = async (message) => {
          try {
            if (!settings.autoMode) return // Only process if Auto Mode enabled
            
            console.log('[PerpFarming] 🎯 Received portfolio picks (V2):', message)
            
            const picksData = message?.data || message
            if (!picksData || (!picksData.top_longs && !picksData.top_shorts)) {
              console.log('[PerpFarming] No picks data found (expected top_longs/top_shorts)')
              return
            }
            
            const { top_longs = [], top_shorts = [], invalidated = [], monitoring = 0 } = picksData
            
            console.log(`[Portfolio V2] ${top_longs.length} longs | ${top_shorts.length} shorts | ${invalidated.length} invalidated | ${monitoring} pairs monitored`)
            
            // Handle invalidated symbols - CLOSE IMMEDIATELY
            if (invalidated.length > 0) {
              console.log(`[Portfolio V2] 🚨 INVALIDATED (structure break): ${invalidated.join(', ')}`)
              
              for (const symbol of invalidated) {
                const existingPos = portfolioPositions.find(p => p.symbol === symbol)
                if (existingPos) {
                  console.log(`[Portfolio V2] Closing ${symbol} - trend invalidated`)
                  
                  // Get PNL for this symbol
                  let symbolNetPnl = 0
                  try {
                    const symbolPosition = await orderManager.dexService.getPosition(symbol)
                    const unrealizedProfit = parseFloat(symbolPosition.unRealizedProfit || '0')
                    const entryPrice = parseFloat(symbolPosition.entryPrice || '0')
                    const positionAmt = Math.abs(parseFloat(symbolPosition.positionAmt || '0'))
                    const markPrice = parseFloat(symbolPosition.markPrice || '0')
                    
                    const entryNotional = positionAmt * entryPrice
                    const exitNotional = positionAmt * markPrice
                    const totalFees = (entryNotional * ENTRY_FEE) + (exitNotional * EXIT_FEE)
                    symbolNetPnl = unrealizedProfit - totalFees
                  } catch (error) {
                    console.error(`[Portfolio V2] Failed to get PNL for ${symbol}:`, error)
                  }
                  
                  await closePosition(orderManager, symbol, symbolNetPnl)
                  
                  // Remove from portfolio tracking
                  setPortfolioPositions(prev => prev.filter(p => p.symbol !== symbol))
                }
              }
            }
            
            // Combine and filter picks (score >= 70 AND not excluded)
            const allPicksBeforeExclusion = [
              ...top_longs.map(p => ({ ...p, side: 'LONG' })),
              ...top_shorts.map(p => ({ ...p, side: 'SHORT' }))
            ].filter(p => p.score >= 70)
            
            const excludedList = settings.excludedPairs || []
            const allPicks = allPicksBeforeExclusion.filter(p => !excludedList.includes(p.symbol))
            
            if (excludedList.length > 0) {
              const excluded = allPicksBeforeExclusion.filter(p => excludedList.includes(p.symbol))
              if (excluded.length > 0) {
                console.log(`[Portfolio V2] 🚫 Excluded ${excluded.length} pair(s):`, excluded.map(p => p.symbol).join(', '))
              }
            }
            
            console.log(`[Portfolio V2] ${allPicks.length} picks with score >= 70 (after exclusions)`)
            allPicks.forEach(p => {
              console.log(`[Portfolio V2]   ${p.symbol} ${p.side}: score=${p.score}, state=${p.state}`)
            })
            
            // ADAPTIVE ALLOCATION BASED ON BTC MARKET BIAS
            // Get BTC bias from any pick (all picks share same BTC state)
            const btcBias = allPicks[0]?.market_bias || 'BTC_NEUTRAL'
            const btcScore = allPicks[0]?.btc_score || 0
            
            console.log(`[Portfolio V2] 🔍 BTC Market Bias: ${btcBias} (score: ${btcScore})`)
            
            // AGGRESSIVE REVERSAL CHECK: Check actual 4H candles to detect dumps server missed
            let btcHourlyChange = 0
            let btc3HourChange = 0
            let btc8HourChange = 0
            let biasOverride = false
            let actualBtcTrend = btcBias // Default to server's bias
            
            try {
              // Fetch last 3 4H candles to see what BTC is REALLY doing (12 hours of data)
              const response4H = await fetch(
                'https://fapi.asterdex.com/fapi/v1/klines?symbol=BTCUSDT&interval=4h&limit=3'
              )
              
              if (response4H.ok) {
                const klines4H = await response4H.json()
                
                if (klines4H && klines4H.length === 3) {
                  // Kline format: [openTime, open, high, low, close, volume, closeTime, ...]
                  const price8HoursAgo = parseFloat(klines4H[0][4])   // 2 candles ago
                  const price4HoursAgo = parseFloat(klines4H[1][4])   // 1 candle ago
                  const currentPrice = parseFloat(klines4H[2][4])     // Current candle
                  
                  // Calculate 4H and 8H changes
                  const btc4HourChange = ((currentPrice - price4HoursAgo) / price4HoursAgo) * 100
                  btc8HourChange = ((currentPrice - price8HoursAgo) / price8HoursAgo) * 100
                  
                  console.log(`[Portfolio V2] 📊 BTC REAL-TIME 4H Candle Check:`)
                  console.log(`[Portfolio V2]   Last 4H: ${btc4HourChange.toFixed(2)}% ($${price4HoursAgo.toFixed(0)} → $${currentPrice.toFixed(0)})`)
                  console.log(`[Portfolio V2]   Last 8H: ${btc8HourChange.toFixed(2)}% ($${price8HoursAgo.toFixed(0)} → $${currentPrice.toFixed(0)})`)
                  
                  // OVERRIDE SERVER BIAS if recent 4H price action is strongly opposite
                  if (btcBias === 'BTC_BULLISH' && btc8HourChange < -2.0) {
                    console.warn(`[Portfolio V2] 🚨 IGNORING SERVER BIAS! Server says BULLISH but BTC dumped ${Math.abs(btc8HourChange).toFixed(2)}% in last 8H`)
                    console.warn(`[Portfolio V2] 🚨 Server's 4H structure is LAGGING - switching to BEARISH allocation`)
                    actualBtcTrend = 'BTC_BEARISH'
                    biasOverride = true
                  } else if (btcBias === 'BTC_BEARISH' && btc8HourChange > 2.0) {
                    console.warn(`[Portfolio V2] 🚨 IGNORING SERVER BIAS! Server says BEARISH but BTC pumped ${btc8HourChange.toFixed(2)}% in last 8H`)
                    console.warn(`[Portfolio V2] 🚨 Server's 4H structure is LAGGING - switching to BULLISH allocation`)
                    actualBtcTrend = 'BTC_BULLISH'
                    biasOverride = true
                  } else if (btcBias === 'BTC_BULLISH' && btc4HourChange < -1.5) {
                    console.warn(`[Portfolio V2] ⚠️ BIAS CONFLICT: Server says BULLISH but last 4H candle dumped ${Math.abs(btc4HourChange).toFixed(2)}%`)
                    console.warn(`[Portfolio V2] ⚠️ Switching to defensive shorts (1L+2S)`)
                    biasOverride = true
                    actualBtcTrend = 'BTC_BEARISH'
                  } else if (btcBias === 'BTC_BEARISH' && btc4HourChange > 1.5) {
                    console.warn(`[Portfolio V2] ⚠️ BIAS CONFLICT: Server says BEARISH but last 4H candle pumped ${btc4HourChange.toFixed(2)}%`)
                    console.warn(`[Portfolio V2] ⚠️ Switching to defensive longs (2L+1S)`)
                    biasOverride = true
                    actualBtcTrend = 'BTC_BULLISH'
                  }
                  
                  if (!biasOverride) {
                    console.log(`[Portfolio V2] ✅ Server's 4H bias confirmed by recent price action`)
                  }
                }
              }
              
              // Also check 1H for responsiveness (quick moves)
              const response1H = await fetch(
                'https://fapi.asterdex.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=4'
              )
              
              if (response1H.ok) {
                const klines1H = await response1H.json()
                
                if (klines1H && klines1H.length === 4) {
                  const price3HoursAgo = parseFloat(klines1H[0][4])
                  const price1HourAgo = parseFloat(klines1H[2][4])
                  const currentPrice = parseFloat(klines1H[3][4])
                  
                  btcHourlyChange = ((currentPrice - price1HourAgo) / price1HourAgo) * 100
                  btc3HourChange = ((currentPrice - price3HoursAgo) / price3HoursAgo) * 100
                  
                  console.log(`[Portfolio V2]   Last 3H: ${btc3HourChange.toFixed(2)}%`)
                  console.log(`[Portfolio V2]   Last 1H: ${btcHourlyChange.toFixed(2)}%`)
                }
              }
            } catch (error) {
              console.error(`[Portfolio V2] Failed to fetch BTC price data:`, error.message)
              // Continue with original bias if fetch fails
            }
            
            // Sort picks by score
            const sortedLongs = allPicks.filter(p => p.side === 'LONG').sort((a, b) => b.score - a.score)
            const sortedShorts = allPicks.filter(p => p.side === 'SHORT').sort((a, b) => b.score - a.score)
            
            let selectedPicks = []
            
            // Use actualBtcTrend for allocation (may be overridden from server's bias)
            const modeLabel = biasOverride ? `🚨 OVERRIDE (Server: ${btcBias})` : ''
            
            if (actualBtcTrend === 'BTC_BULLISH') {
              // BTC BULLISH: 2 LONGs + 1 SHORT (2/3 long bias)
              console.log(`[Portfolio V2] 📈 BTC Bullish ${modeLabel} - Allocating 2 LONGs + 1 SHORT`)
              
              const longsToAdd = sortedLongs.slice(0, 2)
              const shortsToAdd = sortedShorts.slice(0, 1)
              
              selectedPicks = [...longsToAdd, ...shortsToAdd]
              
              console.log(`[Portfolio V2]   LONGs: ${longsToAdd.map(p => `${p.symbol}(${p.score})`).join(', ')}`)
              console.log(`[Portfolio V2]   SHORT: ${shortsToAdd.map(p => `${p.symbol}(${p.score})`).join(', ')}`)
              
            } else if (actualBtcTrend === 'BTC_BEARISH') {
              // BTC BEARISH: 1 LONG + 2 SHORTs (2/3 short bias)
              console.log(`[Portfolio V2] 📉 BTC Bearish ${modeLabel} - Allocating 1 LONG + 2 SHORTs`)
              
              const longsToAdd = sortedLongs.slice(0, 1)
              const shortsToAdd = sortedShorts.slice(0, 2)
              
              selectedPicks = [...longsToAdd, ...shortsToAdd]
              
              console.log(`[Portfolio V2]   LONG: ${longsToAdd.map(p => `${p.symbol}(${p.score})`).join(', ')}`)
              console.log(`[Portfolio V2]   SHORTs: ${shortsToAdd.map(p => `${p.symbol}(${p.score})`).join(', ')}`)
              
            } else {
              // BTC NEUTRAL: Randomize or balanced allocation
              console.log(`[Portfolio V2] ⚖️ BTC Neutral - Balanced allocation`)
              
              // Random choice: 2L+1S or 1L+2S
              const favorLongs = Math.random() > 0.5
              
              if (favorLongs) {
                console.log(`[Portfolio V2]   Random: 2 LONGs + 1 SHORT`)
                selectedPicks = [...sortedLongs.slice(0, 2), ...sortedShorts.slice(0, 1)]
              } else {
                console.log(`[Portfolio V2]   Random: 1 LONG + 2 SHORTs`)
                selectedPicks = [...sortedLongs.slice(0, 1), ...sortedShorts.slice(0, 2)]
              }
            }
            
            // Fallback: if we don't have enough picks in one direction, fill with best available
            if (selectedPicks.length < 3) {
              console.log(`[Portfolio V2] ⚠️ Insufficient picks for BTC bias allocation (${selectedPicks.length}/3)`)
              const used = new Set(selectedPicks.map(p => p.symbol))
              const remaining = allPicks
                .filter(p => !used.has(p.symbol))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3 - selectedPicks.length)
              
              selectedPicks = [...selectedPicks, ...remaining]
              console.log(`[Portfolio V2] Added ${remaining.length} fill picks: ${remaining.map(p => `${p.symbol} ${p.side}(${p.score})`).join(', ')}`)
            }
            
            console.log(`[Portfolio V2] Selected ${selectedPicks.length} picks:`, selectedPicks.map(p => `${p.symbol} ${p.side} (${p.score})`))
            
            // Update bot message with BTC bias allocation
            const longsCount = selectedPicks.filter(p => p.side === 'LONG').length
            const shortsCount = selectedPicks.filter(p => p.side === 'SHORT').length
            let biasMessage = ''
            
            if (biasOverride) {
              // Show we overrode the server's bias
              if (actualBtcTrend === 'BTC_BEARISH') {
                biasMessage = `🚨 OVERRIDE (Server: Bullish | 8H ${btc8HourChange.toFixed(2)}%) - SHORTS (${longsCount}L/${shortsCount}S)`
              } else if (actualBtcTrend === 'BTC_BULLISH') {
                biasMessage = `🚨 OVERRIDE (Server: Bearish | 8H ${btc8HourChange.toFixed(2)}%) - LONGS (${longsCount}L/${shortsCount}S)`
              }
            } else if (actualBtcTrend === 'BTC_BULLISH') {
              biasMessage = `📈 BTC Bullish (8H ${btc8HourChange.toFixed(2)}%) - Longs (${longsCount}L/${shortsCount}S)`
            } else if (actualBtcTrend === 'BTC_BEARISH') {
              biasMessage = `📉 BTC Bearish (8H ${btc8HourChange.toFixed(2)}%) - Shorts (${longsCount}L/${shortsCount}S)`
            } else {
              biasMessage = `⚖️ BTC Neutral - Balanced (${longsCount}L/${shortsCount}S)`
            }
            
            const picksSummary = selectedPicks.map(p => `${p.symbol} ${p.side}(${p.score})`).join(', ')
            const botStatusMessage = `Auto Mode: ${biasMessage} | Picks: ${picksSummary}`
            setBotMessage(botStatusMessage)
            if (onBotMessageChange) onBotMessageChange(botStatusMessage)
            
            if (selectedPicks.length === 0) {
              console.log('[Portfolio V2] ⚠️ No viable picks (all below score threshold)')
              return
            }
            
            // Count current open positions AND pending orders
            const status = orderManager.getStatus()
            const currentPositionCount = status.activePositions ? status.activePositions.length : 0
            const currentOrderCount = status.activeOrders ? status.activeOrders.length : 0
            const currentTotalActive = currentPositionCount + currentOrderCount
            
            console.log(`[Portfolio V2] Current active: ${currentTotalActive}/3 (${currentPositionCount} positions + ${currentOrderCount} pending orders)`)
            
            // Calculate how many new positions we can open (max 3 total including pending orders)
            const roomForNewPositions = Math.max(0, 3 - currentTotalActive)
            
            if (roomForNewPositions === 0) {
              console.log('[Portfolio V2] Already have 3 active (positions + orders) - no room for new entries')
              console.log('[Portfolio V2] Active positions:', status.activePositions?.map(p => p.symbol))
              console.log('[Portfolio V2] Pending orders:', status.activeOrders?.map(o => o.symbol))
              return
            }
            
            const capitalNum = parseFloat(settings.capital)
            const newPicksToOpen = selectedPicks.slice(0, roomForNewPositions)
            const capitalPerPosition = capitalNum / 3
            
            console.log(`[Portfolio V2] Capital: $${capitalNum} / 3 positions = $${capitalPerPosition.toFixed(2)} per position`)
            console.log(`[Portfolio V2] Will open ${newPicksToOpen.length} new position(s) with $${capitalPerPosition.toFixed(2)} each`)
            
            const newPositions = []
            
            for (const pick of newPicksToOpen) {
              try {
                const existingPos = portfolioPositions.find(p => p.symbol === pick.symbol)
                
                if (existingPos) {
                  console.log(`[Portfolio V2] ${pick.symbol} position already exists - skipping`)
                  newPositions.push(existingPos)
                  continue
                }
                
                const currentTotal = currentTotalActive + newPositions.length
                if (currentTotal >= 3) {
                  console.log(`[Portfolio V2] 🚫 Reached max 3 active - stopping at ${pick.symbol}`)
                  break
                }
                
                const [entryLow, entryHigh] = pick.entry_zone
                const invalidationPrice = pick.invalidation_price
                const stopLoss = pick.structure?.last_swing_low || pick.structure?.last_swing_high
                
                console.log(`[Portfolio V2] Opening ${pick.symbol} ${pick.side} (score: ${pick.score})`)
                console.log(`[Portfolio V2]   Entry Zone: $${entryLow} - $${entryHigh}`)
                console.log(`[Portfolio V2]   Invalidation: $${invalidationPrice}`)
                console.log(`[Portfolio V2]   Structure SL: $${stopLoss}`)
                console.log(`[Portfolio V2]   User TP/SL: ${settings.tpSlMode === 'dollar' ? '$' : ''}${settings.takeProfit} / ${settings.tpSlMode === 'dollar' ? '$' : ''}${settings.stopLoss}`)
                
                // Set leverage
                let leverage = Math.min(parseInt(settings.leverage), 125)
                const minLeverage = 1
                let orderResults = []
                
                while (leverage >= minLeverage && orderResults.length === 0) {
                  try {
                    console.log(`[Portfolio V2] Setting ${leverage}x leverage for ${pick.symbol}...`)
                    await orderManager.dexService.setLeverage(pick.symbol, leverage)
                    
                    // Calculate total quantity for this position
                    const marginToUse = capitalPerPosition
                    const notionalValue = marginToUse * leverage
                    
                    // Safety check
                    const maxAllowedMargin = capitalNum / 3
                    if (marginToUse > maxAllowedMargin * 1.01) {
                      throw new Error(`🚨 SAFETY CHECK FAILED: Margin $${marginToUse.toFixed(2)} > Max $${maxAllowedMargin.toFixed(2)}`)
                    }
                    
                    console.log(`[Portfolio V2] 🔒 Safety check: Margin $${marginToUse.toFixed(2)} <= Max $${maxAllowedMargin.toFixed(2)} ✓`)
                    console.log(`[Portfolio V2] Margin: $${marginToUse.toFixed(2)} @ ${leverage}x = Notional: $${notionalValue.toFixed(2)}`)
                    
                    // SPLIT ORDER ENTRY
                    // For LONG: 20% at entryHigh (fills first), 80% at entryLow (better price)
                    // For SHORT: 20% at entryLow (fills first), 80% at entryHigh (better price)
                    
                    const price1 = pick.side === 'LONG' ? entryHigh : entryLow
                    const price2 = pick.side === 'LONG' ? entryLow : entryHigh
                    
                    const qty1 = (notionalValue * 0.2) / price1
                    const qty2 = (notionalValue * 0.8) / price2
                    
                    console.log(`[Portfolio V2] Split orders:`)
                    console.log(`[Portfolio V2]   Order 1: 20% (${qty1.toFixed(4)}) @ $${price1} (fills first)`)
                    console.log(`[Portfolio V2]   Order 2: 80% (${qty2.toFixed(4)}) @ $${price2} (better price)`)
                    
                    // Place Order 1 (20% - immediate entry)
                    const result1 = await orderManager.dexService.placeOrder({
                      symbol: pick.symbol,
                      side: pick.side === 'LONG' ? 'BUY' : 'SELL',
                      type: 'LIMIT',
                      price: price1,
                      quantity: qty1,
                      timeInForce: 'GTC',
                      newClientOrderId: `hopium_v2_20_${Date.now()}`
                    })
                    
                    console.log(`[Portfolio V2] ✅ Order 1 placed: ${result1.orderId}`)
                    orderResults.push(result1)
                    
                    // Place Order 2 (80% - better price)
                    const result2 = await orderManager.dexService.placeOrder({
                      symbol: pick.symbol,
                      side: pick.side === 'LONG' ? 'BUY' : 'SELL',
                      type: 'LIMIT',
                      price: price2,
                      quantity: qty2,
                      timeInForce: 'GTC',
                      newClientOrderId: `hopium_v2_80_${Date.now()}`
                    })
                    
                    console.log(`[Portfolio V2] ✅ Order 2 placed: ${result2.orderId}`)
                    orderResults.push(result2)
                    
                    console.log(`[Portfolio V2] ✅ Both orders placed successfully with ${leverage}x leverage`)
                    break
                    
                  } catch (error) {
                    console.log(`[Portfolio V2] Failed with ${leverage}x leverage: ${error.message}`)
                    
                    // Case-insensitive check for leverage/margin/balance errors
                    const errorMsg = error.message.toLowerCase()
                    if (errorMsg.includes('leverage') || 
                        errorMsg.includes('notional') || 
                        errorMsg.includes('margin') ||
                        errorMsg.includes('balance')) {
                      leverage = Math.max(1, Math.floor(leverage / 2))
                      console.log(`[Portfolio V2] Retrying with ${leverage}x leverage...`)
                    } else {
                      throw error
                    }
                  }
                }
                
                if (orderResults.length === 0) {
                  throw new Error(`Could not place orders for ${pick.symbol} even at ${minLeverage}x leverage`)
                }
                
                // Track both orders in orderManager
                // NOTE: Auto Mode uses 4H swing trades, so orders need longer timeout
                // The 80% order is meant to catch pullbacks that may take hours/days
                for (const result of orderResults) {
                  orderManager.activeOrders.set(result.orderId, {
                    orderId: result.orderId,
                    symbol: pick.symbol,
                    side: pick.side,
                    entryPrice: parseFloat(result.price),
                    quantity: parseFloat(result.executedQty || result.origQty),
                    status: result.status,
                    takeProfit: parseFloat(settings.takeProfit),
                    stopLoss: parseFloat(settings.stopLoss),
                    createdAt: Date.now(),
                    entryConfidence: 'high',
                    noTimeout: true  // Don't auto-cancel swing trade orders
                  })
                  console.log(`[Portfolio V2] Tracking order ${result.orderId} (no timeout - swing trade)`)
                }
                
                const newPos = {
                  symbol: pick.symbol,
                  side: pick.side,
                  score: pick.score,
                  state: pick.state,
                  entryZone: pick.entry_zone,
                  invalidationPrice: invalidationPrice,  // SAVE FOR LOCAL CHECKS
                  structureStopLoss: stopLoss,
                  size: capitalPerPosition,
                  leverage: leverage,
                  orderIds: orderResults.map(r => r.orderId),
                  openedAt: Date.now(),
                  // Intelligent TP Trailing (Auto Mode)
                  serverTP: pick.take_profit,  // Server's structure-based TP
                  tpHit: false,  // Becomes true when price reaches TP
                  tpHitPrice: null,  // Price when TP first hit
                  tpHitPnl: null,  // Net PNL when TP first hit
                  trailingIncrement: null,  // Set when TP hit (price % from entry to TP)
                  currentSL: null,  // Set to TP price when hit, then trails upward
                  isTrailing: false  // Becomes true after TP hit
                }
                
                newPositions.push(newPos)
                
                // Update bot message with reasoning for this position
                const reasoning = pick.reasoning?.join(' ') || `${pick.side} ${pick.symbol} @ ${pick.score}/100`
                updateBotMessage(pick.symbol, reasoning)
                
                console.log(`[Portfolio V2] ✅ Opened ${pick.symbol} position with split orders`)
              } catch (error) {
                console.error(`[Portfolio V2] Failed to open ${pick.symbol}:`, error.message)
                handleError(`Failed to open ${pick.symbol}: ${error.message}`)
              }
            }
            
            setPortfolioPositions(prev => {
              // Merge with existing positions
              const merged = [...prev]
              for (const newPos of newPositions) {
                if (!merged.find(p => p.symbol === newPos.symbol)) {
                  merged.push(newPos)
                }
              }
              return merged
            })
            
            // Update bot messages and TP data for ALL portfolio positions (new + existing)
            // Check FULL list (top_longs + top_shorts), not just selected 3
            const allSignals = [
              ...top_longs.map(p => ({ ...p, side: 'LONG' })),
              ...top_shorts.map(p => ({ ...p, side: 'SHORT' }))
            ]
            
            // Update messages and TP targets for all positions we're holding
            const allActiveSymbols = [...portfolioPositions.map(p => p.symbol), ...newPositions.map(p => p.symbol)]
            for (const symbol of allActiveSymbols) {
              const signal = allSignals.find(s => s.symbol === symbol)
              
              if (signal) {
                // Update serverTP if not already set (for resumed positions)
                setPortfolioPositions(prev => prev.map(p => 
                  p.symbol === symbol && !p.serverTP
                    ? { ...p, serverTP: signal.take_profit, invalidationPrice: signal.invalidation_price }
                    : p
                ))
                
                // Update message (unless already trailing)
                const existingPos = portfolioPositions.find(p => p.symbol === symbol)
                if (!existingPos?.isTrailing) {
                  const reasoning = signal.reasoning?.join(' ') || `${signal.side} ${symbol} @ ${signal.score}/100`
                  updateBotMessage(symbol, reasoning)
                  console.log(`[Portfolio V2] Updated message for ${symbol}: score=${signal.score}, state=${signal.state}`)
                }
              } else {
                // Position held but no longer in scanner results (dropped below threshold?)
                console.log(`[Portfolio V2] ⚠️ ${symbol} position held but not in scanner results - using fallback message`)
                const existingPos = portfolioPositions.find(p => p.symbol === symbol)
                if (!existingPos?.isTrailing) {
                  updateBotMessage(symbol, `Holding ${existingPos?.side || 'position'} - monitoring for invalidation`)
                }
              }
            }
            
            setTradingSymbols(prev => {
              const symbols = [...new Set([...prev, ...newPositions.map(p => p.symbol)])]
              return symbols
            })
            
          } catch (error) {
            handleError(`Failed to handle portfolio picks: ${error.message}`)
          }
        }
        
        // Handle full signal status responses (every 5 minutes)
        wsClient.onSignalStatus = async (message) => {
          try {
            if (!settings.autoMode) {
              console.log('[Signal Status] Skipping - Auto Mode not enabled')
              return
            }
            
            console.log('[Signal Status] Received message:', message)
            console.log('[Signal Status] Message type:', typeof message, 'Keys:', Object.keys(message))
            
            // WebSocket client already extracts payload, so message IS the signal data
            const signal = message
            const symbol = signal.symbol
            
            // Check if signal was not found (symbol dropped out of all trends)
            if (signal.status === 'NOT_FOUND') {
              console.log(`[Signal Status] ⚠️ ${symbol} - No trend detected (dropped out of scanner)`)
              
              const existingPos = portfolioPositions.find(p => p.symbol === symbol)
              if (existingPos) {
                updateBotMessage(symbol, `⚠️ Trend lost - holding position, monitoring for exit`)
              }
              return
            }
            
            const { state, score, reasoning, invalidation_price, take_profit, side } = signal
            
            // Check for INVALIDATED state
            if (state === 'INVALIDATED') {
              console.log(`[Signal Status] 🚨 ${symbol} INVALIDATED (structure broke)`)
              
              const existingPos = portfolioPositions.find(p => p.symbol === symbol)
              if (existingPos) {
                // Get PNL for this symbol
                let symbolNetPnl = 0
                try {
                  const symbolPosition = await orderManager.dexService.getPosition(symbol)
                  const unrealizedProfit = parseFloat(symbolPosition.unRealizedProfit || '0')
                  const entryPrice = parseFloat(symbolPosition.entryPrice || '0')
                  const positionAmt = Math.abs(parseFloat(symbolPosition.positionAmt || '0'))
                  const markPrice = parseFloat(symbolPosition.markPrice || '0')
                  
                  const entryNotional = positionAmt * entryPrice
                  const exitNotional = positionAmt * markPrice
                  const totalFees = (entryNotional * ENTRY_FEE) + (exitNotional * EXIT_FEE)
                  symbolNetPnl = unrealizedProfit - totalFees
                } catch (error) {
                  console.error(`[Signal Status] Failed to get PNL for ${symbol}:`, error)
                }
                
                await closePosition(orderManager, symbol, symbolNetPnl)
                setPortfolioPositions(prev => prev.filter(p => p.symbol !== symbol))
              }
              return
            }
            
            // Update bot message with fresh reasoning (unless already trailing)
            const existingPos = portfolioPositions.find(p => p.symbol === symbol)
            if (!existingPos?.isTrailing) {
              const reasoningText = reasoning?.join(' ') || `${side} ${symbol} @ ${score}/100 | State: ${state}`
              updateBotMessage(symbol, reasoningText)
            }
            
            // Update portfolio position data (preserve trailing state if already active)
            setPortfolioPositions(prev => prev.map(p => {
              if (p.symbol === symbol) {
                return {
                  ...p,
                  invalidationPrice: invalidation_price,
                  score: score,
                  state: state,
                  serverTP: take_profit || p.serverTP,  // Update TP (preserve if already set)
                  // Preserve trailing state - don't reset if already trailing
                  tpHit: p.tpHit,
                  tpHitPrice: p.tpHitPrice,
                  tpHitPnl: p.tpHitPnl,
                  trailingIncrement: p.trailingIncrement,
                  currentSL: p.currentSL,
                  isTrailing: p.isTrailing
                }
              }
              return p
            }))
            
            console.log(`[Signal Status] ✅ ${symbol} updated: score=${score}, state=${state}, serverTP=${take_profit || 'unchanged'}`)
          } catch (error) {
            handleError(`Failed to handle signal status: ${error.message}`)
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
        // Auto Mode receives portfolio_picks broadcasts automatically
        if (!settings.autoMode) {
          // Subscribe to all selected pairs with manual strategy
          for (const symbol of tradingPairs) {
            wsClient.subscribe(symbol, settings.strategy)
            console.log(`[PerpFarming] Subscribing to ${symbol} with ${settings.strategy} strategy`)
          }
        } else {
          console.log(`[PerpFarming] Auto Mode enabled - listening for portfolio scanner broadcasts`)
          setBotMessage('Auto Mode: Waiting for portfolio scanner... Monitoring all 30+ pairs')
          if (onBotMessageChange) onBotMessageChange('Auto Mode: Waiting for portfolio scanner... Monitoring all 30+ pairs')
          
          try {
            console.log('[PerpFarming] Checking for existing open positions to resume...')
            const allPositions = await orderManager.dexService.getAllPositions()
            const openPositions = allPositions.filter(p => Math.abs(parseFloat(p.positionAmt || '0')) > 0)
            
            // Filter out excluded pairs
            const excludedList = settings.excludedPairs || []
            const allowedPositions = openPositions.filter(p => !excludedList.includes(p.symbol))
            
            if (excludedList.length > 0) {
              const excludedPositions = openPositions.filter(p => excludedList.includes(p.symbol))
              if (excludedPositions.length > 0) {
                console.log(`[PerpFarming] 🚫 Found ${excludedPositions.length} excluded position(s) - NOT resuming:`, excludedPositions.map(p => p.symbol).join(', '))
                console.log('[PerpFarming] ℹ️ These positions are protected from Auto Mode (manual trading)')
              }
            }
            
            if (allowedPositions.length > 0) {
              console.log(`[PerpFarming] Found ${allowedPositions.length} open position(s) to resume (after exclusions)`)
              
              const resumedPositions = []
              
              for (const pos of allowedPositions) {
                const symbol = pos.symbol
                const side = parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT'
                
                const posData = {
                  symbol: symbol,
                  side: side,
                  entryPrice: parseFloat(pos.entryPrice),
                  quantity: Math.abs(parseFloat(pos.positionAmt)),
                  takeProfit: parseFloat(settings.takeProfit),
                  stopLoss: parseFloat(settings.stopLoss),
                  filledAt: Date.now(),
                  entryConfidence: 'unknown',
                  signalHistory: []
                }
                
                orderManager.activePositions.set(symbol, posData)
                
                resumedPositions.push({
                  symbol: symbol,
                  side: side,
                  entryPrice: parseFloat(pos.entryPrice),
                  invalidationPrice: null, // Will be set by next portfolio broadcast
                  openedAt: Date.now(),
                  // TP Trailing fields (will sync from next broadcast)
                  serverTP: null,
                  tpHit: false,
                  tpHitPrice: null,
                  tpHitPnl: null,
                  trailingIncrement: null,
                  currentSL: null,
                  isTrailing: false
                })
                
                // Update bot message for resumed position
                const unrealizedPnl = parseFloat(pos.unRealizedProfit || '0')
                updateBotMessage(symbol, `${side} position resumed @ $${parseFloat(pos.entryPrice).toFixed(4)} | PNL: ${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)} (awaiting next scanner update)`)
                
                console.log(`[PerpFarming] ✅ Resumed ${symbol} ${side} position`)
              }
              
              setPortfolioPositions(resumedPositions)
              setTradingSymbols(allowedPositions.map(p => p.symbol))
              
              setBotMessages({})
              lastMessageUpdateRef.current = {}
              setBotMessage('Auto Mode V2 resumed - waiting for next scanner update (invalidation prices will sync)')
              if (onBotMessageChange) onBotMessageChange('Auto Mode V2 resumed - waiting for next scanner update')
              
              console.log('[PerpFarming] Successfully resumed Auto Mode V2 with existing positions')
              
              // Trigger signal status poll immediately for resumed positions
              setTimeout(() => {
                if (wsClient && resumedPositions.length > 0) {
                  console.log('[PerpFarming] Triggering immediate signal status poll for resumed positions')
                  resumedPositions.forEach(pos => {
                    if (!excludedList.includes(pos.symbol)) {
                      try {
                        wsClient.getSignalStatus(pos.symbol)
                      } catch (error) {
                        console.warn(`[PerpFarming] Failed to request signal status for ${pos.symbol}:`, error.message)
                      }
                    }
                  })
                }
              }, 2000) // Wait 2s for WebSocket to stabilize
            } else {
              console.log('[PerpFarming] No existing positions to resume')
            }
          } catch (error) {
            console.warn('[PerpFarming] Could not check for existing positions on resume:', error.message)
          }
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

  // Periodically clean up messages for symbols without active positions
  useEffect(() => {
    if (!isRunning || !orderManagerRef.current) return
    
    const cleanupInterval = setInterval(() => {
      setBotMessages(prev => {
        const filtered = filterActiveMessages(prev, orderManagerRef.current)
        
        // Only update if messages were filtered out
        if (Object.keys(filtered).length !== Object.keys(prev).length) {
          console.log('[BotMessage] Cleaned up messages for inactive symbols')
          
          if (onBotMessagesChange) {
            onBotMessagesChange(filtered)
          }
          
          const messageArray = Object.entries(filtered)
            .map(([sym, msg]) => `[${sym}] ${msg}`)
            .join('\n\n')
          
          setBotMessage(messageArray || 'Waiting for signals...')
          
          if (onBotMessageChange) {
            onBotMessageChange(messageArray || 'Waiting for signals...')
          }
          
          return filtered
        }
        
        return prev
      })
    }, 10000) // Check every 10 seconds
    
    return () => clearInterval(cleanupInterval)
  }, [isRunning, onBotMessagesChange, onBotMessageChange])

  // Keep refs in sync with state
  useEffect(() => {
    portfolioPositionsRef.current = portfolioPositions
  }, [portfolioPositions])
  
  useEffect(() => {
    excludedPairsRef.current = excludedPairs
  }, [excludedPairs])
  
  // Poll for full signal status every 5 minutes (Auto Mode V2)
  // Gets fresh reasoning + invalidation status + score updates
  useEffect(() => {
    console.log('[Signal Status Poll] useEffect triggered', {
      isRunning,
      autoMode,
      hasWsClient: !!wsClientRef.current,
      hasExistingPoll: !!signalStatusPollRef.current
    })
    
    if (!isRunning || !autoMode || !wsClientRef.current) {
      // Clean up poll if stopped or Auto Mode disabled
      if (signalStatusPollRef.current) {
        console.log('[Signal Status Poll] Stopping poll (bot stopped or Auto Mode disabled)')
        clearInterval(signalStatusPollRef.current)
        signalStatusPollRef.current = null
      }
      return
    }
    
    // Only set up poll ONCE when bot starts in Auto Mode
    if (!signalStatusPollRef.current) {
      console.log('[Signal Status Poll] Setting up 5min poll')
      
      // Poll function (reads from refs for current values)
      const pollSignalStatus = () => {
        // Get current positions from ref
        const currentPositions = portfolioPositionsRef.current
        if (currentPositions.length === 0) {
          console.log('[Signal Status Poll] No positions to check')
          return
        }
        
        // Filter out excluded pairs from ref
        const currentExcluded = excludedPairsRef.current || []
        const positionsToCheck = currentPositions.filter(p => !currentExcluded.includes(p.symbol))
        
        if (positionsToCheck.length === 0) {
          console.log('[Signal Status Poll] No positions to check (all excluded)')
          return
        }
        
        console.log(`[Signal Status Poll] Checking ${positionsToCheck.length} position(s):`, positionsToCheck.map(p => p.symbol).join(', '))
        positionsToCheck.forEach(pos => {
          try {
            wsClientRef.current.getSignalStatus(pos.symbol)
          } catch (error) {
            console.warn(`[Signal Status Poll] Failed to request ${pos.symbol}:`, error.message)
          }
        })
      }
      
      // Call immediately when poll starts
      pollSignalStatus()
      
      // Then every 5 minutes
      signalStatusPollRef.current = setInterval(pollSignalStatus, 300000)
    }
    
    return () => {
      // Cleanup on unmount only
      if (signalStatusPollRef.current) {
        console.log('[Signal Status Poll] Cleanup on unmount')
        clearInterval(signalStatusPollRef.current)
        signalStatusPollRef.current = null
      }
    }
  }, [isRunning, autoMode]) // Only depend on isRunning and autoMode

  const handleCloseModal = () => {
    setShowModal(false)
    setShowPairSelection(false) // Reset to settings view
    setShowExclusionList(false) // Reset exclusion list view
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

    // Clear Smart Mode signal history
    signalHistoryRef.current.clear()
    
    // Clear per-symbol trailing stop tracking
    peakPnlPerSymbolRef.current.clear()
    trailingStopPerSymbolRef.current.clear()

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
              {positionPnls.length > 1 && (
                <div className="individual-pnls">
                  {positionPnls.map((pos, index) => (
                    <div 
                      key={pos.symbol}
                      className={`position-pnl-badge ${pos.pnl > 0 ? 'positive' : pos.pnl < 0 ? 'negative' : 'neutral'}`}
                      onClick={() => handlePositionBadgeClick(pos)}
                      title={`Click to close ${pos.symbol.replace('USDT', '')} position`}
                    >
                      <span className="position-symbol">{pos.symbol.replace('USDT', '')}</span>
                      <span className="position-pnl-value">
                        {pos.pnl > 0 ? '+' : ''}{pos.pnl < 0 ? '-' : ''}${Math.abs(pos.pnl).toFixed(2)}
                      </span>
                    </div>
                  ))}
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
          <div className="bot-controls">
            {isRunning && (
              <button 
                className="settings-icon-button"
                onClick={() => setShowModal(true)}
                title="Edit Settings"
              >
                ⚙️
              </button>
            )}
            <button 
              className={`setup-button ${isRunning ? 'stop-button' : ''}`}
              onClick={() => isRunning ? handleStop() : setShowModal(true)}
            >
              {isRunning ? 'Stop' : 'Setup'}
            </button>
          </div>
        </div>
      </div>

      {/* Risk Settings Modal */}
      {showModal && (
        <div className="risk-modal-overlay" onClick={handleCloseModal}>
          <div className="risk-modal" onClick={(e) => e.stopPropagation()}>
            <button className="risk-modal-close" onClick={handleCloseModal}>×</button>
            <div className="risk-modal-wrapper">
              <h2 className="risk-modal-title">
                {showPairSelection ? 'Select Pairs' : showExclusionList ? 'Exclude Pairs' : 'Risk Settings'}
              </h2>
              
              {/* Back button when in pair selection or exclusion list view */}
              {(showPairSelection || showExclusionList) && (
                <button 
                  className="pair-back-button"
                  onClick={() => {
                    setShowPairSelection(false)
                    setShowExclusionList(false)
                  }}
                >
                  ← Back to Settings
                </button>
              )}
              
              <div className="risk-modal-content">
              
              {/* Exclusion List View */}
              {showExclusionList ? (
                <div className="pair-selection-content">
                  <div className="pair-selection-info">
                    <p>Select pairs to <strong>EXCLUDE</strong> from Auto Mode</p>
                    <p>⚠️ Bot will never open or close these pairs (manual trading protection)</p>
                    <p className="pair-selection-count">
                      {excludedPairs.length} excluded
                    </p>
                  </div>
                  
                  {loadingSymbols ? (
                    <div className="loading-symbols">Loading available pairs...</div>
                  ) : (
                    <div className="pairs-list">
                      {availableSymbols.map((symbol) => {
                        const isExcluded = excludedPairs.includes(symbol)
                        
                        return (
                          <label 
                            key={symbol} 
                            className={`pair-checkbox-item ${isExcluded ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isExcluded}
                              onChange={() => {
                                setExcludedPairs(prev => 
                                  isExcluded 
                                    ? prev.filter(s => s !== symbol)
                                    : [...prev, symbol]
                                )
                              }}
                            />
                            <span className="pair-symbol">{symbol}</span>
                            {isExcluded && <span className="check-mark">🚫</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : showPairSelection ? (
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
                    🎯 Enable Portfolio Scanner (Fully Automated Multi-Pair Trading)
                  </span>
                </label>
                <div className="breakeven-description">
                  🎯 <strong>V2 Swing Structure Scanner:</strong> Monitors 154 pairs every 5 minutes using 4H swing analysis. Automatically selects top 3 opportunities (always includes ≥1 LONG unless all longs score &lt;50). Enters with split orders (20% immediate + 80% at better price) and exits on structure break (invalidation_price). Capital splits evenly across 3 positions. Manual strategy ignored.
                </div>
                
                {/* Exclusion List Button - Only show when Auto Mode enabled */}
                {autoMode && (
                  <div className="exclusion-list-section" style={{ marginTop: '12px' }}>
                    <button 
                      className="pair-selection-button"
                      onClick={() => setShowExclusionList(true)}
                      type="button"
                    >
                      <span className="pair-count">
                        {excludedPairs.length === 0 ? 'No pairs excluded' : `${excludedPairs.length} pair${excludedPairs.length !== 1 ? 's' : ''} excluded`}
                      </span>
                      <span className="pair-arrow">→</span>
                    </button>
                    {excludedPairs.length > 0 && (
                      <div className="selected-pairs-preview">
                        🚫 {excludedPairs.slice(0, 3).join(', ')}
                        {excludedPairs.length > 3 && ` +${excludedPairs.length - 3} more`}
                      </div>
                    )}
                    <div className="breakeven-description" style={{ marginTop: '8px' }}>
                      Exclude pairs you're trading manually. Bot will never touch these pairs.
                    </div>
                  </div>
                )}
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
                  🧠 Intelligent position management with 8 exit strategies: (1) Strong reversal, (2) Profit protection, (3) Confidence decay, (4) Consecutive weakness, (5) Persistent reversal, (6) Profit erosion, (7) Stale positions, (8) Confidence downtrend. Adapts based on PNL, time in position, and signal quality trends.
                </div>
                {smartMode && (
                  <div className="breakeven-tolerance-section" style={{ marginTop: '12px' }}>
                    <label className="risk-label">Minimum PNL for Smart Exit</label>
                    <input
                      type="number"
                      value={smartModeMinPnl}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '' || val === '-') {
                          setSmartModeMinPnl(-50)
                        } else {
                          const parsed = parseFloat(val)
                          setSmartModeMinPnl(isNaN(parsed) ? -50 : parsed)
                        }
                      }}
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

              {/* TP/SL Settings - Hide in Auto Mode (uses server's structure-based targets) */}
              {!autoMode && (
              <>
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
              </>
              )}

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
                  className="risk-input strategy-dropdown"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                >
                  <option value="range_trading">Range Trading (Mean Reversion)</option>
                  <option value="momentum">Momentum (LLM-Powered)</option>
                  <option value="scalp">Aggressive Reversion Scalping ⚡</option>
                  <option value="momentum_x">Momentum X (Psychic Candle Reader) 🔥</option>
                  <option value="orderbook_trading">Order Book Trading (Near Real-Time) 🔥⚡</option>
                </select>
                <div className="strategy-description">
                  {strategy === 'range_trading' 
                    ? '📊 Trades bounces off 24h support/resistance levels'
                    : strategy === 'momentum'
                    ? '🤖 AI-powered trend-following using GPT-5 analysis'
                    : strategy === 'scalp'
                    ? '⚡ Ultra-fast 30-second signals, optimized for 75x leverage'
                    : strategy === 'momentum_x'
                    ? '🔮 8-layer whipsaw scalper with delta, orderbook, FVG analysis @ 100x'
                    : '📊 10-second order flow analysis with CVD, OBI, VWAP. Stays in until reversal!'
                  }
                </div>
              </div>
              )}

              {/* Exit Strategy - Hide in Auto Mode (uses intelligent TP trailing) */}
              {!autoMode && (
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
                          min="1"
                          max="100"
                          step="1"
                          value={trailingIncrement}
                          onChange={(e) => setTrailingIncrement(Number(e.target.value))}
                          className="risk-slider"
                        />
                        <div className="risk-slider-labels">
                          <span>$1</span>
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
              )}

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

      {/* Close Position Modal */}
      {showClosePositionModal && selectedPositionToClose && (
        <div className="risk-modal-overlay" onClick={() => setShowClosePositionModal(false)}>
          <div className="risk-modal close-position-modal" onClick={(e) => e.stopPropagation()}>
            <button className="risk-modal-close" onClick={() => setShowClosePositionModal(false)}>×</button>
            <div className="risk-modal-wrapper">
              <h2 className="risk-modal-title">Close Position</h2>
              <div className="close-position-content">
                <div className="close-position-symbol">
                  {selectedPositionToClose.symbol.replace('USDT', '')}
                </div>
                <div className={`close-position-pnl ${selectedPositionToClose.pnl > 0 ? 'positive' : selectedPositionToClose.pnl < 0 ? 'negative' : 'neutral'}`}>
                  {selectedPositionToClose.pnl > 0 ? '+' : ''}{selectedPositionToClose.pnl < 0 ? '-' : ''}${Math.abs(selectedPositionToClose.pnl).toFixed(2)}
                </div>
                <p className="close-position-message">
                  Are you sure you want to close this position?
                </p>
                <label className="exclude-checkbox-label">
                  <input
                    type="checkbox"
                    checked={addToExcludeList}
                    onChange={(e) => setAddToExcludeList(e.target.checked)}
                    className="exclude-checkbox"
                  />
                  <span>Add {selectedPositionToClose.symbol.replace('USDT', '')} to exclusion list</span>
                </label>
                <div className="close-position-buttons">
                  <button 
                    className="close-position-button confirm"
                    onClick={handleConfirmClosePosition}
                  >
                    Close Position
                  </button>
                  <button 
                    className="close-position-button cancel"
                    onClick={() => setShowClosePositionModal(false)}
                  >
                    Cancel
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
