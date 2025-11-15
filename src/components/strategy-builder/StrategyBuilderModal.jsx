// Main container for the visual strategy builder
// Full-screen modal with palette, canvas, and settings panels

import React, { useState, useRef, useEffect } from 'react';
import './StrategyBuilderModal.css';
import BlockPalette from './BlockPalette';
import BlockCanvas from './BlockCanvas';
import { StrategyStorage } from '../../services/strategyBuilder/StrategyStorage';
import { BlockValidator } from '../../services/strategyBuilder/BlockValidator';

const StrategyBuilderModal = ({ isOpen, onClose, initialStrategy = null, symbol = 'BTCUSDT' }) => {
  const [strategy, setStrategy] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [validation, setValidation] = useState({ valid: true, errors: [], warnings: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  // Initialize strategy
  useEffect(() => {
    if (isOpen) {
      if (initialStrategy) {
        setStrategy({ ...initialStrategy });
      } else {
        setStrategy(StrategyStorage.createTemplate(symbol));
      }
    }
  }, [isOpen, initialStrategy, symbol]);

  // Validate strategy whenever it changes
  useEffect(() => {
    if (strategy) {
      const result = BlockValidator.validateStrategy(strategy);
      setValidation(result);
    }
  }, [strategy]);

  if (!isOpen || !strategy) {
    return null;
  }

  const handleSave = () => {
    setShowValidation(true);
    
    const validationResult = BlockValidator.validateBeforeEnable(strategy);
    
    if (!validationResult.canEnable) {
      alert(`Cannot save strategy:\n\n${validationResult.details.join('\n')}`);
      return;
    }
    
    setIsSaving(true);
    
    try {
      const success = StrategyStorage.save(strategy);
      
      if (success) {
        alert('Strategy saved successfully!');
        onClose();
      } else {
        alert('Failed to save strategy. Please try again.');
      }
    } catch (error) {
      console.error('[StrategyBuilder] Save error:', error);
      alert(`Error saving strategy: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (confirm('Close strategy builder? Unsaved changes will be lost.')) {
      onClose();
    }
  };

  const handleNameChange = (e) => {
    setStrategy(prev => ({
      ...prev,
      name: e.target.value
    }));
  };

  const handleSymbolChange = (e) => {
    setStrategy(prev => ({
      ...prev,
      symbol: e.target.value
    }));
  };

  const handleIntervalChange = (e) => {
    setStrategy(prev => ({
      ...prev,
      interval: parseInt(e.target.value) || 60
    }));
  };

  const handleCooldownChange = (e) => {
    setStrategy(prev => ({
      ...prev,
      cooldown: parseInt(e.target.value) || 300
    }));
  };

  const handleAddBlock = (blockType, blockData) => {
    const blockId = StrategyStorage.generateBlockId(blockData.category || 'block');
    
    const newBlock = {
      id: blockId,
      type: blockType,
      params: {},
      position: { x: 100, y: 100 }
    };
    
    // Set default params from block definition
    if (blockData.inputs) {
      for (const input of blockData.inputs) {
        if (input.default !== undefined) {
          newBlock.params[input.name] = input.default;
        }
      }
    }
    
    setStrategy(prev => {
      const updated = { ...prev };
      
      // Check if block already exists (prevent duplicates)
      const allBlocks = [...updated.blocks.conditions, ...updated.blocks.actions];
      if (allBlocks.some(b => b.id === newBlock.id)) {
        console.warn('[StrategyBuilder] Block already exists:', newBlock.id);
        return prev; // Don't update if duplicate
      }
      
      // Add to appropriate category
      if (blockData.category === 'entry' || blockData.category === 'exit' || blockData.category === 'management') {
        // Action blocks
        updated.blocks.actions = [...updated.blocks.actions, newBlock];
      } else {
        // Condition blocks AND logic blocks (AND/OR/NOT)
        updated.blocks.conditions = [...updated.blocks.conditions, newBlock];
      }
      
      return updated;
    });
  };

  const handleUpdateBlock = (blockId, updates) => {
    console.log('[StrategyBuilder] Updating block:', blockId, updates);
    
    setStrategy(prev => {
      const updated = { ...prev };
      
      // Find and update in conditions
      const condIndex = updated.blocks.conditions.findIndex(b => b.id === blockId);
      if (condIndex !== -1) {
        updated.blocks.conditions[condIndex] = {
          ...updated.blocks.conditions[condIndex],
          ...updates
        };
        console.log('[StrategyBuilder] Updated condition block at index', condIndex);
        return updated;
      }
      
      // Find and update in actions
      const actionIndex = updated.blocks.actions.findIndex(b => b.id === blockId);
      if (actionIndex !== -1) {
        updated.blocks.actions[actionIndex] = {
          ...updated.blocks.actions[actionIndex],
          ...updates
        };
        console.log('[StrategyBuilder] Updated action block at index', actionIndex);
        return updated;
      }
      
      console.warn('[StrategyBuilder] Block not found:', blockId);
      return updated;
    });
  };

  const handleDeleteBlock = (blockId) => {
    if (!confirm('Delete this block and all its connections?')) {
      return;
    }
    
    setStrategy(prev => {
      const updated = { ...prev };
      
      // Remove from conditions
      updated.blocks.conditions = updated.blocks.conditions.filter(b => b.id !== blockId);
      
      // Remove from actions
      updated.blocks.actions = updated.blocks.actions.filter(b => b.id !== blockId);
      
      // Remove all connections involving this block
      updated.blocks.connections = updated.blocks.connections.filter(
        conn => conn.from !== blockId && conn.to !== blockId
      );
      
      return updated;
    });
    
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(null);
    }
  };

  const handleAddConnection = (fromId, toId) => {
    console.log('[StrategyBuilder] handleAddConnection called:', { fromId, toId });
    
    // Check if connection already exists
    const exists = strategy.blocks.connections.some(
      conn => conn.from === fromId && conn.to === toId
    );
    
    if (exists) {
      console.log('[StrategyBuilder] Connection already exists, skipping');
      return;
    }
    
    console.log('[StrategyBuilder] Adding connection to state');
    setStrategy(prev => ({
      ...prev,
      blocks: {
        ...prev.blocks,
        connections: [
          ...prev.blocks.connections,
          { from: fromId, to: toId }
        ]
      }
    }));
  };

  const handleDeleteConnection = (fromId, toId) => {
    setStrategy(prev => ({
      ...prev,
      blocks: {
        ...prev.blocks,
        connections: prev.blocks.connections.filter(
          conn => !(conn.from === fromId && conn.to === toId)
        )
      }
    }));
  };

  const handleValidate = () => {
    setShowValidation(true);
    const result = BlockValidator.validateStrategy(strategy);
    setValidation(result);
    
    if (result.valid) {
      alert('✅ Strategy is valid!\n\n' + 
            (result.warnings.length > 0 ? 'Warnings:\n' + result.warnings.join('\n') : 'No warnings'));
    } else {
      alert('❌ Strategy has errors:\n\n' + result.errors.join('\n'));
    }
  };

  return (
    <div className="strategy-builder-modal-overlay">
      <div className="strategy-builder-modal">
        <div className="strategy-builder-header">
          <h2>🧱 Custom Strategy Builder</h2>
          <button className="close-button" onClick={handleClose}>×</button>
        </div>
        
        <div className="strategy-builder-content">
          {/* Left Panel - Block Palette */}
          <div className="strategy-builder-panel left-panel">
            <BlockPalette onAddBlock={handleAddBlock} />
          </div>
          
          {/* Center Panel - Canvas */}
          <div className="strategy-builder-panel center-panel">
            <BlockCanvas
              strategy={strategy}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              onUpdateBlock={handleUpdateBlock}
              onDeleteBlock={handleDeleteBlock}
              onAddConnection={handleAddConnection}
              onDeleteConnection={handleDeleteConnection}
            />
          </div>
          
          {/* Right Panel - Settings */}
          <div className="strategy-builder-panel right-panel">
            <div className="settings-section">
              <h3>⚙️ Strategy Settings</h3>
              
              <div className="setting-group">
                <label>Strategy Name</label>
                <input
                  type="text"
                  value={strategy.name}
                  onChange={handleNameChange}
                  placeholder="My Custom Strategy"
                  className="setting-input"
                />
              </div>
              
              <div className="setting-group">
                <label>Trading Symbol</label>
                <input
                  type="text"
                  value={strategy.symbol}
                  onChange={handleSymbolChange}
                  placeholder="BTCUSDT"
                  className="setting-input"
                />
              </div>
              
              <div className="setting-group">
                <label>Check Interval (seconds)</label>
                <input
                  type="number"
                  value={strategy.interval}
                  onChange={handleIntervalChange}
                  min="10"
                  max="3600"
                  className="setting-input"
                />
                <small>How often to evaluate conditions</small>
              </div>
              
              <div className="setting-group">
                <label>Cooldown (seconds)</label>
                <input
                  type="number"
                  value={strategy.cooldown}
                  onChange={handleCooldownChange}
                  min="60"
                  max="3600"
                  className="setting-input"
                />
                <small>Wait time before re-triggering</small>
              </div>
              
              {showValidation && (
                <div className={`validation-summary ${validation.valid ? 'valid' : 'invalid'}`}>
                  <h4>{validation.valid ? '✅ Valid' : '❌ Has Errors'}</h4>
                  
                  {validation.errors.length > 0 && (
                    <div className="validation-errors">
                      <strong>Errors:</strong>
                      <ul>
                        {validation.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {validation.warnings.length > 0 && (
                    <div className="validation-warnings">
                      <strong>Warnings:</strong>
                      <ul>
                        {validation.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              <div className="settings-actions">
                <button
                  className="validate-button"
                  onClick={handleValidate}
                >
                  🔍 Validate
                </button>
                
                <button
                  className="save-button"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? '⏳ Saving...' : '💾 Save Strategy'}
                </button>
              </div>
              
              <div className="strategy-info">
                <div className="info-item">
                  <span className="info-label">Conditions:</span>
                  <span className="info-value">{strategy.blocks.conditions.length}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Actions:</span>
                  <span className="info-value">{strategy.blocks.actions.length}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Connections:</span>
                  <span className="info-value">{strategy.blocks.connections.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyBuilderModal;

