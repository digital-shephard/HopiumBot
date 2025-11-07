# Momentum X Hourly Scanner Strategy Guide

## Overview

The **Momentum X Hourly Scanner** is an advanced automated trading system that scans all tracked pairs on an hourly basis, identifies the top 3-5 opportunities, and manages multiple concurrent positions with tranched entries.

This strategy is designed for **systematic portfolio-based trading** across the entire exchange, capturing alpha wherever it appears each hour.

---

## 🎯 Core Concept

### The Problem

Traditional strategies focus on a single pair continuously. But:
- Not every coin moves every hour
- You might be watching BTC chop sideways while SOL is making a massive move
- Capital sits idle during low-probability setups

### The Solution

**Hourly Multi-Pair Opportunity Scanner:**
- Scan **all 30+ tracked pairs** at the top of each hour (XX:00:00)
- Score each pair based on **confluence signals**
- Automatically open positions in the **top 3-5 opportunities**
- Use **tranched entries** (4 × 25% at 0, 15, 30, 45 minutes)
- Close all positions at end of hour (XX:59:00)
- Repeat every hour

---

## 📊 Strategy Architecture

### Components

1. **OpportunityScorer** - Evaluates each pair (0-100 confidence score)
2. **HourlyScanner** - Scans all pairs and ranks them
3. **PositionManager** - Manages 3-5 concurrent positions
4. **HourlyScheduler** - Orchestrates timing of scans, entries, exits

### Timing Flow

```
XX:00:00 - Top of Hour Scan
├─ Scan all pairs
├─ Score each pair (0-100)
├─ Select top 3-5 (confidence ≥75)
└─ Open positions (1st tranche: 25%)

XX:15:00 - Tranche 2
└─ Add 25% to profitable positions

XX:30:00 - Mid-Hour Check
├─ Execute 3rd tranche (25%)
├─ Scan for exceptional opportunities (≥90 confidence)
├─ Close losing positions (down >1.5% with reversal)
└─ Open new exceptional positions if room

XX:45:00 - Tranche 4
└─ Add final 25% to profitable positions

XX:59:00 - End of Hour
├─ Close ALL positions
├─ Calculate hour PnL
└─ Prepare for next hour
```

---

## 🔍 Opportunity Scoring System

Each pair is scored 0-100 based on **5 categories**:

### 1. Momentum Score (0-25 points)

**What it measures:** Price velocity and acceleration

**Signals:**
- Strong momentum: >2% move in last 30 minutes = 15 pts
- Moderate momentum: >1% move = 8 pts
- Acceleration bonus: 15-min change > 30-min change = +10 pts

**Example:**
```
Price 30min ago: $100
Price 15min ago: $101 (+1%)
Price now: $102.50 (+2.5%)
Score: 15 (strong) + 10 (accelerating) = 25/25
```

### 2. Order Book Score (0-25 points)

**What it measures:** Liquidity imbalance (whale pressure)

**Signals:**
- Strong imbalance: ≥3:1 bid/ask ratio = 25 pts
- Moderate imbalance: ≥2:1 ratio = 15 pts

**Example:**
```
Bid qty: 750 BTC
Ask qty: 250 BTC
Ratio: 3:1 (buy pressure)
Score: 25/25
```

### 3. Volume Score (0-20 points)

**What it measures:** Conviction via volume spikes

**Signals:**
- Volume spike: ≥2x average = 12 pts
- Buy/sell pressure: >60% buy volume = +8 pts
- Combined: 20 pts maximum

**Example:**
```
Average volume: 50 BTC
Current volume: 120 BTC (2.4x)
Buy volume: 78 BTC (65%)
Score: 12 + 8 = 20/20
```

### 4. Technical Score (0-15 points)

**What it measures:** Smart money signals

**Signals:**
- Liquidity sweep detected = 8 pts
- Fair value gap fill in progress = 7 pts

**Example:**
```
Sweep detected at $99,500
Currently bouncing from sweep = 8 pts
In bullish FVG zone = 7 pts
Score: 15/15
```

### 5. Trend Score (0-15 points)

**What it measures:** Higher timeframe alignment

**Signals:**
- Strong 4H trend: >3% move = 15 pts
- Moderate 4H trend: >1% move = 8 pts

**Example:**
```
4H chart: +4.2% (strong uptrend)
Score: 15/15
```

### Total Confidence Score

```
Maximum Possible: 100 points
Minimum for Entry: 75 points
Exceptional Setup: ≥90 points
```

---

## 🎲 Position Management

### Concurrent Positions

- **Maximum:** 3-5 positions at once
- **Why multiple?** Diversification + capture multiple opportunities
- **Conflict avoidance:** No duplicate symbols

### Tranched Entry System

**Philosophy:** Build conviction as the hour progresses

```
Tranche 1 (XX:00) - 25% of target size
├─ Initial entry at top of hour
└─ Based on initial scan confidence

Tranche 2 (XX:15) - 25%
├─ Only add if position flat or profitable
└─ Skip if down >1%

Tranche 3 (XX:30) - 25%
├─ Only add if position holding
└─ Skip if down >1%

Tranche 4 (XX:45) - 25%
├─ Final tranche (full size achieved)
└─ Only if still profitable
```

**Example:**

```
SOL-PERP Opportunity @ 90 confidence
├─ Target Position: $10,000
├─ Max Leverage: 10x
├─ Tranche Size: $2,500 each

XX:00:00 - Open position
├─ Entry: $110.50
├─ Size: $2,500 (25%)
└─ Status: Monitoring

XX:15:00 - Tranche 2
├─ Price: $111.20 (+0.6%)
├─ Add: $2,500
└─ Total: $5,000 (50%)

XX:30:00 - Tranche 3
├─ Price: $111.80 (+1.2%)
├─ Add: $2,500
└─ Total: $7,500 (75%)

XX:45:00 - Tranche 4
├─ Price: $112.40 (+1.7%)
├─ Add: $2,500
└─ Total: $10,000 (100% - full position)

XX:59:00 - Close position
├─ Exit: $113.10
├─ PnL: +$234 (+2.35%)
└─ Move to next hour
```

---

## ⚡ Mid-Hour Check (XX:30:00)

### Purpose

Markets change. The mid-hour check allows **adaptive position management**.

### Actions

1. **Exit Weak Positions**
   - If position down >1.5% with reversal signals
   - Frees capital for better opportunities

2. **Scan for Exceptional Setups**
   - Only opportunities with ≥90 confidence
   - Maximum 3 new opportunities mid-hour

3. **Open New Positions**
   - Only if we have room (<5 positions)
   - Only for exceptional setups

### Example

```
Mid-Hour Scan Results:

Current Positions:
├─ SOL-PERP: +1.2% (keep)
├─ AVAX-PERP: -1.8% (close - reversal detected)
└─ Room for 1 new position

Exceptional Opportunities Found:
└─ LINK-PERP: 92 confidence (LONG)

Actions:
├─ Close AVAX-PERP (-1.8%)
└─ Open LINK-PERP (new exceptional setup)
```

---

## 🏆 Liquidity Tiers

Different pairs have different liquidity. Position limits adapt automatically:

### Tier 1 - Major Pairs (BTC, ETH, SOL)
```
Max Position: $50,000
Max Leverage: 20x
Spread: <0.02% (Excellent)
Examples: BTCUSDT, ETHUSDT, SOLUSDT
```

### Tier 2 - Top 10 Alts
```
Max Position: $10,000
Max Leverage: 10x
Spread: <0.05% (Good)
Examples: AVAXUSDT, MATICUSDT, LINKUSDT
```

### Tier 3 - Mid-Caps
```
Max Position: $3,000
Max Leverage: 5x
Spread: <0.1% (Fair)
Examples: Less liquid altcoins
```

### Tier 4 - Long-Tails
```
Max Position: $1,000
Max Leverage: 3x
Spread: >0.1% (Poor)
Warning: High slippage risk
```

**The system automatically caps position size based on the tier.**

---

## 📡 WebSocket Integration

Clients receive real-time updates throughout the hour:

### Message Types

#### 1. Hourly Opportunities (XX:00)

```json
{
  "type": "hourly_opportunities",
  "data": {
    "timestamp": "2025-11-07T14:00:00Z",
    "hour_window": "14:00-15:00",
    "top_picks": [
      {
        "symbol": "SOL-PERP",
        "direction": "LONG",
        "confidence": 92,
        "momentum_score": 25,
        "orderbook_score": 23,
        "volume_score": 18,
        "technical_score": 12,
        "trend_score": 14,
        "liquidity_tier": "Tier1",
        "max_position_size": 50000,
        "max_leverage": 20,
        "suggested_entry": 110.50,
        "suggested_tp": 111.60,
        "suggested_sl": 107.75
      }
    ],
    "total_scanned": 32,
    "scan_duration": "2.3s"
  }
}
```

#### 2. Position Updates

```json
{
  "type": "position_update",
  "event": "open",  // or "tranche", "close"
  "data": {
    "id": "SOL-PERP_1730995200",
    "symbol": "SOL-PERP",
    "direction": "LONG",
    "entry_time": "2025-11-07T14:00:00Z",
    "current_size": 2500,
    "target_size": 10000,
    "tranches_executed": 1,
    "avg_entry_price": 110.50,
    "unrealized_pnl": 0,
    "status": "ACTIVE"
  }
}
```

#### 3. Mid-Hour Opportunities (XX:30)

```json
{
  "type": "mid_hour_opportunities",
  "data": {
    "timestamp": "2025-11-07T14:30:00Z",
    "hour_window": "14:30 Mid-Hour",
    "top_picks": [
      {
        "symbol": "LINK-PERP",
        "confidence": 94,
        "direction": "LONG",
        ...
      }
    ]
  }
}
```

#### 4. Hour End Summary (XX:59)

```json
{
  "type": "hour_end",
  "hour_window": "14:00-15:00",
  "data": {
    "positions_closed": 3,
    "total_pnl": 457.32,
    "avg_pnl_percent": 1.82,
    "positions": [
      {
        "symbol": "SOL-PERP",
        "pnl": 234.50,
        "pnl_percent": 2.35
      }
    ]
  }
}
```

---

## 🎮 Usage

### Backend Integration

```go
import (
    "github.com/razgriz/hopiumcore/internal/modules/perps/strategies"
)

// Initialize scheduler
scheduler := strategies.NewHourlyScheduler(storage, symbols, maxPositions)

// Set callbacks for WebSocket broadcasting
scheduler.SetCallbacks(
    // Hourly opportunities
    func(opp *strategies.HourlyOpportunity) {
        hub.BroadcastHourlyOpportunities(opp)
    },
    
    // Mid-hour opportunities
    func(opp *strategies.HourlyOpportunity) {
        hub.BroadcastMidHourOpportunities(opp)
    },
    
    // Position updates
    func(pos *strategies.Position) {
        hub.BroadcastPositionUpdate(pos, "update")
    },
    
    // Hour end
    func(hourWindow string, positions []*strategies.Position) {
        summary := calculateSummary(positions)
        hub.BroadcastHourEnd(hourWindow, summary)
    },
)

// Start the scheduler
scheduler.Start()
```

### Frontend Integration (JavaScript)

```javascript
const ws = new WebSocket('wss://your-server.com/ws');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch(msg.type) {
    case 'hourly_opportunities':
      // Display top opportunities for the hour
      displayOpportunities(msg.data.top_picks);
      break;
      
    case 'position_update':
      // Update position UI
      updatePosition(msg.data);
      break;
      
    case 'mid_hour_opportunities':
      // Alert user to exceptional setups
      showAlert('Mid-hour opportunity!', msg.data);
      break;
      
    case 'hour_end':
      // Show hour summary
      displayHourSummary(msg.data);
      break;
  }
};
```

---

## 📈 Performance Expectations

### Win Rate
- Target: **55-60%** of hourly positions profitable
- High confidence (≥90): **65-70%** win rate
- Low confidence (75-80): **50-55%** win rate

### Risk/Reward
- Average winner: **+1.5% to +2.5%**
- Average loser: **-1% to -2%** (tight stops)
- Stop loss: **2.5%** max loss per position

### Fee Considerations
- 24 hours = ~72-120 trades (3-5 positions × 24 hours)
- Fee per trade: ~0.05% (maker) to 0.08% (taker)
- Daily fee drag: ~2-3% of capital deployed
- **Net positive if edge >2-3%**

### Capital Efficiency
- Multiple positions = portfolio diversification
- Not all-in on single trade
- Risk spread across 3-5 uncorrelated setups

---

## ⚠️ Risk Management

### Position Level
- **Stop loss:** 2.5% on every position
- **Take profit:** 1-2% target (let winners run to hour end)
- **Mid-hour exit:** Close if down >1.5% with reversal

### Portfolio Level
- **Max concurrent positions:** 3-5
- **Max per position:** Tier-based ($1k to $50k)
- **Total exposure:** Sum of all positions

### Liquidity-Based Limits
- Tier 4 coins: $1k max (high slippage risk)
- Tier 1 coins: $50k max (deep liquidity)
- **System enforces limits automatically**

---

## 🧪 Backtesting & Live Testing

### Paper Trading Mode

Before live trading, run in **paper mode**:

1. Scanner runs normally
2. Positions tracked internally (no real orders)
3. PnL calculated based on market prices
4. Collect 1-2 weeks of data

**Metrics to track:**
- Win rate by confidence tier
- Average PnL per position
- Best/worst hours (time of day patterns)
- Best/worst pairs

### Tuning Parameters

Based on paper trading results, adjust:

```go
// Minimum confidence for entry (default: 75)
scanner.minConfidence = 80  // More conservative

// Max concurrent positions (default: 5)
manager.maxConcurrentPositions = 3  // Less aggressive

// Mid-hour reversal threshold (default: 1.5%)
manager.midHourReversalThreshold = 2.0  // Less mid-hour exits
```

---

## 🎓 Strategy Philosophy

### Why Hourly?

1. **Discipline:** Forces evaluation and exit every hour
2. **Opportunity:** 24 chances per day to find alpha
3. **No bag-holding:** Can't hold losers indefinitely
4. **Fresh start:** Each hour is a new opportunity

### Why Multi-Pair?

1. **Natural selection:** Trade what's moving, not what's stuck
2. **Diversification:** Don't put all eggs in one basket
3. **Alpha capture:** Opportunities appear across entire exchange
4. **Information edge:** Your scanner sees everything

### Why Tranched Entries?

1. **Build conviction:** Don't go all-in on first signal
2. **Better average price:** DCA into winning positions
3. **Cut losers fast:** Stop adding to losing trades
4. **Risk management:** Gradual exposure increase

---

## 🚀 Future Enhancements

### Planned Features

1. **Machine Learning Scoring**
   - Train ML model on historical hourly data
   - Predict win probability for each setup
   - Dynamic confidence scoring

2. **Volatility Regimes**
   - Detect market-wide volatility
   - Adjust position sizing during high vol
   - Skip trading during extreme conditions

3. **Correlation Filtering**
   - Avoid highly correlated positions
   - True diversification across uncorrelated pairs

4. **Time-of-Day Optimization**
   - Some hours better than others (Asian/EU/US sessions)
   - Adjust thresholds by time of day

5. **Pair-Specific Tuning**
   - BTC might need different thresholds than alts
   - Learn optimal parameters per symbol

---

## 📚 Additional Resources

- **API Integration Guide:** See `API_INTEGRATION_GUIDE.md`
- **WebSocket Security:** See `WEBSOCKET_SECURITY_GUIDE.md`
- **Authentication:** See `AUTHENTICATION_GUIDE.md`

---

## 🆘 Troubleshooting

### No Opportunities Found

**Cause:** No pairs meet minimum confidence (75)

**Solutions:**
- Lower `minConfidence` to 70
- Check if data is stale (collector running?)
- Verify enough historical data (need 4H lookback)

### Too Many Mid-Hour Exits

**Cause:** Positions reversing frequently

**Solutions:**
- Increase `midHourReversalThreshold` to 2%
- Reduce initial position sizing (more conservative)
- Check if stop losses are too tight

### Positions Not Adding Tranches

**Cause:** Position down >1% when tranche due

**Solutions:**
- Review entry quality (are you entering too late?)
- Widen tranche addition threshold to -0.5%
- Check if market conditions changed mid-hour

---

## 📞 Support

For questions or issues:
- GitHub Issues: [Your Repo]
- Discord: [Your Server]
- Email: [Your Email]

---

**Built with ❤️ for systematic crypto trading**

