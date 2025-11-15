import { calculateNetPnl } from '../positionHelpers'
import { ENTRY_FEE, EXIT_FEE } from '../constants'

/**
 * Handle Auto Mode Portfolio Scanner V2 signals
 */
export const createPortfolioHandler = (dependencies) => {
  const {
    orderManager,
    settings,
    portfolioPositions,
    setPortfolioPositions,
    updateBotMessage,
    closePosition,
    setTradingSymbols,
    onBotMessageChange,
    handleError
  } = dependencies

  /**
   * Handle portfolio picks - Top 3 opportunities using 4H swing structure
   */
  const handlePortfolioPicks = async (message) => {
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
      await handleInvalidatedSymbols(invalidated)

      // Filter picks (score >= 70 AND not excluded)
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

      // Determine BTC bias and allocation
      const { selectedPicks, biasMessage } = await determineBTCBiasAndAllocate(allPicks)

      const picksSummary = selectedPicks.map(p => `${p.symbol} ${p.side}(${p.score})`).join(', ')
      const botStatusMessage = `Auto Mode: ${biasMessage} | Picks: ${picksSummary}`
      onBotMessageChange(botStatusMessage)

      if (selectedPicks.length === 0) {
        console.log('[Portfolio V2] ⚠️ No viable picks (all below score threshold)')
        return
      }

      // Open new positions
      await openNewPositions(selectedPicks, top_longs, top_shorts)

    } catch (error) {
      handleError(`Failed to handle portfolio picks: ${error.message}`)
    }
  }

  /**
   * Close invalidated positions
   */
  const handleInvalidatedSymbols = async (invalidated) => {
    if (invalidated.length === 0) return

    console.log(`[Portfolio V2] 🚨 INVALIDATED (structure break): ${invalidated.join(', ')}`)

    for (const symbol of invalidated) {
      const existingPos = portfolioPositions.find(p => p.symbol === symbol)
      if (existingPos) {
        console.log(`[Portfolio V2] Closing ${symbol} - trend invalidated`)

        let symbolNetPnl = 0
        try {
          symbolNetPnl = await calculateNetPnl(orderManager, symbol)
        } catch (error) {
          console.error(`[Portfolio V2] Failed to get PNL for ${symbol}:`, error)
        }

        await closePosition(orderManager, symbol, symbolNetPnl)
        setPortfolioPositions(prev => prev.filter(p => p.symbol !== symbol))
      }
    }
  }

  /**
   * Determine BTC bias and allocate picks accordingly
   */
  const determineBTCBiasAndAllocate = async (allPicks) => {
    const btcBias = allPicks[0]?.market_bias || 'BTC_NEUTRAL'
    const btcScore = allPicks[0]?.btc_score || 0

    console.log(`[Portfolio V2] 🔍 BTC Market Bias: ${btcBias} (score: ${btcScore})`)

    // Check real-time BTC price action
    const { btc8HourChange, biasOverride, actualBtcTrend } = await checkBTCPriceAction(btcBias)

    // Sort picks by score
    const sortedLongs = allPicks.filter(p => p.side === 'LONG').sort((a, b) => b.score - a.score)
    const sortedShorts = allPicks.filter(p => p.side === 'SHORT').sort((a, b) => b.score - a.score)

    let selectedPicks = []
    const modeLabel = biasOverride ? `🚨 OVERRIDE (Server: ${btcBias})` : ''

    if (actualBtcTrend === 'BTC_BULLISH') {
      // BTC BULLISH: 2 LONGs + 1 SHORT
      console.log(`[Portfolio V2] 📈 BTC Bullish ${modeLabel} - Allocating 2 LONGs + 1 SHORT`)
      selectedPicks = [...sortedLongs.slice(0, 2), ...sortedShorts.slice(0, 1)]
    } else if (actualBtcTrend === 'BTC_BEARISH') {
      // BTC BEARISH: 1 LONG + 2 SHORTs
      console.log(`[Portfolio V2] 📉 BTC Bearish ${modeLabel} - Allocating 1 LONG + 2 SHORTs`)
      selectedPicks = [...sortedLongs.slice(0, 1), ...sortedShorts.slice(0, 2)]
    } else {
      // BTC NEUTRAL: Randomize
      console.log(`[Portfolio V2] ⚖️ BTC Neutral - Balanced allocation`)
      const favorLongs = Math.random() > 0.5
      selectedPicks = favorLongs
        ? [...sortedLongs.slice(0, 2), ...sortedShorts.slice(0, 1)]
        : [...sortedLongs.slice(0, 1), ...sortedShorts.slice(0, 2)]
    }

    // Fallback: fill with best available if insufficient picks
    if (selectedPicks.length < 3) {
      console.log(`[Portfolio V2] ⚠️ Insufficient picks (${selectedPicks.length}/3)`)
      const used = new Set(selectedPicks.map(p => p.symbol))
      const remaining = allPicks
        .filter(p => !used.has(p.symbol))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3 - selectedPicks.length)
      selectedPicks = [...selectedPicks, ...remaining]
    }

    // Create bias message
    const longsCount = selectedPicks.filter(p => p.side === 'LONG').length
    const shortsCount = selectedPicks.filter(p => p.side === 'SHORT').length
    
    let biasMessage = ''
    if (biasOverride) {
      biasMessage = actualBtcTrend === 'BTC_BEARISH'
        ? `🚨 OVERRIDE (Server: Bullish | 8H ${btc8HourChange.toFixed(2)}%) - SHORTS (${longsCount}L/${shortsCount}S)`
        : `🚨 OVERRIDE (Server: Bearish | 8H ${btc8HourChange.toFixed(2)}%) - LONGS (${longsCount}L/${shortsCount}S)`
    } else if (actualBtcTrend === 'BTC_BULLISH') {
      biasMessage = `📈 BTC Bullish (8H ${btc8HourChange.toFixed(2)}%) - Longs (${longsCount}L/${shortsCount}S)`
    } else if (actualBtcTrend === 'BTC_BEARISH') {
      biasMessage = `📉 BTC Bearish (8H ${btc8HourChange.toFixed(2)}%) - Shorts (${longsCount}L/${shortsCount}S)`
    } else {
      biasMessage = `⚖️ BTC Neutral - Balanced (${longsCount}L/${shortsCount}S)`
    }

    return { selectedPicks, biasMessage }
  }

  /**
   * Check real-time BTC price action to override server bias if needed
   */
  const checkBTCPriceAction = async (btcBias) => {
    let btc8HourChange = 0
    let biasOverride = false
    let actualBtcTrend = btcBias

    try {
      // Fetch last 3 4H candles (12 hours of data)
      const response4H = await fetch(
        'https://fapi.asterdex.com/fapi/v1/klines?symbol=BTCUSDT&interval=4h&limit=3'
      )

      if (response4H.ok) {
        const klines4H = await response4H.json()

        if (klines4H && klines4H.length === 3) {
          const price8HoursAgo = parseFloat(klines4H[0][4])
          const price4HoursAgo = parseFloat(klines4H[1][4])
          const currentPrice = parseFloat(klines4H[2][4])

          const btc4HourChange = ((currentPrice - price4HoursAgo) / price4HoursAgo) * 100
          btc8HourChange = ((currentPrice - price8HoursAgo) / price8HoursAgo) * 100

          console.log(`[Portfolio V2] 📊 BTC 4H Candle Check:`)
          console.log(`[Portfolio V2]   Last 4H: ${btc4HourChange.toFixed(2)}%`)
          console.log(`[Portfolio V2]   Last 8H: ${btc8HourChange.toFixed(2)}%`)

          // OVERRIDE SERVER BIAS if recent price action is strongly opposite
          if (btcBias === 'BTC_BULLISH' && btc8HourChange < -2.0) {
            console.warn(`[Portfolio V2] 🚨 IGNORING SERVER BIAS! Switching to BEARISH`)
            actualBtcTrend = 'BTC_BEARISH'
            biasOverride = true
          } else if (btcBias === 'BTC_BEARISH' && btc8HourChange > 2.0) {
            console.warn(`[Portfolio V2] 🚨 IGNORING SERVER BIAS! Switching to BULLISH`)
            actualBtcTrend = 'BTC_BULLISH'
            biasOverride = true
          } else if (btcBias === 'BTC_BULLISH' && btc4HourChange < -1.5) {
            console.warn(`[Portfolio V2] ⚠️ BIAS CONFLICT: Switching defensive shorts`)
            actualBtcTrend = 'BTC_BEARISH'
            biasOverride = true
          } else if (btcBias === 'BTC_BEARISH' && btc4HourChange > 1.5) {
            console.warn(`[Portfolio V2] ⚠️ BIAS CONFLICT: Switching defensive longs`)
            actualBtcTrend = 'BTC_BULLISH'
            biasOverride = true
          } else {
            console.log(`[Portfolio V2] ✅ Server's bias confirmed by price action`)
          }
        }
      }
    } catch (error) {
      console.error(`[Portfolio V2] Failed to fetch BTC price data:`, error.message)
    }

    return { btc8HourChange, biasOverride, actualBtcTrend }
  }

  /**
   * Open new positions for selected picks
   */
  const openNewPositions = async (selectedPicks, top_longs, top_shorts) => {
    const status = orderManager.getStatus()
    const currentPositionCount = status.activePositions ? status.activePositions.length : 0
    const currentOrderCount = status.activeOrders ? status.activeOrders.length : 0
    const currentTotalActive = currentPositionCount + currentOrderCount

    console.log(`[Portfolio V2] Current active: ${currentTotalActive}/3 (${currentPositionCount} positions + ${currentOrderCount} orders)`)

    const roomForNewPositions = Math.max(0, 3 - currentTotalActive)
    if (roomForNewPositions === 0) {
      console.log('[Portfolio V2] Already have 3 active - no room for new entries')
      return
    }

    const capitalNum = parseFloat(settings.capital)
    const newPicksToOpen = selectedPicks.slice(0, roomForNewPositions)
    const capitalPerPosition = capitalNum / 3

    console.log(`[Portfolio V2] Will open ${newPicksToOpen.length} position(s) with $${capitalPerPosition.toFixed(2)} each`)

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
          console.log(`[Portfolio V2] 🚫 Reached max 3 active - stopping`)
          break
        }

        const newPos = await openSinglePosition(pick, capitalPerPosition)
        if (newPos) {
          newPositions.push(newPos)
        }
      } catch (error) {
        console.error(`[Portfolio V2] Failed to open ${pick.symbol}:`, error.message)
        handleError(`Failed to open ${pick.symbol}: ${error.message}`)
      }
    }

    // Update portfolio state
    setPortfolioPositions(prev => {
      const merged = [...prev]
      for (const newPos of newPositions) {
        if (!merged.find(p => p.symbol === newPos.symbol)) {
          merged.push(newPos)
        }
      }
      return merged
    })

    // Update trading symbols
    setTradingSymbols(prev => {
      const symbols = [...new Set([...prev, ...newPositions.map(p => p.symbol)])]
      return symbols
    })
  }

  /**
   * Open a single position with split orders
   */
  const openSinglePosition = async (pick, capitalPerPosition) => {
    const [entryLow, entryHigh] = pick.entry_zone

    console.log(`[Portfolio V2] Opening ${pick.symbol} ${pick.side} (score: ${pick.score})`)
    console.log(`[Portfolio V2]   Entry Zone: $${entryLow} - $${entryHigh}`)
    console.log(`[Portfolio V2]   Invalidation: $${pick.invalidation_price}`)

    let leverage = Math.min(parseInt(settings.leverage), 125)
    const minLeverage = 1
    let orderResults = []

    while (leverage >= minLeverage && orderResults.length === 0) {
      try {
        console.log(`[Portfolio V2] Setting ${leverage}x leverage for ${pick.symbol}...`)
        await orderManager.dexService.setLeverage(pick.symbol, leverage)

        const marginToUse = capitalPerPosition
        const notionalValue = marginToUse * leverage

        console.log(`[Portfolio V2] Margin: $${marginToUse.toFixed(2)} @ ${leverage}x = Notional: $${notionalValue.toFixed(2)}`)

        // SPLIT ORDER ENTRY: 20% immediate + 80% better price
        const price1 = pick.side === 'LONG' ? entryHigh : entryLow
        const price2 = pick.side === 'LONG' ? entryLow : entryHigh

        const qty1 = (notionalValue * 0.2) / price1
        const qty2 = (notionalValue * 0.8) / price2

        // Place both orders
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

        break

      } catch (error) {
        const errorMsg = error.message.toLowerCase()
        if (errorMsg.includes('leverage') || errorMsg.includes('notional') ||
            errorMsg.includes('margin') || errorMsg.includes('balance')) {
          leverage = Math.max(1, Math.floor(leverage / 2))
          console.log(`[Portfolio V2] Retrying with ${leverage}x leverage...`)
        } else {
          throw error
        }
      }
    }

    if (orderResults.length === 0) {
      throw new Error(`Could not place orders for ${pick.symbol}`)
    }

    // Track orders in orderManager
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
    }

    const newPos = {
      symbol: pick.symbol,
      side: pick.side,
      score: pick.score,
      state: pick.state,
      entryZone: pick.entry_zone,
      invalidationPrice: pick.invalidation_price,
      structureStopLoss: pick.structure?.last_swing_low || pick.structure?.last_swing_high,
      size: capitalPerPosition,
      leverage: leverage,
      orderIds: orderResults.map(r => r.orderId),
      openedAt: Date.now(),
      serverTP: pick.take_profit,
      tpHit: false,
      isTrailing: false
    }

    // Update bot message
    const reasoning = pick.reasoning?.join(' ') || `${pick.side} ${pick.symbol} @ ${pick.score}/100`
    updateBotMessage(pick.symbol, reasoning)

    return newPos
  }

  return {
    handlePortfolioPicks
  }
}

/**
 * Handle signal status responses (every 5 minutes)
 */
export const createSignalStatusHandler = (dependencies) => {
  const {
    orderManager,
    settings,
    portfolioPositions,
    setPortfolioPositions,
    updateBotMessage,
    closePosition,
    handleError
  } = dependencies

  return async (message) => {
    try {
      if (!settings.autoMode) {
        console.log('[Signal Status] Skipping - Auto Mode not enabled')
        return
      }

      const signal = message
      const symbol = signal.symbol

      // Check if signal was not found
      if (signal.status === 'NOT_FOUND') {
        console.log(`[Signal Status] ⚠️ ${symbol} - No trend detected`)
        const existingPos = portfolioPositions.find(p => p.symbol === symbol)
        if (existingPos) {
          updateBotMessage(symbol, `⚠️ Trend lost - monitoring for exit`)
        }
        return
      }

      const { state, score, reasoning, invalidation_price, take_profit } = signal

      // Check for INVALIDATED state
      if (state === 'INVALIDATED') {
        console.log(`[Signal Status] 🚨 ${symbol} INVALIDATED (structure broke)`)

        const existingPos = portfolioPositions.find(p => p.symbol === symbol)
        if (existingPos) {
          let symbolNetPnl = 0
          try {
            symbolNetPnl = await calculateNetPnl(orderManager, symbol)
          } catch (error) {
            console.error(`[Signal Status] Failed to get PNL for ${symbol}:`, error)
          }

          await closePosition(orderManager, symbol, symbolNetPnl)
          setPortfolioPositions(prev => prev.filter(p => p.symbol !== symbol))
        }
        return
      }

      // Update bot message
      const existingPos = portfolioPositions.find(p => p.symbol === symbol)
      if (!existingPos?.isTrailing) {
        const reasoningText = reasoning?.join(' ') || `${signal.side} ${symbol} @ ${score}/100`
        updateBotMessage(symbol, reasoningText)
      }

      // Update portfolio position data
      setPortfolioPositions(prev => prev.map(p => {
        if (p.symbol === symbol) {
          return {
            ...p,
            invalidationPrice: invalidation_price,
            score: score,
            state: state,
            serverTP: take_profit || p.serverTP,
            // Preserve trailing state
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

      console.log(`[Signal Status] ✅ ${symbol} updated: score=${score}, state=${state}`)
    } catch (error) {
      handleError(`Failed to handle signal status: ${error.message}`)
    }
  }
}

