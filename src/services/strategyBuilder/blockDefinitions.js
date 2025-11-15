// Block type definitions for the visual strategy builder
// Each block has a unique ID, category, label, color, icon, and input configuration

export const BLOCK_TYPES = {
  CONDITIONS: {
    // ==================== PRICE CONDITIONS ====================
    PRICE_ABOVE: {
      id: 'price_above',
      category: 'price',
      label: 'Price Above',
      color: '#10b981', // Green
      icon: '📈',
      description: 'Triggers when price is above a threshold',
      inputs: [
        { 
          name: 'value', 
          type: 'number', 
          label: 'Price', 
          required: true,
          min: 0,
          step: 0.01,
          placeholder: 'Enter price'
        }
      ]
    },
    
    PRICE_BELOW: {
      id: 'price_below',
      category: 'price',
      label: 'Price Below',
      color: '#ef4444', // Red
      icon: '📉',
      description: 'Triggers when price is below a threshold',
      inputs: [
        { 
          name: 'value', 
          type: 'number', 
          label: 'Price', 
          required: true,
          min: 0,
          step: 0.01,
          placeholder: 'Enter price'
        }
      ]
    },
    
    PRICE_CROSSED_ABOVE: {
      id: 'price_crossed_above',
      category: 'price',
      label: 'Price Crossed Above',
      color: '#10b981',
      icon: '↗️',
      description: 'Triggers when price crosses above (previous candle below, current above)',
      inputs: [
        { 
          name: 'value', 
          type: 'number', 
          label: 'Price', 
          required: true,
          min: 0,
          step: 0.01,
          placeholder: 'Enter price'
        }
      ]
    },
    
    PRICE_CROSSED_BELOW: {
      id: 'price_crossed_below',
      category: 'price',
      label: 'Price Crossed Below',
      color: '#ef4444',
      icon: '↘️',
      description: 'Triggers when price crosses below (previous candle above, current below)',
      inputs: [
        { 
          name: 'value', 
          type: 'number', 
          label: 'Price', 
          required: true,
          min: 0,
          step: 0.01,
          placeholder: 'Enter price'
        }
      ]
    },
    
    // ==================== INDICATOR CONDITIONS ====================
    RSI: {
      id: 'rsi',
      category: 'indicator',
      label: 'RSI',
      color: '#8b5cf6', // Purple
      icon: '📊',
      description: 'Relative Strength Index - measures momentum',
      inputs: [
        { 
          name: 'timeframe', 
          type: 'select', 
          label: 'Timeframe',
          options: [
            { value: '1m', label: '1 Minute' },
            { value: '5m', label: '5 Minutes' },
            { value: '15m', label: '15 Minutes' },
            { value: '1h', label: '1 Hour' },
            { value: '4h', label: '4 Hours' }
          ],
          default: '15m',
          required: true
        },
        { 
          name: 'periods', 
          type: 'number', 
          label: 'Periods',
          default: 14,
          min: 2,
          max: 100,
          required: true
        },
        { 
          name: 'operator', 
          type: 'select', 
          label: 'Operator',
          options: [
            { value: 'greater_than', label: 'Greater Than (>)' },
            { value: 'less_than', label: 'Less Than (<)' },
            { value: 'equals', label: 'Equals (=)' }
          ],
          default: 'less_than',
          required: true
        },
        { 
          name: 'value', 
          type: 'number', 
          label: 'Threshold', 
          default: 30,
          min: 0,
          max: 100,
          required: true,
          help: 'Oversold < 30, Overbought > 70'
        }
      ]
    },
    
    MACD: {
      id: 'macd',
      category: 'indicator',
      label: 'MACD',
      color: '#8b5cf6',
      icon: '📈',
      description: 'Moving Average Convergence Divergence',
      inputs: [
        { 
          name: 'timeframe', 
          type: 'select', 
          label: 'Timeframe',
          options: [
            { value: '1m', label: '1 Minute' },
            { value: '5m', label: '5 Minutes' },
            { value: '15m', label: '15 Minutes' },
            { value: '1h', label: '1 Hour' },
            { value: '4h', label: '4 Hours' }
          ],
          default: '15m',
          required: true
        },
        { 
          name: 'condition', 
          type: 'select', 
          label: 'Condition',
          options: [
            { value: 'bullish_crossover', label: 'Bullish Crossover' },
            { value: 'bearish_crossover', label: 'Bearish Crossover' },
            { value: 'above_signal', label: 'MACD Above Signal' },
            { value: 'below_signal', label: 'MACD Below Signal' }
          ],
          default: 'bullish_crossover',
          required: true
        }
      ]
    },
    
    EMA_CROSS: {
      id: 'ema_cross',
      category: 'indicator',
      label: 'EMA Cross',
      color: '#8b5cf6',
      icon: '〰️',
      description: 'Exponential Moving Average crossover',
      inputs: [
        { 
          name: 'timeframe', 
          type: 'select', 
          label: 'Timeframe',
          options: [
            { value: '1m', label: '1 Minute' },
            { value: '5m', label: '5 Minutes' },
            { value: '15m', label: '15 Minutes' },
            { value: '1h', label: '1 Hour' },
            { value: '4h', label: '4 Hours' }
          ],
          default: '15m',
          required: true
        },
        { 
          name: 'fastPeriod', 
          type: 'number', 
          label: 'Fast EMA',
          default: 9,
          min: 2,
          max: 200,
          required: true
        },
        { 
          name: 'slowPeriod', 
          type: 'number', 
          label: 'Slow EMA',
          default: 21,
          min: 2,
          max: 200,
          required: true
        },
        { 
          name: 'condition', 
          type: 'select', 
          label: 'Condition',
          options: [
            { value: 'golden_cross', label: 'Golden Cross (Fast > Slow)' },
            { value: 'death_cross', label: 'Death Cross (Fast < Slow)' }
          ],
          default: 'golden_cross',
          required: true
        }
      ]
    },
    
    // ==================== SERVER SIGNAL CONDITIONS ====================
    SIGNAL_SIDE: {
      id: 'signal_side',
      category: 'signal',
      label: 'Signal Direction',
      color: '#f59e0b', // Orange
      icon: '🎯',
      description: 'Checks server signal direction for a strategy',
      inputs: [
        { 
          name: 'strategy', 
          type: 'select', 
          label: 'Strategy',
          options: [
            { value: 'momentum', label: 'Momentum' },
            { value: 'scalp', label: 'Scalp' },
            { value: 'momentum_x', label: 'Momentum X' }
          ],
          default: 'momentum',
          required: true
        },
        { 
          name: 'side', 
          type: 'select', 
          label: 'Side',
          options: [
            { value: 'LONG', label: 'LONG' },
            { value: 'SHORT', label: 'SHORT' }
          ],
          default: 'LONG',
          required: true
        }
      ]
    },
    
    SIGNAL_CONFIDENCE: {
      id: 'signal_confidence',
      category: 'signal',
      label: 'Signal Confidence',
      color: '#f59e0b',
      icon: '💪',
      description: 'Checks server signal confidence level',
      inputs: [
        { 
          name: 'strategy', 
          type: 'select', 
          label: 'Strategy',
          options: [
            { value: 'momentum', label: 'Momentum' },
            { value: 'scalp', label: 'Scalp' },
            { value: 'momentum_x', label: 'Momentum X' }
          ],
          default: 'momentum',
          required: true
        },
        { 
          name: 'minConfidence', 
          type: 'select', 
          label: 'Min Confidence',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' }
          ],
          default: 'high',
          required: true
        }
      ]
    },
    
    // ==================== POSITION CONDITIONS ====================
    NO_POSITION: {
      id: 'no_position',
      category: 'position',
      label: 'No Open Position',
      color: '#6366f1', // Indigo
      icon: '🚫',
      description: 'Checks if there is no open position for this symbol',
      inputs: []
    },
    
    HAS_POSITION: {
      id: 'has_position',
      category: 'position',
      label: 'Has Open Position',
      color: '#6366f1',
      icon: '✅',
      description: 'Checks if there is an open position for this symbol',
      inputs: []
    },
    
    POSITION_SIDE: {
      id: 'position_side',
      category: 'position',
      label: 'Position Side',
      color: '#6366f1',
      icon: '🔄',
      description: 'Checks the side of the current position',
      inputs: [
        { 
          name: 'side', 
          type: 'select', 
          label: 'Side',
          options: [
            { value: 'LONG', label: 'LONG' },
            { value: 'SHORT', label: 'SHORT' }
          ],
          default: 'LONG',
          required: true
        }
      ]
    },
    
    POSITION_PNL: {
      id: 'position_pnl',
      category: 'position',
      label: 'Position PNL',
      color: '#6366f1',
      icon: '💰',
      description: 'Checks unrealized profit/loss of current position',
      inputs: [
        { 
          name: 'operator', 
          type: 'select', 
          label: 'Operator',
          options: [
            { value: 'greater_than', label: 'Greater Than (>)' },
            { value: 'less_than', label: 'Less Than (<)' }
          ],
          default: 'greater_than',
          required: true
        },
        { 
          name: 'value', 
          type: 'number', 
          label: 'Dollar Amount ($)', 
          default: 50,
          step: 0.01,
          required: true,
          help: 'Negative values for stop loss'
        }
      ]
    },
    
    POSITION_DURATION: {
      id: 'position_duration',
      category: 'position',
      label: 'Position Duration',
      color: '#6366f1',
      icon: '⏱️',
      description: 'Checks how long position has been open',
      inputs: [
        { 
          name: 'operator', 
          type: 'select', 
          label: 'Operator',
          options: [
            { value: 'greater_than', label: 'Greater Than (>)' },
            { value: 'less_than', label: 'Less Than (<)' }
          ],
          default: 'greater_than',
          required: true
        },
        { 
          name: 'value', 
          type: 'number', 
          label: 'Seconds', 
          default: 300,
          min: 1,
          required: true
        }
      ]
    }
  },
  
  // ==================== LOGIC GATES ====================
  LOGIC: {
    AND: {
      id: 'and',
      label: 'AND',
      color: '#64748b', // Slate
      icon: '&',
      description: 'All inputs must be true',
      maxInputs: 10,
      minInputs: 2
    },
    
    OR: {
      id: 'or',
      label: 'OR',
      color: '#64748b',
      icon: '|',
      description: 'At least one input must be true',
      maxInputs: 10,
      minInputs: 2
    },
    
    NOT: {
      id: 'not',
      label: 'NOT',
      color: '#64748b',
      icon: '!',
      description: 'Inverts the input (true becomes false)',
      maxInputs: 1,
      minInputs: 1
    }
  },
  
  // ==================== ACTIONS ====================
  ACTIONS: {
    OPEN_LONG: {
      id: 'open_long',
      category: 'entry',
      label: 'Open LONG',
      color: '#10b981',
      icon: '📈',
      description: 'Opens a long position (buy)',
      inputs: [
        { 
          name: 'size', 
          type: 'number', 
          label: 'Position Size (%)', 
          default: 10, 
          min: 1, 
          max: 100,
          required: true,
          help: 'Percentage of balance to use'
        },
        { 
          name: 'leverage', 
          type: 'number', 
          label: 'Leverage', 
          default: 75, 
          min: 1, 
          max: 125,
          required: true
        },
        { 
          name: 'tp', 
          type: 'number', 
          label: 'Take Profit ($)', 
          default: 0, 
          optional: true,
          step: 0.01,
          help: 'Leave 0 for no TP'
        },
        { 
          name: 'sl', 
          type: 'number', 
          label: 'Stop Loss ($)', 
          default: 0, 
          optional: true,
          step: 0.01,
          help: 'Leave 0 for no SL'
        }
      ]
    },
    
    OPEN_SHORT: {
      id: 'open_short',
      category: 'entry',
      label: 'Open SHORT',
      color: '#ef4444',
      icon: '📉',
      description: 'Opens a short position (sell)',
      inputs: [
        { 
          name: 'size', 
          type: 'number', 
          label: 'Position Size (%)', 
          default: 10, 
          min: 1, 
          max: 100,
          required: true,
          help: 'Percentage of balance to use'
        },
        { 
          name: 'leverage', 
          type: 'number', 
          label: 'Leverage', 
          default: 75, 
          min: 1, 
          max: 125,
          required: true
        },
        { 
          name: 'tp', 
          type: 'number', 
          label: 'Take Profit ($)', 
          default: 0, 
          optional: true,
          step: 0.01,
          help: 'Leave 0 for no TP'
        },
        { 
          name: 'sl', 
          type: 'number', 
          label: 'Stop Loss ($)', 
          default: 0, 
          optional: true,
          step: 0.01,
          help: 'Leave 0 for no SL'
        }
      ]
    },
    
    CLOSE_POSITION: {
      id: 'close_position',
      category: 'exit',
      label: 'Close Position',
      color: '#f59e0b',
      icon: '🚪',
      description: 'Closes the current position at market price',
      inputs: []
    },
    
    MODIFY_TP_SL: {
      id: 'modify_tp_sl',
      category: 'management',
      label: 'Modify TP/SL',
      color: '#06b6d4', // Cyan
      icon: '⚙️',
      description: 'Modifies take profit or stop loss of current position',
      inputs: [
        { 
          name: 'tp', 
          type: 'number', 
          label: 'New Take Profit ($)', 
          default: 0, 
          optional: true,
          step: 0.01,
          help: 'Leave 0 to keep current'
        },
        { 
          name: 'sl', 
          type: 'number', 
          label: 'New Stop Loss ($)', 
          default: 0, 
          optional: true,
          step: 0.01,
          help: 'Leave 0 to keep current'
        }
      ]
    }
  }
};

// Helper function to get block definition by ID
export const getBlockDefinition = (blockId) => {
  for (const category of Object.values(BLOCK_TYPES)) {
    for (const block of Object.values(category)) {
      if (block.id === blockId) {
        return block;
      }
    }
  }
  return null;
};

// Helper function to get all blocks in a category
export const getBlocksByCategory = (categoryName) => {
  const category = BLOCK_TYPES[categoryName];
  return category ? Object.values(category) : [];
};

// Helper function to categorize condition blocks
export const CONDITION_CATEGORIES = {
  price: { label: 'Price', icon: '💹', blocks: [] },
  indicator: { label: 'Indicators', icon: '📊', blocks: [] },
  signal: { label: 'Server Signals', icon: '🎯', blocks: [] },
  position: { label: 'Position', icon: '📍', blocks: [] }
};

// Populate condition categories
Object.values(BLOCK_TYPES.CONDITIONS).forEach(block => {
  if (CONDITION_CATEGORIES[block.category]) {
    CONDITION_CATEGORIES[block.category].blocks.push(block);
  }
});

// Helper function to validate block configuration
export const validateBlockConfig = (blockId, params) => {
  const definition = getBlockDefinition(blockId);
  if (!definition) {
    return { valid: false, errors: ['Unknown block type'] };
  }
  
  const errors = [];
  
  // Check required inputs
  if (definition.inputs) {
    for (const input of definition.inputs) {
      if (input.required && (params[input.name] === undefined || params[input.name] === null || params[input.name] === '')) {
        errors.push(`${input.label} is required`);
      }
      
      // Validate number ranges
      if (input.type === 'number' && params[input.name] !== undefined) {
        const value = parseFloat(params[input.name]);
        if (isNaN(value)) {
          errors.push(`${input.label} must be a number`);
        } else {
          if (input.min !== undefined && value < input.min) {
            errors.push(`${input.label} must be at least ${input.min}`);
          }
          if (input.max !== undefined && value > input.max) {
            errors.push(`${input.label} must be at most ${input.max}`);
          }
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

export default BLOCK_TYPES;

