// Block Palette - Left sidebar with draggable blocks
// Organized by category: Conditions (Price, Indicators, Signals, Position), Logic, Actions

import React, { useState } from 'react';
import { BLOCK_TYPES, CONDITION_CATEGORIES } from '../../services/strategyBuilder/blockDefinitions';
import './BlockPalette.css';

const BlockPalette = ({ onAddBlock }) => {
  const [expandedCategories, setExpandedCategories] = useState({
    price: true,
    indicator: false,
    signal: false,
    position: false,
    logic: true,
    actions: true
  });

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleBlockClick = (e, blockId, blockData) => {
    e.preventDefault();
    e.stopPropagation();
    onAddBlock(blockId, blockData);
  };

  const renderBlock = (block) => {
    return (
      <div
        key={block.id}
        className="palette-block"
        style={{ borderColor: block.color }}
        onClick={(e) => handleBlockClick(e, block.id, block)}
        title={block.description}
      >
        <div className="palette-block-icon">{block.icon}</div>
        <div className="palette-block-label">{block.label}</div>
      </div>
    );
  };

  return (
    <div className="block-palette">
      <div className="palette-header">
        <h3>📦 Block Palette</h3>
        <p>Click blocks to add them to canvas</p>
      </div>

      <div className="palette-content">
        {/* CONDITIONS */}
        <div className="palette-section">
          <div className="palette-section-header">
            <span className="section-icon">🔍</span>
            <span className="section-title">CONDITIONS</span>
          </div>

          {/* Price Conditions */}
          <div className="palette-category">
            <div
              className="category-header"
              onClick={() => toggleCategory('price')}
            >
              <span className="category-icon">💹</span>
              <span className="category-name">Price</span>
              <span className="category-toggle">
                {expandedCategories.price ? '▼' : '▶'}
              </span>
            </div>
            {expandedCategories.price && (
              <div className="category-blocks">
                {CONDITION_CATEGORIES.price.blocks.map(renderBlock)}
              </div>
            )}
          </div>

          {/* Indicator Conditions */}
          <div className="palette-category">
            <div
              className="category-header"
              onClick={() => toggleCategory('indicator')}
            >
              <span className="category-icon">📊</span>
              <span className="category-name">Indicators</span>
              <span className="category-toggle">
                {expandedCategories.indicator ? '▼' : '▶'}
              </span>
            </div>
            {expandedCategories.indicator && (
              <div className="category-blocks">
                {CONDITION_CATEGORIES.indicator.blocks.map(renderBlock)}
              </div>
            )}
          </div>

          {/* Server Signal Conditions */}
          <div className="palette-category">
            <div
              className="category-header"
              onClick={() => toggleCategory('signal')}
            >
              <span className="category-icon">🎯</span>
              <span className="category-name">Server Signals</span>
              <span className="category-toggle">
                {expandedCategories.signal ? '▼' : '▶'}
              </span>
            </div>
            {expandedCategories.signal && (
              <div className="category-blocks">
                {CONDITION_CATEGORIES.signal.blocks.map(renderBlock)}
              </div>
            )}
          </div>

          {/* Position Conditions */}
          <div className="palette-category">
            <div
              className="category-header"
              onClick={() => toggleCategory('position')}
            >
              <span className="category-icon">📍</span>
              <span className="category-name">Position</span>
              <span className="category-toggle">
                {expandedCategories.position ? '▼' : '▶'}
              </span>
            </div>
            {expandedCategories.position && (
              <div className="category-blocks">
                {CONDITION_CATEGORIES.position.blocks.map(renderBlock)}
              </div>
            )}
          </div>
        </div>

        {/* LOGIC GATES */}
        <div className="palette-section">
          <div className="palette-section-header">
            <span className="section-icon">🔧</span>
            <span className="section-title">LOGIC</span>
          </div>

          <div className="palette-category">
            <div
              className="category-header"
              onClick={() => toggleCategory('logic')}
            >
              <span className="category-icon">⚡</span>
              <span className="category-name">Gates</span>
              <span className="category-toggle">
                {expandedCategories.logic ? '▼' : '▶'}
              </span>
            </div>
            {expandedCategories.logic && (
              <div className="category-blocks">
                {Object.values(BLOCK_TYPES.LOGIC).map(block => (
                  <div
                    key={block.id}
                    className="palette-block logic-block"
                    style={{ borderColor: block.color }}
                    onClick={(e) => handleBlockClick(e, block.id, block)}
                    title={block.description}
                  >
                    <div className="palette-block-icon">{block.icon}</div>
                    <div className="palette-block-label">{block.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="palette-section">
          <div className="palette-section-header">
            <span className="section-icon">⚡</span>
            <span className="section-title">ACTIONS</span>
          </div>

          <div className="palette-category">
            <div
              className="category-header"
              onClick={() => toggleCategory('actions')}
            >
              <span className="category-icon">🎬</span>
              <span className="category-name">Trade Actions</span>
              <span className="category-toggle">
                {expandedCategories.actions ? '▼' : '▶'}
              </span>
            </div>
            {expandedCategories.actions && (
              <div className="category-blocks">
                {Object.values(BLOCK_TYPES.ACTIONS).map(renderBlock)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="palette-footer">
        <div className="palette-tip">
          <strong>💡 Tip:</strong> Click blocks to add them to the canvas, then connect them to build your strategy!
        </div>
      </div>
    </div>
  );
};

export default BlockPalette;

