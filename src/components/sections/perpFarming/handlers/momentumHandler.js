import { checkSmartExit } from '../smartMode'

/**
 * Handle Momentum strategy signals (LLM-powered)
 */
export const createMomentumHandler = (dependencies) => {
  const { 
    orderManager, 
    settings,
    lastPnlRef,
    signalHistoryRef,
    updateBotMessage,
    closePosition,
    handleError 
  } = dependencies

  return async (message) => {
    try {
      console.log('[PerpFarming] Received momentum message:', message)
      
      // Extract the actual momentum data
      const momentumData = message?.data || message
      
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
      updateBotMessage(momentumData.symbol, reasoning)
      
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
          const exitDecision = checkSmartExit(signalHistoryRef, symbol, {
            side: momentumData.side,
            confidence: momentumData.confidence
          }, currentNetPnl)

          if (exitDecision.shouldExit) {
            console.log(`[PerpFarming] 🧠 Smart Mode EXIT: ${exitDecision.reason}`)
            console.log(`[PerpFarming] 🧠 Details:`, exitDecision.details)
            
            updateBotMessage(symbol, exitDecision.statement)
            
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
}

