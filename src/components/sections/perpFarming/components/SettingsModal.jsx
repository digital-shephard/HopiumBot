import React from 'react'

/**
 * Settings Modal Component
 * Handles all trading configuration settings including:
 * - API credentials
 * - Capital and leverage
 * - TP/SL settings
 * - Strategy selection
 * - Auto Mode / Smart Mode toggles
 * - Pair selection and exclusion
 */
const SettingsModal = ({
  // Modal state
  onClose,
  isRunning,
  isValidating,
  validationError,
  showPairSelection,
  setShowPairSelection,
  showExclusionList,
  setShowExclusionList,
  
  // API Credentials
  asterApiKey,
  setAsterApiKey,
  asterSecretKey,
  setAsterSecretKey,
  shakeApiKey,
  shakeSecretKey,
  setValidationError,
  
  // Capital and Position
  capital,
  setCapital,
  shakeCapital,
  leverage,
  setLeverage,
  positionSize,
  setPositionSize,
  
  // TP/SL
  tpSlMode,
  setTpSlMode,
  takeProfit,
  setTakeProfit,
  stopLoss,
  setStopLoss,
  
  // Strategy and Order Type
  strategy,
  setStrategy,
  orderType,
  setOrderType,
  orderTimeout,
  setOrderTimeout,
  
  // Mode Toggles
  autoMode,
  setAutoMode,
  smartMode,
  setSmartMode,
  smartModeMinPnl,
  setSmartModeMinPnl,
  trustLowConfidence,
  setTrustLowConfidence,
  
  // Exit Strategies
  breakEvenMode,
  setBreakEvenMode,
  breakEvenLossTolerance,
  setBreakEvenLossTolerance,
  trailingBreakEven,
  setTrailingBreakEven,
  trailingIncrement,
  setTrailingIncrement,
  
  // Pair Selection
  availableSymbols,
  loadingSymbols,
  selectedPairs,
  togglePairSelection,
  excludedPairs,
  setExcludedPairs,
  
  // Custom Strategies
  customStrategies,
  onOpenStrategyBuilder,
  
  // Actions
  handleStart,
  formatPercentage
}) => {
  return (
    <div className="risk-modal-overlay" onClick={onClose}>
      <div className="risk-modal" onClick={(e) => e.stopPropagation()}>
        <button className="risk-modal-close" onClick={onClose}>×</button>
        <div className="risk-modal-wrapper">
          <h2 className="risk-modal-title">
            {showPairSelection ? 'Select Pairs' : showExclusionList ? 'Exclude Pairs' : 'Risk Settings'}
          </h2>
          
          {/* Back button when in pair selection or exclusion list view */}
          {(showPairSelection || showExclusionList) && (
            <button 
              className="pair-back-button"
              onClick={() => {
                setShowPairSelection(false)
                setShowExclusionList(false)
              }}
            >
              ← Back to Settings
            </button>
          )}
          
          <div className="risk-modal-content">
          
          {/* Exclusion List View */}
          {showExclusionList ? (
            <div className="pair-selection-content">
              <div className="pair-selection-info">
                <p>Select pairs to <strong>EXCLUDE</strong> from Auto Mode</p>
                <p>⚠️ Bot will never open or close these pairs (manual trading protection)</p>
                <p className="pair-selection-count">
                  {excludedPairs.length} excluded
                </p>
              </div>
              
              {loadingSymbols ? (
                <div className="loading-symbols">Loading available pairs...</div>
              ) : (
                <div className="pairs-list">
                  {availableSymbols.map((symbol) => {
                    const isExcluded = excludedPairs.includes(symbol)
                    
                    return (
                      <label 
                        key={symbol} 
                        className={`pair-checkbox-item ${isExcluded ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          onChange={() => {
                            setExcludedPairs(prev => 
                              isExcluded 
                                ? prev.filter(s => s !== symbol)
                                : [...prev, symbol]
                            )
                          }}
                        />
                        <span className="pair-symbol">{symbol}</span>
                        {isExcluded && <span className="check-mark">🚫</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          ) : showPairSelection ? (
            <div className="pair-selection-content">
              <div className="pair-selection-info">
                <p>Select up to 5 trading pairs to track simultaneously</p>
                <p className="pair-selection-count">
                  {selectedPairs.length} / 5 selected
                  {selectedPairs.length >= 5 && <span className="max-reached"> (Max reached)</span>}
                </p>
              </div>
              
              {loadingSymbols ? (
                <div className="loading-symbols">Loading available pairs...</div>
              ) : (
                <div className="pairs-list">
                  {availableSymbols.map((symbol) => {
                    const isSelected = selectedPairs.includes(symbol)
                    const isMaxReached = selectedPairs.length >= 5 && !isSelected
                    
                    return (
                      <label 
                        key={symbol} 
                        className={`pair-checkbox-item ${isSelected ? 'selected' : ''} ${isMaxReached ? 'disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePairSelection(symbol)}
                          disabled={isMaxReached}
                        />
                        <span className="pair-symbol">{symbol}</span>
                        {isSelected && <span className="check-mark">✓</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            // Risk Settings View
            <>
          {/* Auto Mode Checkbox - At the VERY top */}
          <div className="risk-form-group auto-mode-section">
            <label className="risk-label">Auto Mode 🤖</label>
            <label className="breakeven-option">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                className="breakeven-radio"
              />
              <span className="breakeven-option-text">
                🎯 Enable Portfolio Scanner (Fully Automated Multi-Pair Trading)
              </span>
            </label>
            <div className="breakeven-description">
              🎯 <strong>V2 Swing Structure Scanner:</strong> Monitors 154 pairs every 5 minutes using 4H swing analysis. Automatically selects top 3 opportunities (always includes ≥1 LONG unless all longs score &lt;50). Enters with split orders (20% immediate + 80% at better price) and exits on structure break (invalidation_price). Capital splits evenly across 3 positions. Manual strategy ignored.
            </div>
            
            {/* Exclusion List Button - Only show when Auto Mode enabled */}
            {autoMode && (
              <div className="exclusion-list-section" style={{ marginTop: '12px' }}>
                <button 
                  className="pair-selection-button"
                  onClick={() => setShowExclusionList(true)}
                  type="button"
                >
                  <span className="pair-count">
                    {excludedPairs.length === 0 ? 'No pairs excluded' : `${excludedPairs.length} pair${excludedPairs.length !== 1 ? 's' : ''} excluded`}
                  </span>
                  <span className="pair-arrow">→</span>
                </button>
                {excludedPairs.length > 0 && (
                  <div className="selected-pairs-preview">
                    🚫 {excludedPairs.slice(0, 3).join(', ')}
                    {excludedPairs.length > 3 && ` +${excludedPairs.length - 3} more`}
                  </div>
                )}
                <div className="breakeven-description" style={{ marginTop: '8px' }}>
                  Exclude pairs you're trading manually. Bot will never touch these pairs.
                </div>
              </div>
            )}
          </div>
          
          {/* Pair Selection Button - Only show when not in pair selection view AND Auto Mode is OFF */}
          {!autoMode && (
            <div className="pair-selection-header">
              <button 
                className="pair-selection-button"
                onClick={() => setShowPairSelection(true)}
              >
                <span className="pair-count">{selectedPairs.length} pair{selectedPairs.length !== 1 ? 's' : ''} selected</span>
                <span className="pair-arrow">→</span>
              </button>
              <div className="selected-pairs-preview">
                {selectedPairs.slice(0, 3).join(', ')}
                {selectedPairs.length > 3 && ` +${selectedPairs.length - 3} more`}
              </div>
            </div>
          )}

          {/* Smart Mode Checkbox - Only show if Auto Mode is OFF */}
          {!autoMode && (
          <div className="risk-form-group smart-mode-section">
            <label className="risk-label">Smart Mode</label>
            <label className="breakeven-option">
              <input
                type="checkbox"
                checked={smartMode}
                onChange={(e) => setSmartMode(e.target.checked)}
                className="breakeven-radio"
              />
              <span className="breakeven-option-text">
                🧠 Active Position Management
              </span>
            </label>
            <div className="breakeven-description">
              🧠 Intelligent position management with 8 exit strategies: (1) Strong reversal, (2) Profit protection, (3) Confidence decay, (4) Consecutive weakness, (5) Persistent reversal, (6) Profit erosion, (7) Stale positions, (8) Confidence downtrend. Adapts based on PNL, time in position, and signal quality trends.
            </div>
            {smartMode && (
              <div className="breakeven-tolerance-section" style={{ marginTop: '12px' }}>
                <label className="risk-label">Minimum PNL for Smart Exit</label>
                <input
                  type="number"
                  value={smartModeMinPnl}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || val === '-') {
                      setSmartModeMinPnl(-50)
                    } else {
                      const parsed = parseFloat(val)
                      setSmartModeMinPnl(isNaN(parsed) ? -50 : parsed)
                    }
                  }}
                  className="risk-input"
                  placeholder="-50"
                  step="10"
                />
                <div className="breakeven-description">
                  Smart Mode won't exit if Net PNL is below this threshold. Set to 0 to only exit at breakeven or better. Default: -$50
                </div>
              </div>
            )}
          </div>
          )}

          {/* Trust Low Confidence Checkbox - Only show if Auto Mode is OFF */}
          {!autoMode && (
          <div className="risk-form-group">
            <label className="risk-label">Signal Confidence</label>
            <label className="breakeven-option">
              <input
                type="checkbox"
                checked={trustLowConfidence}
                onChange={(e) => setTrustLowConfidence(e.target.checked)}
                className="breakeven-radio"
              />
              <span className="breakeven-option-text">
                ⚠️ Trust Low Confidence Signals
              </span>
            </label>
            <div className="breakeven-description">
              By default, only high and medium confidence signals are traded. Enable this to also trade low confidence signals. Warning: May increase losses.
            </div>
          </div>
          )}

          <div className="risk-form-group">
            <label className="risk-label">Aster API Key</label>
            <input
              type="text"
              className={`risk-input ${shakeApiKey ? 'shake-red' : ''}`}
              value={asterApiKey}
              onChange={(e) => {
                setAsterApiKey(e.target.value)
                setValidationError('') // Clear error when user starts typing
              }}
              placeholder="Enter your Aster API key"
            />
          </div>

          <div className="risk-form-group">
            <label className="risk-label">Aster API Secret</label>
            <input
              type="password"
              className={`risk-input ${shakeSecretKey ? 'shake-red' : ''}`}
              value={asterSecretKey}
              onChange={(e) => {
                setAsterSecretKey(e.target.value)
                setValidationError('') // Clear error when user starts typing
              }}
              placeholder="Enter your Aster API secret"
            />
          </div>

          <div className="risk-form-group">
            <label className="risk-label">Capital Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`risk-input ${shakeCapital ? 'shake-red' : ''}`}
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              placeholder="Enter capital amount"
            />
          </div>

          <div className="risk-form-group">
            <label className="risk-label">
              Leverage: {leverage}x
            </label>
            <div className="risk-slider-container">
              <input
                type="range"
                min="1"
                max="100"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="risk-slider leverage-slider"
                style={{
                  background: `linear-gradient(to right, 
                    #00ff00 0%, 
                    #00ff00 25%, 
                    #ffff00 25%, 
                    #ffff00 50%, 
                    #ff9900 50%, 
                    #ff9900 75%, 
                    #ff0000 75%, 
                    #ff0000 100%)`
                }}
              />
              <div className="risk-slider-labels">
                <span>1x</span>
                <span>25x</span>
                <span>50x</span>
                <span>75x</span>
                <span>100x</span>
              </div>
            </div>
          </div>

          {/* TP/SL Settings - Hide in Auto Mode (uses server's structure-based targets) */}
          {!autoMode && (
          <>
          <div className="risk-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="risk-label" style={{ margin: 0 }}>TP/SL Mode</label>
              <div className="tpsl-toggle">
                <button 
                  className={`toggle-option ${tpSlMode === 'percent' ? 'active' : ''}`}
                  onClick={() => setTpSlMode('percent')}
                >
                  %
                </button>
                <button 
                  className={`toggle-option ${tpSlMode === 'dollar' ? 'active' : ''}`}
                  onClick={() => setTpSlMode('dollar')}
                >
                  $
                </button>
              </div>
            </div>
          </div>

          <div className="risk-form-group">
            <label className="risk-label">
              Take Profit: {tpSlMode === 'percent' ? formatPercentage(takeProfit) : `$${takeProfit}`}
            </label>
            {tpSlMode === 'percent' ? (
              <div className="risk-slider-container">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(Number(e.target.value))}
                  className="risk-slider"
                />
                <div className="risk-slider-labels">
                  <span>None</span>
                  <span>100%</span>
                </div>
              </div>
            ) : (
              <input
                type="number"
                min="0"
                step="0.01"
                className="risk-input"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Enter dollar amount"
              />
            )}
          </div>

          <div className="risk-form-group">
            <label className="risk-label">
              Stop Loss: {tpSlMode === 'percent' ? formatPercentage(stopLoss) : `$${stopLoss}`}
            </label>
            {tpSlMode === 'percent' ? (
              <div className="risk-slider-container">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(Number(e.target.value))}
                  className="risk-slider"
                />
                <div className="risk-slider-labels">
                  <span>None</span>
                  <span>100%</span>
                </div>
              </div>
            ) : (
              <input
                type="number"
                min="0"
                step="0.01"
                className="risk-input"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Enter dollar amount"
              />
            )}
          </div>

          <div className="risk-form-group">
            <label className="risk-label">
              Position Size: {positionSize}%
            </label>
            <div className="risk-slider-container">
              <input
                type="range"
                min="1"
                max="100"
                value={positionSize}
                onChange={(e) => setPositionSize(Number(e.target.value))}
                className="risk-slider position-size-slider"
                style={{
                  background: `linear-gradient(to right, 
                    #00ff00 0%, 
                    #00ff00 50%, 
                    #ffff00 50%, 
                    #ffff00 75%, 
                    #ff0000 75%, 
                    #ff0000 100%)`
                }}
              />
              <div className="risk-slider-labels">
                <span>1%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
          </>
          )}

          {/* Order Type - Hide if Auto Mode (uses MARKET only) */}
          {!autoMode && (
          <div className="risk-form-group">
            <label className="risk-label">Order Type</label>
            <div className="order-type-toggle">
              <button 
                className={`toggle-option ${orderType === 'LIMIT' ? 'active' : ''}`}
                onClick={() => setOrderType('LIMIT')}
              >
                LIMIT
              </button>
              <button 
                className={`toggle-option ${orderType === 'MARKET' ? 'active' : ''}`}
                onClick={() => setOrderType('MARKET')}
              >
                MARKET
              </button>
            </div>
            <div className="strategy-description">
              {orderType === 'LIMIT'
                ? '📍 Uses server limit price. May not fill if price moves away.'
                : '⚡ Instant fill at market price. Ignores server limit price and APEs in!'
              }
            </div>
          </div>
          )}

          {/* Order Timeout - Hide if Auto Mode (uses MARKET only) */}
          {!autoMode && (
          <div className="risk-form-group">
            <label className="risk-label">Limit Order Timeout: {orderTimeout}s</label>
            <input
              type="range"
              min="30"
              max="300"
              step="30"
              value={orderTimeout}
              onChange={(e) => setOrderTimeout(parseInt(e.target.value))}
              className="risk-slider"
            />
            <div className="slider-labels">
              <span>30s</span>
              <span>150s</span>
              <span>300s</span>
            </div>
            <div className="strategy-description">
              ⏱️ Cancel unfilled LIMIT orders after this time to allow new signals
            </div>
          </div>
          )}

          {/* Strategy - Hide if Auto Mode (uses scanner) */}
          {!autoMode && (
          <div className="risk-form-group">
            <label className="risk-label">Trading Strategy</label>
            <select
              className="risk-input strategy-dropdown"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              <option value="range_trading">Range Trading (Mean Reversion)</option>
              <option value="momentum">Momentum (LLM-Powered)</option>
              <option value="scalp">Aggressive Reversion Scalping ⚡</option>
              <option value="momentum_x">Momentum X (Psychic Candle Reader) 🔥</option>
              <option value="orderbook_trading">Order Book Trading (Near Real-Time) 🔥⚡</option>
              {customStrategies && customStrategies.length > 0 && <option disabled>──────────</option>}
              {customStrategies && customStrategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  🧱 {strategy.name} (Custom)
                </option>
              ))}
            </select>
            <div className="strategy-description">
              {strategy === 'range_trading' 
                ? '📊 Trades bounces off 24h support/resistance levels'
                : strategy === 'momentum'
                ? '🤖 AI-powered trend-following using GPT-5 analysis'
                : strategy === 'scalp'
                ? '⚡ Ultra-fast 30-second signals, optimized for 75x leverage'
                : strategy === 'momentum_x'
                ? '🔮 8-layer whipsaw scalper with delta, orderbook, FVG analysis @ 100x'
                : strategy === 'orderbook_trading'
                ? '📊 10-second order flow analysis with CVD, OBI, VWAP. Stays in until reversal!'
                : customStrategies?.find(s => s.id === strategy)
                ? `🧱 Custom strategy: ${customStrategies.find(s => s.id === strategy).name}`
                : '📊 10-second order flow analysis with CVD, OBI, VWAP. Stays in until reversal!'
              }
            </div>
            <button 
              className="create-strategy-button"
              onClick={onOpenStrategyBuilder}
              type="button"
            >
              <span className="button-icon">🧱</span>
              Create Custom Strategy
            </button>
            <div className="strategy-builder-description">
              Build your own strategy with visual blocks - no coding required!
            </div>
          </div>
          )}

          {/* Exit Strategy - Hide in Auto Mode (uses intelligent TP trailing) */}
          {!autoMode && (
          <div className="risk-form-group">
            <label className="risk-label">Exit Strategy</label>
            
            {/* Simple Break-Even Option */}
            <label className="breakeven-option">
              <input
                type="radio"
                name="exitStrategy"
                checked={breakEvenMode && !trailingBreakEven}
                onChange={() => {
                  setBreakEvenMode(true)
                  setTrailingBreakEven(false)
                }}
                className="breakeven-radio"
              />
              <span className="breakeven-option-text">
                Simple Break-Even (Volume Farming)
              </span>
            </label>
            {breakEvenMode && !trailingBreakEven && (
              <>
                <div className="breakeven-description">
                  💰 Closes at Net PNL ≥ $0. Minimizes risk, maximizes volume.
                </div>
                <div className="breakeven-tolerance-section">
                  <label className="risk-label">Loss Tolerance</label>
                  <input
                    type="number"
                    value={breakEvenLossTolerance}
                    onChange={(e) => setBreakEvenLossTolerance(parseFloat(e.target.value) || 0)}
                    className="risk-input"
                    placeholder="20"
                    min="0"
                    step="5"
                  />
                  <div className="breakeven-description">
                    If PnL gets close to breakeven then falls back, will close when it returns within -${breakEvenLossTolerance}
                  </div>
                </div>
              </>
            )}

            {/* Trailing Break-Even Option */}
            <label className="breakeven-option">
              <input
                type="radio"
                name="exitStrategy"
                checked={trailingBreakEven}
                onChange={() => {
                  setBreakEvenMode(false)
                  setTrailingBreakEven(true)
                }}
                className="breakeven-radio"
              />
              <span className="breakeven-option-text">
                Trailing Break-Even Stop Loss
              </span>
            </label>
            {trailingBreakEven && (
              <div className="trailing-config">
                <div className="breakeven-description">
                  🎯 For every ${trailingIncrement} profit, stop loss moves up ${trailingIncrement}. Normal TP still applies.
                </div>
                
                <div className="trailing-setting">
                  <label className="risk-label">Trailing Increment: ${trailingIncrement}</label>
                  <div className="risk-slider-container">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={trailingIncrement}
                      onChange={(e) => setTrailingIncrement(Number(e.target.value))}
                      className="risk-slider"
                    />
                    <div className="risk-slider-labels">
                      <span>$1</span>
                      <span>$50</span>
                      <span>$100</span>
                    </div>
                  </div>
                  <div className="breakeven-description">
                    Example: At ${trailingIncrement} increment, reaching $60 profit sets stop at $40 (allows one ${trailingIncrement} pullback)
                  </div>
                </div>
              </div>
            )}

            {/* Standard TP/SL Option */}
            <label className="breakeven-option">
              <input
                type="radio"
                name="exitStrategy"
                checked={!breakEvenMode && !trailingBreakEven}
                onChange={() => {
                  setBreakEvenMode(false)
                  setTrailingBreakEven(false)
                }}
                className="breakeven-radio"
              />
              <span className="breakeven-option-text">
                Standard TP/SL (Manual Settings Above)
              </span>
            </label>
          </div>
          )}

          {validationError && (
            <div className="risk-error-message">
              {validationError}
            </div>
          )}

          <button className="risk-save-button" onClick={handleStart} disabled={isRunning || isValidating}>
            {isRunning ? 'Running...' : isValidating ? 'Validating...' : 'Start'}
          </button>
          </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal

