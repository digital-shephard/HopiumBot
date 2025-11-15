import { checkSmartExit } from '../smartMode'

/**
 * Handle Aggressive Reversion Scalping signals
 */
export const createScalpHandler = (dependencies) => {
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
      console.log('[PerpFarming] Received scalp message:', message)
      
      // Extract the actual scalp data
      const scalpData = message?.data || message
      
      if (!scalpData) {
        console.log('[PerpFarming] No scalp data found in message')
        return
      }
      
      console.log('[PerpFarming] Extracted scalp data:', scalpData)

      // Update bot message with server reasoning (always)
      const reasoning = scalpData.reasoning || 'Calling home for some data...'
      updateBotMessage(scalpData.symbol, reasoning)

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
          const exitDecision = checkSmartExit(signalHistoryRef, symbol, {
            side: scalpData.side,
            confidence: scalpData.confidence
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
}

