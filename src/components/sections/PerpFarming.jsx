import { useState, useEffect, useRef } from 'react'
import './PerpFarming.css'
import asterLogo from '../../assets/aster_logo.png'
import OrderManager from '../../services/orderManager'
import { HopiumWebSocketClient } from '../../services/websocket'
import AsterDexService from '../../services/dex/aster/AsterDexService'
import { useAuth } from '../../contexts/AuthContext'
import API_CONFIG from '../../config/api'

// Import modular components
import { 
  STORAGE_KEY, 
  STATS_STORAGE_KEY, 
  ENTRY_FEE, 
  EXIT_FEE,
  PNL_POLL_INTERVAL,
  MESSAGE_CLEANUP_INTERVAL,
  STATS_SAVE_INTERVAL,
  SIGNAL_STATUS_POLL_INTERVAL,
  RUNNING_SPEED_MULTIPLIER,
  IDLE_SPEED_MULTIPLIER
} from './perpFarming/constants'

import { 
  closePositionInChunks, 
  calculateNetPnl,
  saveStats 
} from './perpFarming/positionHelpers'

import { createScalpHandler } from './perpFarming/handlers/scalpHandler'
import { createMomentumHandler } from './perpFarming/handlers/momentumHandler'
import { createMomentumXHandler } from './perpFarming/handlers/momentumXHandler'
import { createOrderBookHandler } from './perpFarming/handlers/orderbookHandler'
import { 
  createPortfolioHandler, 
  createSignalStatusHandler 
} from './perpFarming/handlers/portfolioHandler'

import ClosePositionModal from './perpFarming/modals/ClosePositionModal'
import AuthModal from './perpFarming/modals/AuthModal'
import SettingsModal from './perpFarming/components/SettingsModal'
import StrategyBuilderModal from '../strategy-builder/StrategyBuilderModal'
import { StrategyStorage } from '../../services/strategyBuilder/StrategyStorage'
import { StrategyRunner } from '../../services/strategyBuilder/StrategyRunner'

function PerpFarming({ onBotMessageChange, onBotMessagesChange, onBotStatusChange, onModalStateChange }) {
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
  
  // Custom Strategy Builder
  const [showStrategyBuilder, setShowStrategyBuilder] = useState(false)
  const [customStrategies, setCustomStrategies] = useState([]) // Custom strategies from localStorage
  const customStrategyRunnersRef = useRef(new Map()) // Map of strategy_id -> StrategyRunner
  
  // Notify parent when modal state changes
  useEffect(() => {
    if (onModalStateChange) {
      onModalStateChange(showStrategyBuilder);
    }
  }, [showStrategyBuilder, onModalStateChange]);
  
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

  // Load custom strategies from localStorage
  useEffect(() => {
    const strategies = StrategyStorage.getAll()
    setCustomStrategies(strategies)
    console.log('[PerpFarming] Loaded custom strategies:', strategies.length)
  }, [showStrategyBuilder]) // Reload when strategy builder closes

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
          saveStats(STATS_STORAGE_KEY, newValue, newTradeCount)
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
    setShowClosePositionModal(true)
  }

  // Handle confirmed position close from modal
  const handleConfirmClosePosition = async (addToExcludeList) => {
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
    } catch (error) {
      console.error(`[Manual Close] Error closing ${symbol}:`, error)
      handleError(`Failed to close ${symbol}: ${error.message}`)
    }
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
                      saveStats(STATS_STORAGE_KEY, newValue, newTradeCount)
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
                      saveStats(STATS_STORAGE_KEY, newValue, newTradeCount)
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
                            saveStats(STATS_STORAGE_KEY, newValue, newTradeCount)
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
                        saveStats(STATS_STORAGE_KEY, newValue, newTradeCount)
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
                        saveStats(STATS_STORAGE_KEY, newValue, newTradeCount)
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
      }, PNL_POLL_INTERVAL)
      
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
        
        // === CREATE HANDLER DEPENDENCIES ===
        const dependencies = {
          orderManager,
          settings,
          lastPnlRef,
          signalHistoryRef,
          updateBotMessage,
          closePosition,
          portfolioPositions,
          setPortfolioPositions,
          setTradingSymbols,
          onBotMessageChange,
          handleError
        }
        
        // === CREATE HANDLERS USING FACTORIES ===
        const scalpHandler = createScalpHandler(dependencies)
        const momentumHandler = createMomentumHandler(dependencies)
        const momentumXHandler = createMomentumXHandler(dependencies)
        const orderbookHandler = createOrderBookHandler(dependencies)
        const portfolioHandlers = createPortfolioHandler(dependencies)
        const signalStatusHandler = createSignalStatusHandler(dependencies)
        
        // === ATTACH HANDLERS TO WEBSOCKET CLIENT ===
        wsClient.onScalpIndicator = scalpHandler
        wsClient.onMomentumIndicator = momentumHandler
        wsClient.onMomentumX = momentumXHandler
        wsClient.onOrderBookSignal = orderbookHandler
        wsClient.onPortfolioPicks = portfolioHandlers.handlePortfolioPicks
        wsClient.onSignalStatus = signalStatusHandler
        
        // Handle range trading (old summary format)
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
      saveStats(STATS_STORAGE_KEY, overallPnl, totalTrades)
    }, STATS_SAVE_INTERVAL)
    
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
    }, MESSAGE_CLEANUP_INTERVAL)
    
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
      signalStatusPollRef.current = setInterval(pollSignalStatus, SIGNAL_STATUS_POLL_INTERVAL)
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
    const currentSpeed = isRunning ? RUNNING_SPEED_MULTIPLIER : IDLE_SPEED_MULTIPLIER
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
    const currentSpeed = isRunning ? RUNNING_SPEED_MULTIPLIER : IDLE_SPEED_MULTIPLIER
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
          '--speed-multiplier': isRunning ? RUNNING_SPEED_MULTIPLIER : IDLE_SPEED_MULTIPLIER
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
                  saveStats(STATS_STORAGE_KEY, 0, 0)
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
        <SettingsModal
          onClose={handleCloseModal}
          isRunning={isRunning}
          isValidating={isValidating}
          validationError={validationError}
          showPairSelection={showPairSelection}
          setShowPairSelection={setShowPairSelection}
          showExclusionList={showExclusionList}
          setShowExclusionList={setShowExclusionList}
          asterApiKey={asterApiKey}
          setAsterApiKey={setAsterApiKey}
          asterSecretKey={asterSecretKey}
          setAsterSecretKey={setAsterSecretKey}
          shakeApiKey={shakeApiKey}
          shakeSecretKey={shakeSecretKey}
          setValidationError={setValidationError}
          capital={capital}
          setCapital={setCapital}
          shakeCapital={shakeCapital}
          leverage={leverage}
          setLeverage={setLeverage}
          positionSize={positionSize}
          setPositionSize={setPositionSize}
          tpSlMode={tpSlMode}
          setTpSlMode={setTpSlMode}
          takeProfit={takeProfit}
          setTakeProfit={setTakeProfit}
          stopLoss={stopLoss}
          setStopLoss={setStopLoss}
          strategy={strategy}
          setStrategy={setStrategy}
          orderType={orderType}
          setOrderType={setOrderType}
          orderTimeout={orderTimeout}
          setOrderTimeout={setOrderTimeout}
          autoMode={autoMode}
          setAutoMode={setAutoMode}
          smartMode={smartMode}
          setSmartMode={setSmartMode}
          smartModeMinPnl={smartModeMinPnl}
          setSmartModeMinPnl={setSmartModeMinPnl}
          trustLowConfidence={trustLowConfidence}
          setTrustLowConfidence={setTrustLowConfidence}
          breakEvenMode={breakEvenMode}
          setBreakEvenMode={setBreakEvenMode}
          breakEvenLossTolerance={breakEvenLossTolerance}
          setBreakEvenLossTolerance={setBreakEvenLossTolerance}
          trailingBreakEven={trailingBreakEven}
          setTrailingBreakEven={setTrailingBreakEven}
          trailingIncrement={trailingIncrement}
          setTrailingIncrement={setTrailingIncrement}
          availableSymbols={availableSymbols}
          loadingSymbols={loadingSymbols}
          selectedPairs={selectedPairs}
          togglePairSelection={togglePairSelection}
          excludedPairs={excludedPairs}
          setExcludedPairs={setExcludedPairs}
          handleStart={handleStart}
          formatPercentage={formatPercentage}
          customStrategies={customStrategies}
          onOpenStrategyBuilder={() => setShowStrategyBuilder(true)}
        />
      )}
      
      {/* Strategy Builder Modal */}
      {showStrategyBuilder && (
        <StrategyBuilderModal
          isOpen={showStrategyBuilder}
          onClose={() => setShowStrategyBuilder(false)}
          symbol={selectedPairs[0] || 'BTCUSDT'}
        />
      )}

      {/* Auth Re-verification Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onReAuthenticate={handleReAuthenticate}
          onStop={() => {
            setShowAuthModal(false)
            handleStop()
          }}
        />
      )}

      {/* Close Position Modal */}
      {showClosePositionModal && selectedPositionToClose && (
        <ClosePositionModal
          position={selectedPositionToClose}
          onClose={() => setShowClosePositionModal(false)}
          onConfirm={handleConfirmClosePosition}
          showExcludeCheckbox={autoMode}
        />
      )}
    </div>
  )
}

export default PerpFarming

