// Block Canvas - Central drag-and-drop area for building strategies
// Handles block positioning, selection, and connections

import React, { useState, useRef, useEffect, useCallback } from 'react';
import './BlockCanvas.css';
import { getBlockDefinition } from '../../services/strategyBuilder/blockDefinitions';

const BlockCanvas = ({
  strategy,
  selectedBlock,
  onSelectBlock,
  onUpdateBlock,
  onDeleteBlock,
  onAddConnection,
  onDeleteConnection
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [draggingBlock, setDraggingBlock] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPosition, setDragPosition] = useState(null); // Current drag position (smooth updates)
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [connectionPreview, setConnectionPreview] = useState(null);
  
  // Zoom and pan states
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const allBlocks = [
    ...strategy.blocks.conditions,
    ...strategy.blocks.actions
  ];

  // Handle zoom with mouse wheel
  const handleWheel = useCallback((e) => {
    const delta = e.deltaY * -0.001;
    const newZoom = Math.min(Math.max(0.1, zoom + delta), 2);
    
    setZoom(newZoom);
  }, [zoom]);

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelHandler = (e) => {
      e.preventDefault();
      handleWheel(e);
    };

    canvas.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [handleWheel]);

  // Handle canvas panning (space + drag or middle mouse)
  const handleCanvasMouseDown = (e) => {
    // Middle mouse button or space key held
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleCanvasPanMove = useCallback((e) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  }, [isPanning, panStart]);

  const handleCanvasPanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleCanvasPanMove);
      window.addEventListener('mouseup', handleCanvasPanEnd);

      return () => {
        window.removeEventListener('mousemove', handleCanvasPanMove);
        window.removeEventListener('mouseup', handleCanvasPanEnd);
      };
    }
  }, [isPanning, handleCanvasPanMove, handleCanvasPanEnd]);

  const handleBlockMouseDown = (e, block) => {
    if (e.target.closest('.block-delete-btn') || e.target.closest('.block-input')) {
      return; // Don't drag if clicking delete or input
    }

    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();

    setDraggingBlock(block);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (draggingBlock) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = e.clientX - canvasRect.left - dragOffset.x;
      const newY = e.clientY - canvasRect.top - dragOffset.y;

      // Update drag position locally (smooth, no re-render)
      setDragPosition({
        x: Math.max(0, Math.min(newX, canvasRect.width - 200)),
        y: Math.max(0, Math.min(newY, canvasRect.height - 150))
      });
    }

    // Update connection preview
    if (connectingFrom && canvasRef.current) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      setConnectionPreview({
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top
      });
    }
  }, [draggingBlock, dragOffset, connectingFrom]);

  const handleMouseUp = useCallback(() => {
    // Commit final position to state
    if (draggingBlock && dragPosition) {
      console.log('[BlockCanvas] Saving block position:', draggingBlock.id, dragPosition);
      onUpdateBlock(draggingBlock.id, {
        position: dragPosition
      });
    }
    
    setDraggingBlock(null);
    setDragOffset({ x: 0, y: 0 });
    setDragPosition(null);
  }, [draggingBlock, dragPosition, onUpdateBlock]);

  useEffect(() => {
    if (draggingBlock) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingBlock, handleMouseMove, handleMouseUp]);

  const handleBlockClick = (e, block) => {
    e.stopPropagation();
    onSelectBlock(block);
  };

  const handleCanvasClick = (e) => {
    if (e.target === e.currentTarget) {
      onSelectBlock(null);
      
      // Cancel connection in progress
      if (connectingFrom) {
        console.log('[BlockCanvas] Connection cancelled');
        setConnectingFrom(null);
        setConnectionPreview(null);
      }
    }
  };

  const handleStartConnection = (e, blockId) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[BlockCanvas] Starting connection from:', blockId);
    setConnectingFrom(blockId);
  };

  const handleEndConnection = (e, blockId) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[BlockCanvas] Ending connection:', { from: connectingFrom, to: blockId });

    if (connectingFrom && connectingFrom !== blockId) {
      console.log('[BlockCanvas] Creating connection:', connectingFrom, '→', blockId);
      onAddConnection(connectingFrom, blockId);
    }

    setConnectingFrom(null);
    setConnectionPreview(null);
  };

  const handleConnectionMouseMove = (e) => {
    if (connectingFrom) {
      handleMouseMove(e);
    }
  };

  const handleDeleteBlock = (e, blockId) => {
    e.stopPropagation();
    onDeleteBlock(blockId);
  };

  const handleParamChange = (blockId, paramName, value) => {
    const block = allBlocks.find(b => b.id === blockId);
    if (!block) return;

    onUpdateBlock(blockId, {
      params: {
        ...block.params,
        [paramName]: value
      }
    });
  };

  const renderBlock = (block) => {
    const definition = getBlockDefinition(block.type);
    if (!definition) return null;

    const isSelected = selectedBlock?.id === block.id;
    const isDragging = draggingBlock?.id === block.id;
    
    // Use dragPosition for smooth dragging, otherwise use stored position
    const position = isDragging && dragPosition ? dragPosition : block.position;

    return (
      <div
        key={block.id}
        className={`canvas-block ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
        style={{
          left: position.x,
          top: position.y,
          borderColor: definition.color
        }}
        onMouseDown={(e) => handleBlockMouseDown(e, block)}
        onClick={(e) => handleBlockClick(e, block)}
      >
        {/* Connection Point - Input */}
        <div
          className="connection-point input"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleEndConnection(e, block.id);
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          title="Connect from another block"
        />

        {/* Block Header */}
        <div className="canvas-block-header" style={{ background: definition.color }}>
          <span className="block-icon">{definition.icon}</span>
          <span className="block-label">{definition.label}</span>
          <button
            className="block-delete-btn"
            onClick={(e) => handleDeleteBlock(e, block.id)}
            title="Delete block"
          >
            ×
          </button>
        </div>

        {/* Block Body - Inputs */}
        {definition.inputs && definition.inputs.length > 0 && (
          <div className="canvas-block-body">
            {definition.inputs.map((input) => (
              <div key={input.name} className="block-input-group">
                <label>{input.label}</label>
                {input.type === 'number' ? (
                  <input
                    type="number"
                    className="block-input"
                    value={block.params[input.name] || input.default || ''}
                    onChange={(e) => handleParamChange(block.id, input.name, parseFloat(e.target.value) || 0)}
                    min={input.min}
                    max={input.max}
                    step={input.step || 1}
                    placeholder={input.placeholder}
                  />
                ) : input.type === 'select' ? (
                  <select
                    className="block-input"
                    value={block.params[input.name] || input.default || ''}
                    onChange={(e) => handleParamChange(block.id, input.name, e.target.value)}
                  >
                    {input.options.map((opt) => (
                      <option key={opt.value || opt} value={opt.value || opt}>
                        {opt.label || opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="block-input"
                    value={block.params[input.name] || input.default || ''}
                    onChange={(e) => handleParamChange(block.id, input.name, e.target.value)}
                    placeholder={input.placeholder}
                  />
                )}
                {input.help && <small className="input-help">{input.help}</small>}
              </div>
            ))}
          </div>
        )}

        {/* Connection Point - Output */}
        <div
          className="connection-point output"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleStartConnection(e, block.id);
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          title="Connect to another block"
        />
      </div>
    );
  };

  // Helper to get current position (dragging or stored)
  const getBlockPosition = (block) => {
    if (draggingBlock?.id === block.id && dragPosition) {
      return dragPosition;
    }
    return block.position;
  };

  const renderConnections = () => {
    const svg = [];

    // Render existing connections
    for (const conn of strategy.blocks.connections) {
      const fromBlock = allBlocks.find(b => b.id === conn.from);
      const toBlock = allBlocks.find(b => b.id === conn.to);

      if (!fromBlock || !toBlock) continue;

      const fromPos = getBlockPosition(fromBlock);
      const toPos = getBlockPosition(toBlock);

      // Calculate actual connection point positions
      // Block width is 220px, so center is at 110px
      const blockCenterX = 110;
      
      // Output point is at bottom: -8px from CSS, need to add block height
      // Estimate block height based on inputs (header ~50px, each input ~70px)
      const fromDefinition = getBlockDefinition(fromBlock.type);
      const fromInputCount = fromDefinition?.inputs?.length || 0;
      const fromBlockHeight = 50 + (fromInputCount * 70);
      
      const x1 = fromPos.x + blockCenterX;
      const y1 = fromPos.y + fromBlockHeight + 8; // Bottom connection point
      const x2 = toPos.x + blockCenterX;
      const y2 = toPos.y - 8; // Top connection point

      // Curved line for better visual flow
      const midY = (y1 + y2) / 2;

      const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
      const handleDelete = (e) => {
        e.stopPropagation();
        if (confirm('Delete this connection?')) {
          onDeleteConnection(conn.from, conn.to);
        }
      };
      
      svg.push(
        <g key={`${conn.from}-${conn.to}`}>
          {/* Invisible wider hitbox for easier clicking */}
          <path
            d={pathD}
            stroke="transparent"
            strokeWidth="20"
            fill="none"
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onClick={handleDelete}
            title="Click to delete connection"
          />
          {/* Visible connection line */}
          <path
            d={pathD}
            className="connection-line"
            onClick={handleDelete}
            title="Click to delete connection"
            style={{ pointerEvents: 'stroke' }}
          />
          <circle cx={x1} cy={y1} r="4" fill="#667eea" />
          <circle cx={x2} cy={y2} r="4" fill="#667eea" />
        </g>
      );
    }

    // Render connection preview
    if (connectingFrom && connectionPreview) {
      const fromBlock = allBlocks.find(b => b.id === connectingFrom);
      if (fromBlock) {
        const fromPos = getBlockPosition(fromBlock);
        
        // Calculate actual connection point position
        const blockCenterX = 110;
        const fromDefinition = getBlockDefinition(fromBlock.type);
        const fromInputCount = fromDefinition?.inputs?.length || 0;
        const fromBlockHeight = 50 + (fromInputCount * 70);
        
        const x1 = fromPos.x + blockCenterX;
        const y1 = fromPos.y + fromBlockHeight + 8;
        const x2 = connectionPreview.x;
        const y2 = connectionPreview.y;

        const midY = (y1 + y2) / 2;

        svg.push(
          <path
            key="preview"
            d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
            className="connection-line preview"
            strokeDasharray="5,5"
          />
        );
      }
    }

    return svg;
  };

  const handleCanvasMouseUp = (e) => {
    // Only reset if clicking on canvas itself, not on blocks/connection points
    if (e.target === e.currentTarget) {
      setConnectingFrom(null);
      setConnectionPreview(null);
    }
  };

  return (
    <div
      ref={canvasRef}
      className="block-canvas"
      onClick={handleCanvasClick}
      onMouseMove={handleConnectionMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseDown={handleCanvasMouseDown}
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      {/* Zoom Controls */}
      <div className="canvas-zoom-controls">
        <button 
          className="zoom-btn" 
          onClick={() => setZoom(Math.min(2, zoom + 0.1))}
          title="Zoom In"
        >
          +
        </button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button 
          className="zoom-btn" 
          onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
          title="Zoom Out"
        >
          −
        </button>
        <button 
          className="zoom-btn" 
          onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
          title="Reset View"
        >
          ⟲
        </button>
      </div>

      {/* Zoomable/Pannable Container */}
      <div
        ref={containerRef}
        className="canvas-transform-container"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      >
        <svg className="connection-layer">
          {renderConnections()}
        </svg>

        <div className="blocks-layer">
          {allBlocks.map(renderBlock)}
        </div>

        {allBlocks.length === 0 && (
          <div className="canvas-empty-state">
            <div className="empty-icon">🧱</div>
            <h3>Start Building Your Strategy</h3>
            <p>Click blocks from the palette on the left to add them here</p>
            <div className="empty-steps">
              <div className="step">1️⃣ Add condition blocks</div>
              <div className="step">2️⃣ Add logic gates (AND/OR)</div>
              <div className="step">3️⃣ Add action blocks</div>
              <div className="step">4️⃣ Connect blocks together</div>
            </div>
          </div>
        )}

        {connectingFrom && (
          <div className="connection-hint">
            🔗 Click on another block's input point to complete the connection
            <br />
            <small>Click on empty canvas to cancel</small>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="canvas-instructions">
        <small>🖱️ Scroll to zoom • Shift+Drag to pan • Middle-click to pan</small>
      </div>
    </div>
  );
};

export default BlockCanvas;

