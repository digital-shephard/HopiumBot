/**
 * Smart Mode: Intelligent exit decision based on signal quality and trends
 * 
 * This function analyzes signal history and current conditions to determine
 * if a position should be exited based on various criteria.
 */
export const checkSmartExit = (signalHistoryRef, symbol, newSignal, currentNetPnl, options = {}) => {
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

