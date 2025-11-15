import { ENTRY_FEE, EXIT_FEE } from './constants'

/**
 * Format quantity according to stepSize (round down to valid step)
 */
export const formatQuantityToStepSize = (quantity, stepSize) => {
  const step = parseFloat(stepSize)
  const rounded = Math.floor(quantity / step) * step
  const decimals = stepSize.includes('.') ? stepSize.split('.')[1].length : 0
  return parseFloat(rounded.toFixed(decimals))
}

/**
 * Close position in chunks (respecting MARKET_LOT_SIZE limits)
 */
export const closePositionInChunks = async (orderManager, symbol, logPrefix = '[ClosePosition]') => {
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

/**
 * Calculate Net PNL for a symbol (includes fees)
 */
export const calculateNetPnl = async (orderManager, symbol) => {
  const currentPosition = await orderManager.dexService.getPosition(symbol)
  const unrealizedProfit = parseFloat(currentPosition.unRealizedProfit || '0')
  const entryPrice = parseFloat(currentPosition.entryPrice || '0')
  const positionAmt = Math.abs(parseFloat(currentPosition.positionAmt || '0'))
  const markPrice = parseFloat(currentPosition.markPrice || '0')
  
  // Calculate fees
  const entryNotional = positionAmt * entryPrice
  const exitNotional = positionAmt * markPrice
  const entryFee = entryNotional * ENTRY_FEE
  const exitFee = exitNotional * EXIT_FEE
  const totalFees = entryFee + exitFee
  
  return unrealizedProfit - totalFees
}

/**
 * Save stats to localStorage
 */
export const saveStats = (statsKey, overallPnl, totalTrades) => {
  const stats = {
    overallPnl: overallPnl,
    totalTrades: totalTrades,
    lastUpdated: Date.now()
  }
  localStorage.setItem(statsKey, JSON.stringify(stats))
  console.log(`[Stats] Saved:`, stats)
}

