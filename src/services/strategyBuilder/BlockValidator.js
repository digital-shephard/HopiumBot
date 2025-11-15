// Validates block configurations and strategy structure
// Ensures strategies are properly formed before execution

import { getBlockDefinition, validateBlockConfig } from './blockDefinitions';

export class BlockValidator {
  /**
   * Validate an entire strategy
   * @param {Object} strategy - Strategy object to validate
   * @returns {Object} Validation result { valid, errors, warnings }
   */
  static validateStrategy(strategy) {
    const errors = [];
    const warnings = [];
    
    // Basic structure validation
    if (!strategy.id) errors.push('Strategy ID is missing');
    if (!strategy.name || strategy.name.trim() === '') errors.push('Strategy name is required');
    if (!strategy.symbol) errors.push('Symbol is required');
    if (!strategy.blocks) errors.push('Blocks structure is missing');
    
    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }
    
    // Validate blocks structure
    if (!strategy.blocks.conditions) errors.push('Conditions array is missing');
    if (!strategy.blocks.actions) errors.push('Actions array is missing');
    if (!strategy.blocks.connections) errors.push('Connections array is missing');
    
    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }
    
    // Must have at least one condition
    if (strategy.blocks.conditions.length === 0) {
      errors.push('Strategy must have at least one condition block');
    }
    
    // Must have at least one action
    if (strategy.blocks.actions.length === 0) {
      errors.push('Strategy must have at least one action block');
    }
    
    // Validate each condition block
    for (const block of strategy.blocks.conditions) {
      const blockValidation = this.validateBlock(block);
      if (!blockValidation.valid) {
        errors.push(`Condition block "${block.id}": ${blockValidation.errors.join(', ')}`);
      }
    }
    
    // Validate each action block
    for (const block of strategy.blocks.actions) {
      const blockValidation = this.validateBlock(block);
      if (!blockValidation.valid) {
        errors.push(`Action block "${block.id}": ${blockValidation.errors.join(', ')}`);
      }
    }
    
    // Validate connections
    const connectionValidation = this.validateConnections(strategy.blocks);
    errors.push(...connectionValidation.errors);
    warnings.push(...connectionValidation.warnings);
    
    // Validate flow (conditions → actions)
    const flowValidation = this.validateFlow(strategy.blocks);
    errors.push(...flowValidation.errors);
    warnings.push(...flowValidation.warnings);
    
    // Validate settings
    if (strategy.interval < 10) {
      warnings.push('Interval less than 10 seconds may cause rate limiting');
    }
    
    if (strategy.cooldown < 60) {
      warnings.push('Cooldown less than 60 seconds may cause rapid re-triggering');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Validate a single block
   * @param {Object} block - Block object to validate
   * @returns {Object} Validation result { valid, errors }
   */
  static validateBlock(block) {
    const errors = [];
    
    // Basic block validation
    if (!block.id) {
      return { valid: false, errors: ['Block ID is missing'] };
    }
    
    if (!block.type) {
      return { valid: false, errors: ['Block type is missing'] };
    }
    
    // Get block definition
    const definition = getBlockDefinition(block.type);
    if (!definition) {
      return { valid: false, errors: [`Unknown block type: ${block.type}`] };
    }
    
    // Validate params if block has inputs
    if (definition.inputs && definition.inputs.length > 0) {
      if (!block.params) {
        return { valid: false, errors: ['Block params are missing'] };
      }
      
      const configValidation = validateBlockConfig(block.type, block.params);
      if (!configValidation.valid) {
        return configValidation;
      }
    }
    
    return { valid: true, errors: [] };
  }
  
  /**
   * Validate block connections
   * @param {Object} blocks - Blocks object with conditions, actions, connections
   * @returns {Object} Validation result { errors, warnings }
   */
  static validateConnections(blocks) {
    const errors = [];
    const warnings = [];
    
    const allBlocks = [
      ...blocks.conditions,
      ...blocks.actions
    ];
    
    const blockIds = new Set(allBlocks.map(b => b.id));
    
    // Validate each connection
    for (const conn of blocks.connections) {
      if (!conn.from) {
        errors.push('Connection missing "from" field');
        continue;
      }
      
      if (!conn.to) {
        errors.push('Connection missing "to" field');
        continue;
      }
      
      // Check if blocks exist
      if (!blockIds.has(conn.from)) {
        errors.push(`Connection references non-existent block: ${conn.from}`);
      }
      
      if (!blockIds.has(conn.to)) {
        errors.push(`Connection references non-existent block: ${conn.to}`);
      }
    }
    
    // Check for orphaned blocks (no connections)
    const connectedBlocks = new Set();
    for (const conn of blocks.connections) {
      connectedBlocks.add(conn.from);
      connectedBlocks.add(conn.to);
    }
    
    for (const block of allBlocks) {
      if (!connectedBlocks.has(block.id)) {
        warnings.push(`Block "${block.id}" has no connections`);
      }
    }
    
    // Check for circular references
    const circularCheck = this.checkCircularReferences(blocks.connections);
    if (circularCheck.hasCircular) {
      errors.push('Circular connection detected: ' + circularCheck.cycle.join(' → '));
    }
    
    // Validate logic block connections
    for (const block of blocks.conditions) {
      if (block.type === 'and' || block.type === 'or' || block.type === 'not') {
        const definition = getBlockDefinition(block.type);
        const inputCount = this.getInputConnectionCount(block.id, blocks.connections);
        
        if (definition.minInputs && inputCount < definition.minInputs) {
          errors.push(`Logic block "${block.id}" needs at least ${definition.minInputs} inputs`);
        }
        
        if (definition.maxInputs && inputCount > definition.maxInputs) {
          errors.push(`Logic block "${block.id}" can have at most ${definition.maxInputs} inputs`);
        }
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Validate strategy execution flow
   * @param {Object} blocks - Blocks object
   * @returns {Object} Validation result { errors, warnings }
   */
  static validateFlow(blocks) {
    const errors = [];
    const warnings = [];
    
    // Check that conditions lead to actions
    const actionIds = new Set(blocks.actions.map(a => a.id));
    
    // Find all terminal nodes (nodes that don't connect to anything)
    const outputNodes = new Set();
    for (const block of [...blocks.conditions, ...blocks.actions]) {
      outputNodes.add(block.id);
    }
    
    for (const conn of blocks.connections) {
      outputNodes.delete(conn.from); // If a block connects to something, it's not terminal
    }
    
    // All terminal nodes should be action blocks
    for (const nodeId of outputNodes) {
      if (!actionIds.has(nodeId)) {
        errors.push(`Condition block "${nodeId}" doesn't lead to any action`);
      }
    }
    
    // Check that all action blocks are reachable from conditions
    const reachableActions = this.getReachableActions(blocks);
    for (const action of blocks.actions) {
      if (!reachableActions.has(action.id)) {
        warnings.push(`Action block "${action.id}" is not reachable from any condition`);
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Get count of incoming connections for a block
   * @param {string} blockId - Block ID
   * @param {Array} connections - Array of connections
   * @returns {number} Input count
   */
  static getInputConnectionCount(blockId, connections) {
    return connections.filter(conn => conn.to === blockId).length;
  }
  
  /**
   * Check for circular references in connections
   * @param {Array} connections - Array of connections
   * @returns {Object} Result { hasCircular, cycle }
   */
  static checkCircularReferences(connections) {
    const graph = new Map();
    
    // Build adjacency list
    for (const conn of connections) {
      if (!graph.has(conn.from)) {
        graph.set(conn.from, []);
      }
      graph.get(conn.from).push(conn.to);
    }
    
    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];
    
    const dfs = (node) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const result = dfs(neighbor);
          if (result.hasCircular) {
            return result;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          return {
            hasCircular: true,
            cycle: path.slice(cycleStart)
          };
        }
      }
      
      recursionStack.delete(node);
      path.pop();
      return { hasCircular: false, cycle: [] };
    };
    
    // Check all nodes
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const result = dfs(node);
        if (result.hasCircular) {
          return result;
        }
      }
    }
    
    return { hasCircular: false, cycle: [] };
  }
  
  /**
   * Get all action blocks reachable from condition blocks
   * @param {Object} blocks - Blocks object
   * @returns {Set} Set of reachable action block IDs
   */
  static getReachableActions(blocks) {
    const actionIds = new Set(blocks.actions.map(a => a.id));
    const reachable = new Set();
    
    // Build adjacency list
    const graph = new Map();
    for (const conn of blocks.connections) {
      if (!graph.has(conn.from)) {
        graph.set(conn.from, []);
      }
      graph.get(conn.from).push(conn.to);
    }
    
    // BFS from each condition block
    const visited = new Set();
    const queue = [...blocks.conditions.map(c => c.id)];
    
    while (queue.length > 0) {
      const current = queue.shift();
      
      if (visited.has(current)) {
        continue;
      }
      
      visited.add(current);
      
      if (actionIds.has(current)) {
        reachable.add(current);
      }
      
      const neighbors = graph.get(current) || [];
      queue.push(...neighbors);
    }
    
    return reachable;
  }
  
  /**
   * Validate strategy before enabling
   * @param {Object} strategy - Strategy to validate
   * @returns {Object} Validation result with user-friendly messages
   */
  static validateBeforeEnable(strategy) {
    const validation = this.validateStrategy(strategy);
    
    if (!validation.valid) {
      return {
        canEnable: false,
        message: 'Strategy has errors that must be fixed before enabling',
        details: validation.errors
      };
    }
    
    if (validation.warnings.length > 0) {
      return {
        canEnable: true,
        message: 'Strategy has warnings (can still be enabled)',
        details: validation.warnings
      };
    }
    
    return {
      canEnable: true,
      message: 'Strategy is valid and ready to run',
      details: []
    };
  }
}

export default BlockValidator;

