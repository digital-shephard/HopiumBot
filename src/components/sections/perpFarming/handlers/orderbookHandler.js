import { checkSmartExit } from '../smartMode'
import { calculateNetPnl } from '../positionHelpers'
import { POSITION_GRACE_PERIOD, REVERSAL_GRACE_PERIOD } from '../constants'

/**
 * Handle Order Book Trading signals (Near Real-Time Order Flow)
 */
export const createOrderBookHandler = (dependencies) => {
  const { 
    orderManager, 
    settings,
    lastPnlRef,
    signalHistoryRef,
    updateBotMessage,
    closePosition,
    setPortfolioPositions,
    setPortfolioSubscriptions,
    handleError 
  } = dependencies

  return async (message) => {
    try {
      console.log('[PerpFarming] Received order book signal:', message)
      
      // Extract the actual order book data
      const orderBookData = message?.data || message
      
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
          symbolNetPnl = await calculateNetPnl(orderManager, symbol)
          console.log(`[Portfolio] ${symbol} Net PNL: $${symbolNetPnl.toFixed(2)}`)
        } catch (error) {
          console.error(`[Portfolio] Failed to get PNL for ${symbol}:`, error)
          symbolNetPnl = lastPnlRef.current || 0 // Fallback to total PNL
        }
        
        // First check Smart Mode exit conditions
        if (settings.smartMode) {
          const minPnl = parseFloat(settings.smartModeMinPnl) || -50
          
          // Check if position was just opened (grace period)
          const position = orderManager.activePositions.get(symbol)
          const positionAge = position ? (Date.now() - position.filledAt) / 1000 : 999
          
          if (positionAge < POSITION_GRACE_PERIOD) {
            console.log(`[Portfolio] ${symbol} is only ${positionAge.toFixed(0)}s old - grace period (${POSITION_GRACE_PERIOD}s) - skipping Smart Mode exit`)
          } else if (symbolNetPnl >= minPnl) {
            const exitDecision = checkSmartExit(signalHistoryRef, symbol, {
              side: orderBookData.side,
              confidence: orderBookData.confidence
            }, symbolNetPnl, { isAutoMode: settings.autoMode })

            if (exitDecision.shouldExit) {
              console.log(`[PerpFarming] 🧠 Smart Mode EXIT: ${exitDecision.reason}`)
              console.log(`[PerpFarming] 🧠 Details:`, exitDecision.details)
              
              const exitMessage = `[${symbol}] ${exitDecision.statement}`
              updateBotMessage(symbol, exitMessage)
              
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
          
          if (positionAge < REVERSAL_GRACE_PERIOD) {
            console.log(`[Portfolio] ${symbol} is only ${positionAge.toFixed(0)}s old - grace period (${REVERSAL_GRACE_PERIOD}s) - skipping reversal`)
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
}

