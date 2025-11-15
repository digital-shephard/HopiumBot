import { checkSmartExit } from '../smartMode'

/**
 * Handle Momentum X strategy signals (Psychic Candle Reader)
 */
export const createMomentumXHandler = (dependencies) => {
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
      console.log('[PerpFarming] Received momentum X message:', message)
      
      // Extract the actual momentum X data
      const momentumXData = message?.data || message
      
      if (!momentumXData) {
        console.log('[PerpFarming] No momentum X data found in message')
        return
      }
      
      console.log('[PerpFarming] Extracted momentum X data:', momentumXData)

      // Update bot message with server reasoning (always)
      const reasoning = momentumXData.reasoning || 'Calling home for some data...'
      updateBotMessage(momentumXData.symbol, reasoning)
      
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
          const exitDecision = checkSmartExit(signalHistoryRef, symbol, {
            side: momentumXData.side,
            confidence: momentumXData.confidence
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
}

