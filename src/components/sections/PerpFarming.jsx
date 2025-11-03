import { useState, useEffect, useRef } from 'react'
import './PerpFarming.css'
import asterLogo from '../../assets/aster_logo.png'
import OrderManager from '../../services/orderManager'
import { HopiumWebSocketClient } from '../../services/websocket'
import AsterDexService from '../../services/dex/aster/AsterDexService'
import { useAuth } from '../../contexts/AuthContext'

const STORAGE_KEY = 'perp_farming_settings'

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
  
  const orderManagerRef = useRef(null)
  const wsClientRef = useRef(null)
  const errorHandlerRef = useRef(null)
  const speedChangeTimeRef = useRef(Date.now())
  const previousSpeedRef = useRef(1)
  const lineStartTimesRef = useRef(new Map())
  const pnlPollIntervalRef = useRef(null)

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
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }
  }, [])

  // Helper function to format percentage display
  const formatPercentage = (value) => {
    return value === 0 ? 'None' : `${value}%`
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
        strategy
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

  // Helper function to close a position
  const closePosition = async (orderManager, symbol) => {
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
      
      console.log(`[ClosePosition] Closing ${symbol}:`, {
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
        positionSize: settings.positionSize
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
          if (status.activePositions && status.activePositions.length > 0) {
            // Calculate total PNL in dollars from all positions
            let totalPnlDollars = 0
            for (const position of status.activePositions) {
              const currentPosition = await orderManager.dexService.getPosition(position.symbol)
              // unRealizedProfit is the actual dollar amount
              const unrealizedProfit = parseFloat(currentPosition.unRealizedProfit || '0')
              totalPnlDollars += unrealizedProfit
            }
            
            // Update PNL with animation trigger
            setPrevPnl(pnl)
            setPnl(totalPnlDollars)
            
            // Check dollar-based TP/SL if in dollar mode
            if (settings.tpSlMode === 'dollar') {
              const takeProfitDollars = parseFloat(settings.takeProfit)
              const stopLossDollars = parseFloat(settings.stopLoss)
              
              // Check Take Profit
              if (takeProfitDollars > 0 && totalPnlDollars >= takeProfitDollars) {
                console.log(`Take Profit hit: $${totalPnlDollars.toFixed(2)} >= $${takeProfitDollars.toFixed(2)}`)
                // Close all positions
                for (const position of status.activePositions) {
                  await closePosition(orderManager, position.symbol)
                }
              }
              
              // Check Stop Loss
              if (stopLossDollars > 0 && totalPnlDollars <= -stopLossDollars) {
                console.log(`Stop Loss hit: $${totalPnlDollars.toFixed(2)} <= -$${stopLossDollars.toFixed(2)}`)
                // Close all positions
                for (const position of status.activePositions) {
                  await closePosition(orderManager, position.symbol)
                }
              }
            }
          } else {
            // No active positions, reset PNL
            setPrevPnl(pnl)
            setPnl(0)
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
              <div className="pnl-label">PNL</div>
              <div className={`pnl-amount ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral'} ${prevPnl !== pnl ? 'animate' : ''}`}>
                {pnl > 0 ? '+' : ''}{pnl < 0 ? '-' : ''}${Math.abs(pnl).toFixed(2)}
              </div>
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
