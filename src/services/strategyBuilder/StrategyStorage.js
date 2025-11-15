// LocalStorage manager for custom strategies
// Handles CRUD operations for strategy persistence

const STORAGE_KEY = 'hopium_custom_strategies';
const STORAGE_VERSION = '1.0';

export class StrategyStorage {
  /**
   * Get all strategies from localStorage
   * @returns {Array} Array of strategy objects
   */
  static getAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        return [];
      }
      
      const parsed = JSON.parse(data);
      
      // Handle version migrations in the future
      if (parsed.version !== STORAGE_VERSION) {
        console.warn('[StrategyStorage] Version mismatch, migrating...');
        return this.migrate(parsed);
      }
      
      return parsed.strategies || [];
    } catch (error) {
      console.error('[StrategyStorage] Error reading strategies:', error);
      return [];
    }
  }
  
  /**
   * Get a single strategy by ID
   * @param {string} id - Strategy ID
   * @returns {Object|null} Strategy object or null if not found
   */
  static get(id) {
    const strategies = this.getAll();
    return strategies.find(s => s.id === id) || null;
  }
  
  /**
   * Save a strategy (create or update)
   * @param {Object} strategy - Strategy object to save
   * @returns {boolean} Success status
   */
  static save(strategy) {
    try {
      const strategies = this.getAll();
      const existingIndex = strategies.findIndex(s => s.id === strategy.id);
      
      // Add timestamps
      const now = Date.now();
      strategy.updatedAt = now;
      
      if (existingIndex === -1) {
        // Create new
        strategy.createdAt = now;
        strategies.push(strategy);
        console.log('[StrategyStorage] Created strategy:', strategy.id);
      } else {
        // Update existing
        strategy.createdAt = strategies[existingIndex].createdAt; // Preserve creation time
        strategies[existingIndex] = strategy;
        console.log('[StrategyStorage] Updated strategy:', strategy.id);
      }
      
      this.saveAll(strategies);
      return true;
    } catch (error) {
      console.error('[StrategyStorage] Error saving strategy:', error);
      return false;
    }
  }
  
  /**
   * Delete a strategy by ID
   * @param {string} id - Strategy ID
   * @returns {boolean} Success status
   */
  static delete(id) {
    try {
      const strategies = this.getAll();
      const filtered = strategies.filter(s => s.id !== id);
      
      if (filtered.length === strategies.length) {
        console.warn('[StrategyStorage] Strategy not found:', id);
        return false;
      }
      
      this.saveAll(filtered);
      console.log('[StrategyStorage] Deleted strategy:', id);
      return true;
    } catch (error) {
      console.error('[StrategyStorage] Error deleting strategy:', error);
      return false;
    }
  }
  
  /**
   * Duplicate a strategy
   * @param {string} id - Strategy ID to duplicate
   * @returns {Object|null} New strategy object or null on error
   */
  static duplicate(id) {
    try {
      const original = this.get(id);
      if (!original) {
        console.warn('[StrategyStorage] Strategy not found for duplication:', id);
        return null;
      }
      
      // Create deep copy
      const copy = JSON.parse(JSON.stringify(original));
      
      // Generate new ID and update metadata
      copy.id = this.generateId();
      copy.name = `${original.name} (Copy)`;
      copy.enabled = false; // Disable by default
      copy.lastRun = null;
      copy.lastAction = null;
      copy.errorCount = 0;
      copy.lastError = null;
      
      this.save(copy);
      console.log('[StrategyStorage] Duplicated strategy:', id, '→', copy.id);
      return copy;
    } catch (error) {
      console.error('[StrategyStorage] Error duplicating strategy:', error);
      return null;
    }
  }
  
  /**
   * Get all enabled strategies
   * @returns {Array} Array of enabled strategies
   */
  static getEnabled() {
    return this.getAll().filter(s => s.enabled);
  }
  
  /**
   * Enable/disable a strategy
   * @param {string} id - Strategy ID
   * @param {boolean} enabled - Enable state
   * @returns {boolean} Success status
   */
  static setEnabled(id, enabled) {
    try {
      const strategy = this.get(id);
      if (!strategy) {
        console.warn('[StrategyStorage] Strategy not found:', id);
        return false;
      }
      
      strategy.enabled = enabled;
      strategy.errorCount = 0; // Reset error count when re-enabling
      strategy.lastError = null;
      
      return this.save(strategy);
    } catch (error) {
      console.error('[StrategyStorage] Error setting enabled state:', error);
      return false;
    }
  }
  
  /**
   * Create a new empty strategy template
   * @param {string} symbol - Trading symbol
   * @returns {Object} New strategy template
   */
  static createTemplate(symbol = 'BTCUSDT') {
    return {
      id: this.generateId(),
      name: 'New Strategy',
      symbol: symbol,
      enabled: false,
      interval: 60, // seconds between runs
      cooldown: 300, // seconds before re-trigger
      lastRun: null,
      lastAction: null,
      errorCount: 0,
      maxErrors: 3,
      lastError: null,
      
      blocks: {
        conditions: [],
        actions: [],
        connections: []
      },
      
      settings: {
        notifications: true,
        logExecutions: true
      },
      
      stats: {
        executions: 0,
        successfulActions: 0,
        failedActions: 0
      },
      
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  
  /**
   * Generate a unique strategy ID
   * @returns {string} Unique ID
   */
  static generateId() {
    return `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Generate a unique block ID
   * @param {string} type - Block type (condition, action, logic)
   * @returns {string} Unique block ID
   */
  static generateBlockId(type = 'block') {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Save all strategies to localStorage
   * @param {Array} strategies - Array of strategies
   */
  static saveAll(strategies) {
    const data = {
      version: STORAGE_VERSION,
      strategies: strategies,
      lastUpdated: Date.now()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  
  /**
   * Clear all strategies (with confirmation)
   * @returns {boolean} Success status
   */
  static clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('[StrategyStorage] Cleared all strategies');
      return true;
    } catch (error) {
      console.error('[StrategyStorage] Error clearing strategies:', error);
      return false;
    }
  }
  
  /**
   * Export strategies as JSON
   * @returns {string} JSON string
   */
  static export() {
    const strategies = this.getAll();
    return JSON.stringify(strategies, null, 2);
  }
  
  /**
   * Import strategies from JSON
   * @param {string} jsonString - JSON string of strategies
   * @returns {Object} Import result { success, imported, errors }
   */
  static import(jsonString) {
    const result = {
      success: false,
      imported: 0,
      errors: []
    };
    
    try {
      const imported = JSON.parse(jsonString);
      
      if (!Array.isArray(imported)) {
        result.errors.push('Invalid format: expected array of strategies');
        return result;
      }
      
      const existing = this.getAll();
      
      for (const strategy of imported) {
        // Validate basic structure
        if (!strategy.id || !strategy.name || !strategy.blocks) {
          result.errors.push(`Invalid strategy: ${strategy.name || 'unnamed'}`);
          continue;
        }
        
        // Generate new ID to avoid conflicts
        strategy.id = this.generateId();
        strategy.enabled = false; // Disable imported strategies by default
        strategy.lastRun = null;
        strategy.lastAction = null;
        strategy.errorCount = 0;
        
        existing.push(strategy);
        result.imported++;
      }
      
      if (result.imported > 0) {
        this.saveAll(existing);
        result.success = true;
      }
      
      return result;
    } catch (error) {
      console.error('[StrategyStorage] Import error:', error);
      result.errors.push(error.message);
      return result;
    }
  }
  
  /**
   * Migrate old storage format to new version
   * @param {Object} oldData - Old format data
   * @returns {Array} Migrated strategies
   */
  static migrate(oldData) {
    console.log('[StrategyStorage] Migrating from version', oldData.version, 'to', STORAGE_VERSION);
    
    // Future migration logic here
    // For now, just return strategies as-is
    const strategies = oldData.strategies || [];
    
    // Save in new format
    this.saveAll(strategies);
    
    return strategies;
  }
  
  /**
   * Get storage usage statistics
   * @returns {Object} Storage stats
   */
  static getStats() {
    const strategies = this.getAll();
    const enabled = strategies.filter(s => s.enabled);
    
    // Calculate storage size
    const dataString = localStorage.getItem(STORAGE_KEY) || '';
    const sizeBytes = new Blob([dataString]).size;
    const sizeKB = (sizeBytes / 1024).toFixed(2);
    
    return {
      total: strategies.length,
      enabled: enabled.length,
      disabled: strategies.length - enabled.length,
      storageSizeKB: sizeKB,
      storageLimit: '5120 KB' // Typical localStorage limit
    };
  }
  
  /**
   * Log strategy execution
   * @param {string} id - Strategy ID
   * @param {Object} execution - Execution details
   */
  static logExecution(id, execution) {
    try {
      const strategy = this.get(id);
      if (!strategy) return;
      
      // Update execution stats
      if (!strategy.stats) {
        strategy.stats = {
          executions: 0,
          successfulActions: 0,
          failedActions: 0
        };
      }
      
      strategy.stats.executions++;
      
      if (execution.success) {
        strategy.stats.successfulActions++;
      } else {
        strategy.stats.failedActions++;
      }
      
      strategy.lastRun = Date.now();
      
      if (execution.actionTaken) {
        strategy.lastAction = Date.now();
      }
      
      if (execution.error) {
        strategy.errorCount++;
        strategy.lastError = execution.error;
      }
      
      this.save(strategy);
    } catch (error) {
      console.error('[StrategyStorage] Error logging execution:', error);
    }
  }
}

export default StrategyStorage;

