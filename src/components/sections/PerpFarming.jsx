import { useState, useEffect, useRef } from 'react'
import './PerpFarming.css'
import asterLogo from '../../assets/aster_logo.png'
import OrderManager from '../../services/orderManager'
import { HopiumWebSocketClient } from '../../services/websocket'
import AsterDexService from '../../services/dex/aster/AsterDexService'
import { useAuth } from '../../contexts/AuthContext'

const STORAGE_KEY = 'perp_farming_settings'
const STATS_STORAGE_KEY = 'perp_farming_stats'

// Aster Finance Fee Structure
const MAKER_FEE = 0.00005 // 0.005% (LIMIT orders that make liquidity)
const TAKER_FEE = 0.0004  // 0.04% (MARKET orders or LIMIT orders that take liquidity)
const ENTRY_FEE = TAKER_FEE // Conservative estimate - assume taker
const EXIT_FEE = TAKER_FEE  // MARKET orders are always taker

function PerpFarming() {
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
  const [breakEvenMode, setBreakEvenMode] = useState(false)
  const [trailingBreakEven, setTrailingBreakEven] = useState(false)
  const [trailingActivation, setTrailingActivation] = useState('3x_fees') // '2x_fees', '3x_fees', '5x_fees', '$50', '$100'
  const [trailingDistance, setTrailingDistance] = useState('10') // '5', '10', '15', '20' (percentage)
  const [shakeApiKey, setShakeApiKey] = useState(false)
  const [shakeSecretKey, setShakeSecretKey] = useState(false)
  const [shakeCapital, setShakeCapital] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [tradingSymbol, setTradingSymbol] = useState('')
  const [allowedEquity, setAllowedEquity] = useState('')
  const [pnl, setPnl] = useState(0)
  const [prevPnl, setPrevPnl] = useState(0)
  const [overallPnl, setOverallPnl] = useState(0)
  const [totalTrades, setTotalTrades] = useState(0)
  const [estimatedFees, setEstimatedFees] = useState(0)
  
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
        setBreakEvenMode(settings.breakEvenMode || false)
        setTrailingBreakEven(settings.trailingBreakEven || false)
        setTrailingActivation(settings.trailingActivation || '3x_fees')
        setTrailingDistance(settings.trailingDistance || '10')
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }

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
        breakEvenMode,
        trailingBreakEven,
        trailingActivation,
        trailingDistance
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      setShowModal(false)

      // Set running state immediately after API key confirmation
      setIsRunning(true)
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
      
      // Set default trading symbol (used even if WebSocket fails)
      const defaultSymbol = 'BTCUSDT'
      setTradingSymbol(defaultSymbol)
      
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
              // Check trailing break-even stop loss
              if (settings.trailingBreakEven) {
                // Calculate activation threshold
                let activationThreshold = 0
                if (settings.trailingActivation === '2x_fees') {
                  activationThreshold = totalFees * 2
                } else if (settings.trailingActivation === '3x_fees') {
                  activationThreshold = totalFees * 3
                } else if (settings.trailingActivation === '5x_fees') {
                  activationThreshold = totalFees * 5
                } else if (settings.trailingActivation === '$50') {
                  activationThreshold = 50
                } else if (settings.trailingActivation === '$100') {
                  activationThreshold = 100
                }
                
                // Check if trailing is activated (peak exceeded threshold)
                if (peakPnlRef.current >= activationThreshold) {
                  // Calculate trailing stop level
                  const trailPercent = parseFloat(settings.trailingDistance) / 100
                  const trailingStop = peakPnlRef.current * (1 - trailPercent)
                  trailingStopRef.current = Math.max(trailingStop, 0) // Never go below break-even
                  
                  // Check if current PNL dropped below trailing stop
                  if (netPnl <= trailingStopRef.current) {
                    console.log(`Trailing Stop Hit: Net PNL $${netPnl.toFixed(2)} <= Trailing Stop $${trailingStopRef.current.toFixed(2)} (Peak: $${peakPnlRef.current.toFixed(2)})`)
                    // Close all positions
                    for (const position of status.activePositions) {
                      await closePosition(orderManager, position.symbol, netPnl)
                    }
                  }
                }
              }
              // Check simple break-even mode (volume farming)
              else if (settings.breakEvenMode && netPnl >= 0) {
                console.log(`Break-even hit: Net PNL $${netPnl.toFixed(2)} >= $0 (after fees)`)
                // Close all positions at break-even
                for (const position of status.activePositions) {
                  await closePosition(orderManager, position.symbol, netPnl)
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
        
        // Handle subscription confirmation - use the full pair name from WebSocket
        wsClient.onSubscribed = (symbol) => {
          setTradingSymbol(symbol)
        }
        
        wsClient.onSummary = async (data) => {
          try {
            // Update symbol from summary if available (fallback)
            if (data.symbol) {
              setTradingSymbol(data.symbol)
            }
            
            // Check if position exists before opening new one
            const status = orderManager.getStatus()
            const hasActivePosition = status.activePositions && status.activePositions.length > 0
            
            if (!hasActivePosition) {
              await orderManager.handleSummary(data)
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

            // Update symbol
            if (scalpData.symbol) {
              setTradingSymbol(scalpData.symbol)
            }
            
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
            
            // Accept both high and medium confidence signals
            const shouldTrade = scalpData.confidence === 'high' || scalpData.confidence === 'medium'
            
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
              console.log(`[PerpFarming] ⏭️ Skipping scalp signal - low confidence (${scalpData.confidence})`)
            }
          } catch (error) {
            handleError(`Failed to handle scalp signal: ${error.message}`)
          }
        }
        
        wsClient.onError = (error) => {
          const errorMsg = error.payload?.error || 'Unknown error'
          handleError(`WebSocket error: ${errorMsg}`)
          
          // Check if requires re-authentication
          if (error.payload?.requiresReauth) {
            handleError('WebSocket authentication expired. Please re-authenticate and restart trading.')
            // Stop trading if auth fails
            handleStop()
          }
        }
        
        // Connect with authentication token
        await wsClient.connect(token)
        wsClient.subscribe(defaultSymbol, settings.strategy) // Default symbol with strategy
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
    setTradingSymbol('')
    setAllowedEquity('')
    setPnl(0)
    setPrevPnl(0)
    setEstimatedFees(0)
    peakPnlRef.current = 0
    trailingStopRef.current = 0
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

          {isRunning && tradingSymbol && (
            <div className="trading-status">
              Trading {tradingSymbol}
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
              <h2 className="risk-modal-title">Risk Settings</h2>
              <div className="risk-modal-content">
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
                </select>
                <div className="strategy-description">
                  {strategy === 'range_trading' 
                    ? '📊 Trades bounces off 24h support/resistance levels'
                    : strategy === 'momentum'
                    ? '🤖 AI-powered trend-following using GPT-5 analysis'
                    : '⚡ Ultra-fast 30-second signals, optimized for 75x leverage'
                  }
                </div>
              </div>

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
                  <div className="breakeven-description">
                    💰 Closes at Net PNL ≥ $0. Minimizes risk, maximizes volume.
                  </div>
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
                      🎯 Locks in profits by trailing stop loss behind peak. Normal TP still applies.
                    </div>
                    
                    <div className="trailing-setting">
                      <label className="trailing-setting-label">Activate After Peak:</label>
                      <select
                        className="trailing-select"
                        value={trailingActivation}
                        onChange={(e) => setTrailingActivation(e.target.value)}
                      >
                        <option value="2x_fees">2x Fees (~$80)</option>
                        <option value="3x_fees">3x Fees (~$120)</option>
                        <option value="5x_fees">5x Fees (~$200)</option>
                        <option value="$50">$50</option>
                        <option value="$100">$100</option>
                      </select>
                    </div>
                    
                    <div className="trailing-setting">
                      <label className="trailing-setting-label">Trail Distance:</label>
                      <select
                        className="trailing-select"
                        value={trailingDistance}
                        onChange={(e) => setTrailingDistance(e.target.value)}
                      >
                        <option value="5">5% (Tight - lock profits fast)</option>
                        <option value="10">10% (Balanced)</option>
                        <option value="15">15% (Medium)</option>
                        <option value="20">20% (Loose - ride winners)</option>
                      </select>
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
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PerpFarming
