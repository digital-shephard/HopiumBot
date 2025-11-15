// Client-side indicator calculations for strategy conditions
// Calculates RSI, MACD, EMA, SMA, and other technical indicators

export class IndicatorCalculator {
  /**
   * Calculate RSI (Relative Strength Index)
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} periods - RSI period (default 14)
   * @returns {number} RSI value (0-100)
   */
  static calculateRSI(candles, periods = 14) {
    if (!candles || candles.length < periods + 1) {
      console.warn('[IndicatorCalculator] Insufficient candles for RSI calculation');
      return 50; // Neutral value
    }
    
    // Extract closing prices (index 4 in Binance candle format)
    const closes = candles.map(c => parseFloat(c[4]));
    
    // Calculate price changes
    let gains = 0;
    let losses = 0;
    
    for (let i = closes.length - periods; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    const avgGain = gains / periods;
    const avgLoss = losses / periods;
    
    if (avgLoss === 0) {
      return 100; // No losses means max RSI
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi * 100) / 100; // Round to 2 decimals
  }
  
  /**
   * Calculate EMA (Exponential Moving Average)
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} periods - EMA period
   * @returns {number} EMA value
   */
  static calculateEMA(candles, periods) {
    if (!candles || candles.length < periods) {
      console.warn('[IndicatorCalculator] Insufficient candles for EMA calculation');
      return 0;
    }
    
    const closes = candles.map(c => parseFloat(c[4]));
    const k = 2 / (periods + 1); // Smoothing factor
    
    // Start with SMA for first EMA value
    let ema = closes.slice(0, periods).reduce((sum, val) => sum + val, 0) / periods;
    
    // Calculate EMA for remaining values
    for (let i = periods; i < closes.length; i++) {
      ema = (closes[i] * k) + (ema * (1 - k));
    }
    
    return Math.round(ema * 100) / 100;
  }
  
  /**
   * Calculate SMA (Simple Moving Average)
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} periods - SMA period
   * @returns {number} SMA value
   */
  static calculateSMA(candles, periods) {
    if (!candles || candles.length < periods) {
      console.warn('[IndicatorCalculator] Insufficient candles for SMA calculation');
      return 0;
    }
    
    const closes = candles.map(c => parseFloat(c[4]));
    const recentCloses = closes.slice(-periods);
    const sum = recentCloses.reduce((acc, val) => acc + val, 0);
    
    return Math.round((sum / periods) * 100) / 100;
  }
  
  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} fastPeriod - Fast EMA period (default 12)
   * @param {number} slowPeriod - Slow EMA period (default 26)
   * @param {number} signalPeriod - Signal line period (default 9)
   * @returns {Object} { macd, signal, histogram, isBullish, isBearish }
   */
  static calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!candles || candles.length < slowPeriod + signalPeriod) {
      console.warn('[IndicatorCalculator] Insufficient candles for MACD calculation');
      return {
        macd: 0,
        signal: 0,
        histogram: 0,
        isBullish: false,
        isBearish: false
      };
    }
    
    const closes = candles.map(c => parseFloat(c[4]));
    
    // Calculate EMAs
    const fastEMA = this.calculateEMAArray(closes, fastPeriod);
    const slowEMA = this.calculateEMAArray(closes, slowPeriod);
    
    // Calculate MACD line (fast - slow)
    const macdLine = [];
    for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
    
    // Calculate signal line (EMA of MACD)
    const signalLine = this.calculateEMAArray(macdLine, signalPeriod);
    
    // Current values
    const macd = macdLine[macdLine.length - 1];
    const signal = signalLine[signalLine.length - 1];
    const histogram = macd - signal;
    
    // Previous values for crossover detection
    const prevMacd = macdLine[macdLine.length - 2];
    const prevSignal = signalLine[signalLine.length - 2];
    
    // Detect crossovers
    const isBullish = prevMacd <= prevSignal && macd > signal; // Bullish crossover
    const isBearish = prevMacd >= prevSignal && macd < signal; // Bearish crossover
    
    return {
      macd: Math.round(macd * 100) / 100,
      signal: Math.round(signal * 100) / 100,
      histogram: Math.round(histogram * 100) / 100,
      isBullish,
      isBearish
    };
  }
  
  /**
   * Calculate EMA array (all values)
   * @param {Array} values - Array of values
   * @param {number} periods - EMA period
   * @returns {Array} Array of EMA values
   */
  static calculateEMAArray(values, periods) {
    if (values.length < periods) {
      return [];
    }
    
    const k = 2 / (periods + 1);
    const emaArray = [];
    
    // Start with SMA
    let ema = values.slice(0, periods).reduce((sum, val) => sum + val, 0) / periods;
    emaArray.push(ema);
    
    // Calculate remaining EMAs
    for (let i = periods; i < values.length; i++) {
      ema = (values[i] * k) + (ema * (1 - k));
      emaArray.push(ema);
    }
    
    return emaArray;
  }
  
  /**
   * Check if price crossed above a level
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} level - Price level
   * @returns {boolean} True if crossed above
   */
  static priceCrossedAbove(candles, level) {
    if (!candles || candles.length < 2) {
      return false;
    }
    
    const currentClose = parseFloat(candles[candles.length - 1][4]);
    const previousClose = parseFloat(candles[candles.length - 2][4]);
    
    return previousClose <= level && currentClose > level;
  }
  
  /**
   * Check if price crossed below a level
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} level - Price level
   * @returns {boolean} True if crossed below
   */
  static priceCrossedBelow(candles, level) {
    if (!candles || candles.length < 2) {
      return false;
    }
    
    const currentClose = parseFloat(candles[candles.length - 1][4]);
    const previousClose = parseFloat(candles[candles.length - 2][4]);
    
    return previousClose >= level && currentClose < level;
  }
  
  /**
   * Check if EMA fast crossed above EMA slow (golden cross)
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} fastPeriod - Fast EMA period
   * @param {number} slowPeriod - Slow EMA period
   * @returns {boolean} True if golden cross occurred
   */
  static goldenCross(candles, fastPeriod, slowPeriod) {
    if (!candles || candles.length < slowPeriod + 1) {
      return false;
    }
    
    const closes = candles.map(c => parseFloat(c[4]));
    
    // Current EMAs
    const currentFast = this.calculateEMA(candles, fastPeriod);
    const currentSlow = this.calculateEMA(candles, slowPeriod);
    
    // Previous EMAs (using all but last candle)
    const previousCandles = candles.slice(0, -1);
    const previousFast = this.calculateEMA(previousCandles, fastPeriod);
    const previousSlow = this.calculateEMA(previousCandles, slowPeriod);
    
    // Check for crossover
    return previousFast <= previousSlow && currentFast > currentSlow;
  }
  
  /**
   * Check if EMA fast crossed below EMA slow (death cross)
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} fastPeriod - Fast EMA period
   * @param {number} slowPeriod - Slow EMA period
   * @returns {boolean} True if death cross occurred
   */
  static deathCross(candles, fastPeriod, slowPeriod) {
    if (!candles || candles.length < slowPeriod + 1) {
      return false;
    }
    
    const closes = candles.map(c => parseFloat(c[4]));
    
    // Current EMAs
    const currentFast = this.calculateEMA(candles, fastPeriod);
    const currentSlow = this.calculateEMA(candles, slowPeriod);
    
    // Previous EMAs
    const previousCandles = candles.slice(0, -1);
    const previousFast = this.calculateEMA(previousCandles, fastPeriod);
    const previousSlow = this.calculateEMA(previousCandles, slowPeriod);
    
    // Check for crossover
    return previousFast >= previousSlow && currentFast < currentSlow;
  }
  
  /**
   * Calculate Bollinger Bands
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} periods - Period (default 20)
   * @param {number} stdDev - Standard deviation multiplier (default 2)
   * @returns {Object} { upper, middle, lower, isAboveUpper, isBelowLower }
   */
  static calculateBollingerBands(candles, periods = 20, stdDev = 2) {
    if (!candles || candles.length < periods) {
      console.warn('[IndicatorCalculator] Insufficient candles for Bollinger Bands');
      return {
        upper: 0,
        middle: 0,
        lower: 0,
        isAboveUpper: false,
        isBelowLower: false
      };
    }
    
    const closes = candles.map(c => parseFloat(c[4]));
    const recentCloses = closes.slice(-periods);
    
    // Calculate SMA (middle band)
    const middle = recentCloses.reduce((sum, val) => sum + val, 0) / periods;
    
    // Calculate standard deviation
    const variance = recentCloses.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / periods;
    const sd = Math.sqrt(variance);
    
    const upper = middle + (stdDev * sd);
    const lower = middle - (stdDev * sd);
    
    const currentPrice = closes[closes.length - 1];
    
    return {
      upper: Math.round(upper * 100) / 100,
      middle: Math.round(middle * 100) / 100,
      lower: Math.round(lower * 100) / 100,
      isAboveUpper: currentPrice > upper,
      isBelowLower: currentPrice < lower
    };
  }
  
  /**
   * Calculate ATR (Average True Range)
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} periods - Period (default 14)
   * @returns {number} ATR value
   */
  static calculateATR(candles, periods = 14) {
    if (!candles || candles.length < periods + 1) {
      console.warn('[IndicatorCalculator] Insufficient candles for ATR calculation');
      return 0;
    }
    
    const trueRanges = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = parseFloat(candles[i][2]);
      const low = parseFloat(candles[i][3]);
      const prevClose = parseFloat(candles[i - 1][4]);
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }
    
    // Calculate ATR as average of true ranges
    const recentTR = trueRanges.slice(-periods);
    const atr = recentTR.reduce((sum, val) => sum + val, 0) / periods;
    
    return Math.round(atr * 100) / 100;
  }
  
  /**
   * Get current price from candles
   * @param {Array} candles - Array of OHLCV candles
   * @returns {number} Current close price
   */
  static getCurrentPrice(candles) {
    if (!candles || candles.length === 0) {
      return 0;
    }
    
    return parseFloat(candles[candles.length - 1][4]);
  }
  
  /**
   * Calculate percentage change
   * @param {Array} candles - Array of OHLCV candles
   * @param {number} periods - Number of candles to look back
   * @returns {number} Percentage change
   */
  static calculatePercentageChange(candles, periods) {
    if (!candles || candles.length < periods + 1) {
      return 0;
    }
    
    const currentClose = parseFloat(candles[candles.length - 1][4]);
    const previousClose = parseFloat(candles[candles.length - 1 - periods][4]);
    
    const change = ((currentClose - previousClose) / previousClose) * 100;
    
    return Math.round(change * 100) / 100;
  }
  
  /**
   * Detect candle patterns
   * @param {Array} candles - Array of OHLCV candles
   * @returns {Object} Detected patterns
   */
  static detectPatterns(candles) {
    if (!candles || candles.length < 3) {
      return {
        bullishEngulfing: false,
        bearishEngulfing: false,
        doji: false,
        hammer: false,
        shootingStar: false
      };
    }
    
    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    
    const [, cOpen, cHigh, cLow, cClose] = current.map(parseFloat);
    const [, pOpen, pHigh, pLow, pClose] = previous.map(parseFloat);
    
    const cBody = Math.abs(cClose - cOpen);
    const cRange = cHigh - cLow;
    const cUpperWick = cHigh - Math.max(cOpen, cClose);
    const cLowerWick = Math.min(cOpen, cClose) - cLow;
    
    return {
      bullishEngulfing: pClose < pOpen && cClose > cOpen && cOpen < pClose && cClose > pOpen,
      bearishEngulfing: pClose > pOpen && cClose < cOpen && cOpen > pClose && cClose < pOpen,
      doji: cBody < (cRange * 0.1),
      hammer: cLowerWick > (cBody * 2) && cUpperWick < (cBody * 0.5) && cClose > cOpen,
      shootingStar: cUpperWick > (cBody * 2) && cLowerWick < (cBody * 0.5) && cClose < cOpen
    };
  }
}

export default IndicatorCalculator;

