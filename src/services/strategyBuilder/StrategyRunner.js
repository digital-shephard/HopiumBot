// Strategy execution engine
// Runs custom strategies on intervals and executes trades

import { IndicatorCalculator } from './IndicatorCalculator';
import { StrategyStorage } from './StrategyStorage';
import { getBlockDefinition } from './blockDefinitions';

export class StrategyRunner {
  constructor(strategy, orderManager, dexService, onLog = null) {
    this.strategy = strategy;
    this.orderManager = orderManager;
    this.dexService = dexService;
    this.onLog = onLog; // Callback for execution logs
    this.running = false;
    this.intervalId = null;
    this.lastSignalFetch = 0;
    this.signalCache = new Map(); // Cache server signals (rate limited)
    this.SIGNAL_CACHE_DURATION = 60000; // 1 minute
  }

  /**
   * Start the strategy runner
   */
  start() {
    if (this.running) {
      this.log('Already running', 'warning');
      return;
    }

    this.running = true;
    this.log('Strategy started', 'info');

    // Run immediately
    this.execute();

    // Then run every interval
    this.intervalId = setInterval(() => {
      this.execute();
    }, this.strategy.interval * 1000);
  }

  /**
   * Stop the strategy runner
   */
  stop() {
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.log('Strategy stopped', 'info');
  }

  /**
   * Execute strategy (main loop)
   */
  async execute() {
    if (!this.running) {
      return;
    }

    const startTime = Date.now();
    this.log('Executing strategy...', 'info');

    try {
      // Check if strategy is still enabled
      if (!this.strategy.enabled) {
        this.log('Strategy is disabled, stopping...', 'warning');
        this.stop();
        return;
      }

      // Check cooldown
      if (this.isInCooldown()) {
        const remaining = this.getCooldownRemaining();
        this.log(`In cooldown, ${remaining}s remaining`, 'info');
        return;
      }

      // Build context (fetch data)
      const context = await this.buildContext();

      // Evaluate conditions
      const conditionsPassed = await this.evaluateConditions(context);

      if (!conditionsPassed) {
        this.log('Conditions not met', 'info');
        this.updateStrategy(false);
        return;
      }

      this.log('✅ All conditions met!', 'success');

      // Execute actions
      const actionResults = await this.executeActions(context);

      // Update strategy
      this.updateStrategy(true, actionResults);

      const duration = Date.now() - startTime;
      this.log(`Execution completed in ${duration}ms`, 'success');
    } catch (error) {
      console.error('[StrategyRunner] Execution error:', error);
      this.log(`Error: ${error.message}`, 'error');
      this.handleError(error);
    }
  }

  /**
   * Build execution context (fetch all required data)
   */
  async buildContext() {
    const { symbol } = this.strategy;

    this.log(`Fetching data for ${symbol}...`, 'info');

    // Determine required timeframes from condition blocks
    const timeframes = this.getRequiredTimeframes();

    // Fetch current price
    const price = await this.dexService.getCurrentPrice(symbol);

    // Fetch position
    const position = await this.dexService.getPosition(symbol);

    // Fetch candles for each required timeframe
    const candles = {};
    for (const tf of timeframes) {
      candles[tf] = await this.dexService.getKlines(symbol, tf, 100);
    }

    // Fetch server signal if needed (rate limited)
    let signal = null;
    if (this.needsServerSignal()) {
      signal = await this.fetchServerSignal(symbol);
    }

    return {
      price,
      position,
      candles,
      signal,
      timestamp: Date.now()
    };
  }

  /**
   * Get required timeframes from condition blocks
   */
  getRequiredTimeframes() {
    const timeframes = new Set(['15m']); // Default timeframe

    for (const block of this.strategy.blocks.conditions) {
      if (block.params && block.params.timeframe) {
        timeframes.add(block.params.timeframe);
      }
    }

    return Array.from(timeframes);
  }

  /**
   * Check if any condition block needs server signal
   */
  needsServerSignal() {
    return this.strategy.blocks.conditions.some(
      block => block.type === 'signal_side' || block.type === 'signal_confidence'
    );
  }

  /**
   * Fetch server signal (rate limited, cached)
   */
  async fetchServerSignal(symbol) {
    const now = Date.now();
    const cacheKey = symbol;

    // Check cache
    if (this.signalCache.has(cacheKey)) {
      const cached = this.signalCache.get(cacheKey);
      if (now - cached.timestamp < this.SIGNAL_CACHE_DURATION) {
        this.log('Using cached server signal', 'info');
        return cached.signal;
      }
    }

    // Rate limit (1 request per minute)
    if (now - this.lastSignalFetch < 60000) {
      this.log('Server signal rate limited, using cached data', 'warning');
      return this.signalCache.get(cacheKey)?.signal || null;
    }

    try {
      this.log('Fetching server signal...', 'info');
      
      // Fetch from momentum strategy (you can make this configurable)
      const signal = await this.orderManager.signalService.getLatestSignal(symbol);
      
      this.lastSignalFetch = now;
      this.signalCache.set(cacheKey, { signal, timestamp: now });

      return signal;
    } catch (error) {
      console.error('[StrategyRunner] Error fetching signal:', error);
      return null;
    }
  }

  /**
   * Evaluate all conditions
   */
  async evaluateConditions(context) {
    const { conditions, connections } = this.strategy.blocks;

    // Build evaluation graph
    const results = new Map();

    // Evaluate all condition blocks
    for (const block of conditions) {
      try {
        const result = await this.evaluateBlock(block, context, results);
        results.set(block.id, result);
        
        const status = result ? '✅' : '❌';
        this.log(`${status} ${this.getBlockLabel(block)}: ${result}`, 'info');
      } catch (error) {
        console.error('[StrategyRunner] Error evaluating block:', block.id, error);
        this.log(`Error evaluating ${block.id}: ${error.message}`, 'error');
        results.set(block.id, false);
      }
    }

    // Find terminal condition blocks (blocks that connect to actions)
    const actionIds = new Set(this.strategy.blocks.actions.map(a => a.id));
    const terminalConditions = [];

    for (const conn of connections) {
      if (actionIds.has(conn.to)) {
        // This connection goes to an action
        // The 'from' block is a terminal condition
        terminalConditions.push(conn.from);
      }
    }

    // All terminal conditions must be true
    if (terminalConditions.length === 0) {
      // No connections to actions means conditions are not properly wired
      return false;
    }

    for (const blockId of terminalConditions) {
      if (!results.get(blockId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single block
   */
  async evaluateBlock(block, context, results) {
    const { type, params } = block;

    // Check if this is a logic block
    if (type === 'and' || type === 'or' || type === 'not') {
      return this.evaluateLogicBlock(block, results);
    }

    // Evaluate condition block
    switch (type) {
      // ==================== PRICE CONDITIONS ====================
      case 'price_above':
        return context.price > params.value;

      case 'price_below':
        return context.price < params.value;

      case 'price_crossed_above': {
        const tf = params.timeframe || '15m';
        const candles = context.candles[tf];
        return IndicatorCalculator.priceCrossedAbove(candles, params.value);
      }

      case 'price_crossed_below': {
        const tf = params.timeframe || '15m';
        const candles = context.candles[tf];
        return IndicatorCalculator.priceCrossedBelow(candles, params.value);
      }

      // ==================== INDICATOR CONDITIONS ====================
      case 'rsi': {
        const tf = params.timeframe || '15m';
        const candles = context.candles[tf];
        const rsi = IndicatorCalculator.calculateRSI(candles, params.periods);

        if (params.operator === 'less_than') {
          return rsi < params.value;
        } else if (params.operator === 'greater_than') {
          return rsi > params.value;
        } else {
          return Math.abs(rsi - params.value) < 1;
        }
      }

      case 'macd': {
        const tf = params.timeframe || '15m';
        const candles = context.candles[tf];
        const macd = IndicatorCalculator.calculateMACD(candles);

        switch (params.condition) {
          case 'bullish_crossover':
            return macd.isBullish;
          case 'bearish_crossover':
            return macd.isBearish;
          case 'above_signal':
            return macd.macd > macd.signal;
          case 'below_signal':
            return macd.macd < macd.signal;
          default:
            return false;
        }
      }

      case 'ema_cross': {
        const tf = params.timeframe || '15m';
        const candles = context.candles[tf];

        if (params.condition === 'golden_cross') {
          return IndicatorCalculator.goldenCross(candles, params.fastPeriod, params.slowPeriod);
        } else {
          return IndicatorCalculator.deathCross(candles, params.fastPeriod, params.slowPeriod);
        }
      }

      // ==================== SERVER SIGNAL CONDITIONS ====================
      case 'signal_side':
        if (!context.signal) return false;
        return context.signal.side === params.side;

      case 'signal_confidence':
        if (!context.signal) return false;
        
        const confidenceLevels = { low: 1, medium: 2, high: 3 };
        const signalLevel = confidenceLevels[context.signal.confidence] || 0;
        const requiredLevel = confidenceLevels[params.minConfidence] || 3;
        
        return signalLevel >= requiredLevel;

      // ==================== POSITION CONDITIONS ====================
      case 'no_position':
        return Math.abs(parseFloat(context.position.positionAmt || 0)) === 0;

      case 'has_position':
        return Math.abs(parseFloat(context.position.positionAmt || 0)) > 0;

      case 'position_side': {
        const positionAmt = parseFloat(context.position.positionAmt || 0);
        if (positionAmt === 0) return false;

        if (params.side === 'LONG') {
          return positionAmt > 0;
        } else {
          return positionAmt < 0;
        }
      }

      case 'position_pnl': {
        const pnl = parseFloat(context.position.unRealizedProfit || 0);

        if (params.operator === 'greater_than') {
          return pnl > params.value;
        } else {
          return pnl < params.value;
        }
      }

      case 'position_duration': {
        // Calculate position duration from entry time
        // This requires tracking entry time (can be added to context)
        // For now, return false
        return false;
      }

      default:
        console.warn('[StrategyRunner] Unknown condition type:', type);
        return false;
    }
  }

  /**
   * Evaluate logic block (AND/OR/NOT)
   */
  evaluateLogicBlock(block, results) {
    const { type } = block;

    // Find input connections
    const connections = this.strategy.blocks.connections.filter(conn => conn.to === block.id);
    const inputs = connections.map(conn => results.get(conn.from));

    switch (type) {
      case 'and':
        return inputs.length > 0 && inputs.every(val => val === true);
      
      case 'or':
        return inputs.length > 0 && inputs.some(val => val === true);
      
      case 'not':
        return inputs.length > 0 && !inputs[0];
      
      default:
        return false;
    }
  }

  /**
   * Execute all action blocks
   */
  async executeActions(context) {
    const { actions } = this.strategy.blocks;
    const results = [];

    for (const action of actions) {
      try {
        this.log(`Executing: ${this.getBlockLabel(action)}`, 'info');
        const result = await this.executeAction(action, context);
        results.push({ action: action.id, success: true, result });
      } catch (error) {
        console.error('[StrategyRunner] Error executing action:', action.id, error);
        this.log(`Action failed: ${error.message}`, 'error');
        results.push({ action: action.id, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Execute a single action block
   */
  async executeAction(action, context) {
    const { type, params } = action;
    const { symbol } = this.strategy;

    switch (type) {
      case 'open_long': {
        const signal = {
          symbol: symbol,
          side: 'LONG',
          confidence: 'high',
          limit_price: context.price,
          source: 'custom_strategy',
          strategy_id: this.strategy.id
        };

        // Set leverage and position size from params
        if (params.leverage) {
          // This needs to be handled by orderManager
          // For now, we'll pass it in the signal
          signal.leverage = params.leverage;
        }

        if (params.size) {
          signal.positionSize = params.size; // Percentage
        }

        this.log(`Opening LONG position: ${symbol} @ $${context.price}`, 'success');
        
        // Use orderManager to execute
        const result = await this.orderManager.handleScalpSignal(signal);
        
        return result;
      }

      case 'open_short': {
        const signal = {
          symbol: symbol,
          side: 'SHORT',
          confidence: 'high',
          limit_price: context.price,
          source: 'custom_strategy',
          strategy_id: this.strategy.id
        };

        if (params.leverage) {
          signal.leverage = params.leverage;
        }

        if (params.size) {
          signal.positionSize = params.size;
        }

        this.log(`Opening SHORT position: ${symbol} @ $${context.price}`, 'success');
        
        const result = await this.orderManager.handleScalpSignal(signal);
        
        return result;
      }

      case 'close_position': {
        this.log(`Closing position: ${symbol}`, 'success');
        
        // Call close position via orderManager
        if (this.orderManager.onClosePosition) {
          const result = await this.orderManager.onClosePosition(symbol);
          return result;
        } else {
          throw new Error('Close position not supported by orderManager');
        }
      }

      case 'modify_tp_sl': {
        this.log(`Modifying TP/SL for ${symbol}`, 'info');
        
        // This would need to be implemented in orderManager
        // For now, log a warning
        this.log('Modify TP/SL not yet implemented', 'warning');
        
        return { message: 'Feature not yet implemented' };
      }

      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  /**
   * Get human-readable label for a block
   */
  getBlockLabel(block) {
    const definition = getBlockDefinition(block.type);
    return definition ? definition.label : block.type;
  }

  /**
   * Check if strategy is in cooldown
   */
  isInCooldown() {
    if (!this.strategy.lastAction) {
      return false;
    }

    const timeSinceLastAction = (Date.now() - this.strategy.lastAction) / 1000;
    return timeSinceLastAction < this.strategy.cooldown;
  }

  /**
   * Get remaining cooldown time
   */
  getCooldownRemaining() {
    if (!this.strategy.lastAction) {
      return 0;
    }

    const timeSinceLastAction = (Date.now() - this.strategy.lastAction) / 1000;
    const remaining = Math.max(0, this.strategy.cooldown - timeSinceLastAction);
    
    return Math.ceil(remaining);
  }

  /**
   * Update strategy after execution
   */
  updateStrategy(actionTaken = false, results = []) {
    this.strategy.lastRun = Date.now();
    
    if (actionTaken) {
      this.strategy.lastAction = Date.now();
    }

    this.strategy.errorCount = 0; // Reset error count on successful execution

    // Log execution
    StrategyStorage.logExecution(this.strategy.id, {
      success: true,
      actionTaken,
      results,
      timestamp: Date.now()
    });

    // Save to storage
    StrategyStorage.save(this.strategy);
  }

  /**
   * Handle execution error
   */
  handleError(error) {
    this.strategy.errorCount++;
    this.strategy.lastError = error.message;

    if (this.strategy.errorCount >= this.strategy.maxErrors) {
      console.error('[StrategyRunner] Max errors reached, disabling strategy');
      this.log(`Max errors reached (${this.strategy.maxErrors}), disabling strategy`, 'error');
      
      this.strategy.enabled = false;
      this.stop();
    }

    // Log execution error
    StrategyStorage.logExecution(this.strategy.id, {
      success: false,
      error: error.message,
      timestamp: Date.now()
    });

    // Save to storage
    StrategyStorage.save(this.strategy);
  }

  /**
   * Log message (with optional callback)
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      strategyId: this.strategy.id,
      strategyName: this.strategy.name
    };

    console.log(`[Strategy: ${this.strategy.name}] ${message}`);

    if (this.onLog) {
      this.onLog(logEntry);
    }
  }
}

export default StrategyRunner;

