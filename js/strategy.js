/* ========================================
   Strategy Engine — 8 trading strategies (pure JS)
   ======================================== */

class BaseStrategy {
  constructor(params = {}) {
    this.params = { ...this.constructor.defaultParams(), ...params };
  }

  static defaultParams() { return {}; }

  /**
   * Generate trading signals from kline data.
   * @param {Array} data - [{date, open, close, high, low, volume}, ...]
   * @returns {{ signals: Array<{date, type, price, reason}>, indicators: Object }}
   */
  generateSignals(data) {
    throw new Error('generateSignals() must be implemented by subclass');
  }

  // ---- Static helpers ----

  /** Simple Moving Average */
  static ma(data, field, window) {
    const values = data.map(d => d[field]);
    const result = new Array(data.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= window) sum -= values[i - window];
      if (i >= window - 1) result[i] = sum / window;
    }
    return result;
  }

  /** Exponential Moving Average */
  static ema(data, field, window) {
    const values = data.map(d => d[field]);
    const result = new Array(data.length).fill(null);
    const alpha = 2 / (window + 1);

    // Seed: use SMA for first valid value
    let firstValid = -1;
    for (let i = 0; i < values.length; i++) {
      if (i >= window - 1) { firstValid = i; break; }
    }
    if (firstValid === -1) return result;

    // Initial SMA
    let sum = 0;
    for (let i = firstValid - window + 1; i <= firstValid; i++) sum += values[i];
    result[firstValid] = sum / window;

    // EMA from firstValid+1
    for (let i = firstValid + 1; i < values.length; i++) {
      result[i] = alpha * values[i] + (1 - alpha) * result[i - 1];
    }
    return result;
  }

  /** Check if series a crosses ABOVE series b at index i */
  static crossAbove(a, b, i) {
    if (i < 1) return false;
    if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) return false;
    return a[i] > b[i] && a[i - 1] <= b[i - 1];
  }

  /** Check if series a crosses BELOW series b at index i */
  static crossBelow(a, b, i) {
    if (i < 1) return false;
    if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) return false;
    return a[i] < b[i] && a[i - 1] >= b[i - 1];
  }

  /** Standard deviation of array segment */
  static std(values, start, end) {
    let sum = 0, count = end - start + 1;
    for (let i = start; i <= end; i++) sum += values[i];
    const mean = sum / count;
    let sqSum = 0;
    for (let i = start; i <= end; i++) sqSum += (values[i] - mean) ** 2;
    return Math.sqrt(sqSum / count);
  }
}

// ======================================================
// Strategy 1: 双均线交叉法 (Dual MA Crossover)
// ======================================================
class DualMAStrategy extends BaseStrategy {
  static defaultParams() { return { short_window: 5, long_window: 20 }; }

  generateSignals(data) {
    const { short_window, long_window } = this.params;
    const closes = data.map(d => d.close);
    const maShort = BaseStrategy.ma(data, 'close', short_window);
    const maLong = BaseStrategy.ma(data, 'close', long_window);
    const signals = [];
    const startIdx = Math.max(short_window, long_window);

    for (let i = startIdx; i < data.length; i++) {
      if (BaseStrategy.crossAbove(maShort, maLong, i)) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `${short_window}MA(${maShort[i].toFixed(2)}) 上穿 ${long_window}MA(${maLong[i].toFixed(2)}) 金叉`
        });
      } else if (BaseStrategy.crossBelow(maShort, maLong, i)) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `${short_window}MA(${maShort[i].toFixed(2)}) 下穿 ${long_window}MA(${maLong[i].toFixed(2)}) 死叉`
        });
      }
    }
    return { signals, indicators: { maShort, maLong } };
  }
}

// ======================================================
// Strategy 2: 55日布林带法 (55-day Bollinger Bands)
// ======================================================
class BollingerStrategy extends BaseStrategy {
  static defaultParams() { return { window: 55, num_std: 2.0 }; }

  generateSignals(data) {
    const { window, num_std } = this.params;
    const closes = data.map(d => d.close);
    const ma = BaseStrategy.ma(data, 'close', window);
    const upper = new Array(data.length).fill(null);
    const lower = new Array(data.length).fill(null);

    for (let i = window - 1; i < data.length; i++) {
      const sd = BaseStrategy.std(closes, i - window + 1, i);
      upper[i] = ma[i] + num_std * sd;
      lower[i] = ma[i] - num_std * sd;
    }

    const signals = [];
    for (let i = window + 1; i < data.length; i++) {
      // Buy: price crosses ABOVE lower band (bouncing from below)
      if (BaseStrategy.crossAbove(closes, lower, i)) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})从下轨(${lower[i].toFixed(2)})下方回升`
        });
      }
      // Sell: price crosses BELOW upper band (falling from above)
      else if (BaseStrategy.crossBelow(closes, upper, i)) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})从上轨(${upper[i].toFixed(2)})上方回落`
        });
      }
    }
    return { signals, indicators: { ma, upper, lower } };
  }
}

// ======================================================
// Strategy 3: RSI 法 (14-day RSI)
// ======================================================
class RSIStrategy extends BaseStrategy {
  static defaultParams() { return { window: 14, oversold: 30, overbought: 70 }; }

  generateSignals(data) {
    const { window, oversold, overbought } = this.params;
    const closes = data.map(d => d.close);
    const rsi = new Array(data.length).fill(null);

    // Calculate RSI
    const gains = [], losses = [];
    for (let i = 1; i < closes.length; i++) {
      const delta = closes[i] - closes[i - 1];
      gains.push(delta > 0 ? delta : 0);
      losses.push(delta < 0 ? -delta : 0);
    }

    // First RSI uses SMA of gains/losses
    if (gains.length >= window) {
      let avgGain = gains.slice(0, window).reduce((a, b) => a + b, 0) / window;
      let avgLoss = losses.slice(0, window).reduce((a, b) => a + b, 0) / window;
      if (avgLoss === 0) {
        rsi[window] = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi[window] = 100 - 100 / (1 + rs);
      }

      // Subsequent RSI uses smoothed averages
      for (let i = window + 1; i < closes.length; i++) {
        avgGain = (avgGain * (window - 1) + gains[i - 1]) / window;
        avgLoss = (avgLoss * (window - 1) + losses[i - 1]) / window;
        if (avgLoss === 0) {
          rsi[i] = 100;
        } else {
          rsi[i] = 100 - 100 / (1 + avgGain / avgLoss);
        }
      }
    }

    const signals = [];
    for (let i = window + 2; i < data.length; i++) {
      if (rsi[i] == null || rsi[i - 1] == null) continue;
      // Buy: RSI leaves oversold zone (crosses above oversold threshold)
      if (rsi[i - 1] <= oversold && rsi[i] > oversold) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `RSI 从超卖区回升 (RSI=${rsi[i].toFixed(1)} > ${oversold})`
        });
      }
      // Sell: RSI leaves overbought zone (crosses below overbought threshold)
      else if (rsi[i - 1] >= overbought && rsi[i] < overbought) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `RSI 从超买区回落 (RSI=${rsi[i].toFixed(1)} < ${overbought})`
        });
      }
    }
    return { signals, indicators: { rsi } };
  }
}

// ======================================================
// Strategy 4: MACD 法
// ======================================================
class MACDStrategy extends BaseStrategy {
  static defaultParams() { return { fast: 12, slow: 26, signal: 9 }; }

  generateSignals(data) {
    const { fast, slow, signal } = this.params;
    const emaFast = BaseStrategy.ema(data, 'close', fast);
    const emaSlow = BaseStrategy.ema(data, 'close', slow);
    const dif = new Array(data.length).fill(null);
    const dea = []; // signal line
    const macdHist = new Array(data.length).fill(null);

    for (let i = 0; i < data.length; i++) {
      if (emaFast[i] != null && emaSlow[i] != null) {
        dif[i] = emaFast[i] - emaSlow[i];
      }
    }

    // Calculate DEA (9-day EMA of DIF)
    const startEMA = slow + signal - 1;
    if (startEMA < data.length) {
      let firstDiff = -1;
      for (let i = startEMA; i < data.length; i++) {
        if (dif[i] != null) { firstDiff = i; break; }
      }
      if (firstDiff !== -1) {
        // Seed with SMA
        const seedStart = Math.max(0, firstDiff - signal + 1);
        let sum = 0, count = 0;
        for (let i = seedStart; i <= firstDiff; i++) {
          if (dif[i] != null) { sum += dif[i]; count++; }
        }
        const alpha = 2 / (signal + 1);
        dea[firstDiff] = count > 0 ? sum / count : 0;

        for (let i = firstDiff + 1; i < data.length; i++) {
          if (dif[i] != null && dea[i - 1] != null) {
            dea[i] = alpha * dif[i] + (1 - alpha) * dea[i - 1];
            macdHist[i] = (dif[i] - dea[i]) * 2; // Chinese convention: 2x
          }
        }
      }
    }

    // Fill dea with nulls for indices before calculation
    const deaArr = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) {
      if (dea[i] !== undefined) deaArr[i] = dea[i];
    }

    const signals = [];
    for (let i = startEMA + 1; i < data.length; i++) {
      if (dif[i] == null || deaArr[i] == null || dif[i - 1] == null || deaArr[i - 1] == null) continue;
      if (BaseStrategy.crossAbove(dif, deaArr, i)) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `MACD金叉 DIF(${dif[i].toFixed(3)}) 上穿 DEA(${deaArr[i].toFixed(3)})`
        });
      } else if (BaseStrategy.crossBelow(dif, deaArr, i)) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `MACD死叉 DIF(${dif[i].toFixed(3)}) 下穿 DEA(${deaArr[i].toFixed(3)})`
        });
      }
    }
    return { signals, indicators: { dif, dea: deaArr, macdHist } };
  }
}

// ======================================================
// Strategy 5: KDJ 法
// ======================================================
class KDJStrategy extends BaseStrategy {
  static defaultParams() { return { n: 9 }; }

  generateSignals(data) {
    const { n } = this.params;
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    const rsv = new Array(data.length).fill(null);
    const k = new Array(data.length).fill(null);
    const d = new Array(data.length).fill(null);
    const j = new Array(data.length).fill(null);

    // Calculate RSV
    for (let i = n - 1; i < data.length; i++) {
      let highest = -Infinity, lowest = Infinity;
      for (let t = i - n + 1; t <= i; t++) {
        if (highs[t] > highest) highest = highs[t];
        if (lows[t] < lowest) lowest = lows[t];
      }
      const range = highest - lowest;
      rsv[i] = range === 0 ? 50 : ((closes[i] - lowest) / range) * 100;
    }

    // Initialize K, D
    for (let i = n; i < data.length; i++) {
      if (rsv[i] == null) continue;
      const prevK = k[i - 1] != null ? k[i - 1] : 50;
      const prevD = d[i - 1] != null ? d[i - 1] : 50;
      k[i] = (2 / 3) * prevK + (1 / 3) * rsv[i];
      d[i] = (2 / 3) * prevD + (1 / 3) * k[i];
      j[i] = 3 * k[i] - 2 * d[i];
    }

    const signals = [];
    for (let i = n + 2; i < data.length; i++) {
      if (k[i] == null || d[i] == null) continue;
      // Buy: K crosses above D in lower zone
      if (BaseStrategy.crossAbove(k, d, i) && k[i] < 50) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `KDJ金叉 K(${k[i].toFixed(1)}) 上穿 D(${d[i].toFixed(1)}) J=${j[i]?.toFixed(1)||'-'}`
        });
      }
      // Sell: K crosses below D in upper zone
      else if (BaseStrategy.crossBelow(k, d, i) && k[i] > 50) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `KDJ死叉 K(${k[i].toFixed(1)}) 下穿 D(${d[i].toFixed(1)}) J=${j[i]?.toFixed(1)||'-'}`
        });
      }
    }
    return { signals, indicators: { k, d, j } };
  }
}

// ======================================================
// Strategy 6: 单均线法 (Single MA Crossover)
// ======================================================
class SingleMAStrategy extends BaseStrategy {
  static defaultParams() { return { window: 20 }; }

  generateSignals(data) {
    const { window } = this.params;
    const closes = data.map(d => d.close);
    const ma = BaseStrategy.ma(data, 'close', window);
    const signals = [];

    for (let i = window + 1; i < data.length; i++) {
      if (BaseStrategy.crossAbove(closes, ma, i)) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})上穿${window}日均线(${ma[i].toFixed(2)})`
        });
      } else if (BaseStrategy.crossBelow(closes, ma, i)) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})下穿${window}日均线(${ma[i].toFixed(2)})`
        });
      }
    }
    return { signals, indicators: { ma } };
  }
}

// ======================================================
// Strategy 7: 动量突破法 (Momentum Breakout)
// ======================================================
class MomentumStrategy extends BaseStrategy {
  static defaultParams() { return { lookback: 20 }; }

  generateSignals(data) {
    const { lookback } = this.params;
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    const nDayHigh = new Array(data.length).fill(null);
    const nDayLow = new Array(data.length).fill(null);

    for (let i = lookback; i < data.length; i++) {
      let maxH = -Infinity, minL = Infinity;
      for (let t = i - lookback; t < i; t++) {
        if (highs[t] > maxH) maxH = highs[t];
        if (lows[t] < minL) minL = lows[t];
      }
      nDayHigh[i] = maxH;
      nDayLow[i] = minL;
    }

    const signals = [];
    for (let i = lookback + 1; i < data.length; i++) {
      if (nDayHigh[i] == null) continue;
      // Buy: price breaks above N-day high
      if (closes[i] > nDayHigh[i] && closes[i - 1] <= nDayHigh[i - 1]) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})突破${lookback}日最高点(${nDayHigh[i].toFixed(2)})`
        });
      }
      // Sell: price breaks below N-day low
      else if (closes[i] < nDayLow[i] && closes[i - 1] >= nDayLow[i - 1]) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})跌破${lookback}日最低点(${nDayLow[i].toFixed(2)})`
        });
      }
    }
    return { signals, indicators: { nDayHigh, nDayLow } };
  }
}

// ======================================================
// Strategy 8: 均值回归法 (Mean Reversion)
// ======================================================
class MeanReversionStrategy extends BaseStrategy {
  static defaultParams() { return { window: 20, num_std: 2.0 }; }

  generateSignals(data) {
    const { window, num_std } = this.params;
    const closes = data.map(d => d.close);
    const ma = BaseStrategy.ma(data, 'close', window);
    const lower = new Array(data.length).fill(null);

    for (let i = window - 1; i < data.length; i++) {
      const sd = BaseStrategy.std(closes, i - window + 1, i);
      lower[i] = ma[i] - num_std * sd;
    }

    const signals = [];
    for (let i = window + 2; i < data.length; i++) {
      if (lower[i] == null || ma[i] == null) continue;
      // Buy: price drops below lower band
      if (closes[i - 1] >= lower[i - 1] && closes[i] < lower[i]) {
        signals.push({
          date: data[i].date, type: 'buy', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})跌破下轨(${lower[i].toFixed(2)})，触发均值回归买入`
        });
      }
      // Sell: price returns to MA
      else if (BaseStrategy.crossAbove(closes, ma, i)) {
        signals.push({
          date: data[i].date, type: 'sell', price: data[i].close,
          reason: `价格(${closes[i].toFixed(2)})回归${window}日均线(${ma[i].toFixed(2)})，触发卖出`
        });
      }
    }
    return { signals, indicators: { ma, lower } };
  }
}

// ======================================================
// Strategy Registry
// ======================================================
const STRATEGY_REGISTRY = {
  dual_ma: DualMAStrategy,
  bollinger: BollingerStrategy,
  rsi: RSIStrategy,
  macd: MACDStrategy,
  kdj: KDJStrategy,
  single_ma: SingleMAStrategy,
  momentum: MomentumStrategy,
  mean_reversion: MeanReversionStrategy
};

/**
 * Run a strategy on kline data.
 * @param {string} strategyId
 * @param {Array} klineData
 * @returns {{ signals, indicators }}
 */
function runStrategy(strategyId, klineData) {
  const StrategyClass = STRATEGY_REGISTRY[strategyId];
  if (!StrategyClass) throw new Error(`未知策略: ${strategyId}`);

  const stratMeta = STRATEGIES.find(s => s.id === strategyId);
  const strategy = new StrategyClass(stratMeta ? stratMeta.params : {});
  return strategy.generateSignals(klineData);
}
