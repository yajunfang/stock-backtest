/* ========================================
   Metrics — Backtest performance calculation
   ======================================== */

const Metrics = (() => {
  /**
   * Build position series from signals.
   * Position = 1 (holding) or 0 (cash).
   * Alternates: first buy -> position 1, first sell -> position 0, etc.
   * @returns {Array<number>} position array aligned to klineData
   */
  function buildPosition(klineData, signals) {
    const position = new Array(klineData.length).fill(0);

    // Sort signals by date
    const dateIndex = new Map();
    klineData.forEach((d, i) => dateIndex.set(d.date, i));

    const sortedSignals = signals
      .filter(s => dateIndex.has(s.date))
      .sort((a, b) => dateIndex.get(a.date) - dateIndex.get(b.date));

    if (sortedSignals.length === 0) return position;

    let holding = false;
    let signalPtr = 0;

    for (let i = 0; i < klineData.length; i++) {
      while (signalPtr < sortedSignals.length && dateIndex.get(sortedSignals[signalPtr].date) === i) {
        const sig = sortedSignals[signalPtr];
        if (sig.type === 'buy') holding = true;
        else if (sig.type === 'sell') holding = false;
        signalPtr++;
      }
      position[i] = holding ? 1 : 0;
    }

    return position;
  }

  /**
   * Extract individual trades from position changes.
   */
  function extractTrades(klineData, position) {
    const trades = [];
    let entryIdx = -1;

    for (let i = 0; i < position.length; i++) {
      if (entryIdx === -1 && position[i] === 1) {
        entryIdx = i;
      } else if (entryIdx !== -1 && position[i] === 0) {
        const entryPrice = klineData[entryIdx].close;
        const exitPrice = klineData[i].close;
        const pnl = (exitPrice - entryPrice) / entryPrice;
        trades.push({
          entryDate: klineData[entryIdx].date,
          exitDate: klineData[i].date,
          entryPrice,
          exitPrice,
          pnl,
          holdDays: i - entryIdx
        });
        entryIdx = -1;
      }
    }

    // Close open trade at last bar
    if (entryIdx !== -1) {
      const lastIdx = klineData.length - 1;
      const entryPrice = klineData[entryIdx].close;
      const exitPrice = klineData[lastIdx].close;
      const pnl = (exitPrice - entryPrice) / entryPrice;
      trades.push({
        entryDate: klineData[entryIdx].date,
        exitDate: klineData[lastIdx].date,
        entryPrice,
        exitPrice,
        pnl,
        holdDays: lastIdx - entryIdx
      });
    }

    return trades;
  }

  /**
   * Compute all backtest metrics.
   * @param {Array} klineData
   * @param {Array} signals
   * @returns {Object} metrics
   */
  function compute(klineData, signals) {
    const position = buildPosition(klineData, signals);
    const closes = klineData.map(d => d.close);

    // Daily returns
    const dailyReturns = [];
    const strategyReturns = [];
    for (let i = 1; i < closes.length; i++) {
      const ret = (closes[i] - closes[i - 1]) / closes[i - 1];
      dailyReturns.push(ret);
      strategyReturns.push(ret * (position[i - 1] || 0)); // use previous day's position
    }

    if (strategyReturns.length === 0) {
      return {
        total_return: 0,
        annualized_return: 0,
        win_rate: 0,
        max_drawdown: 0,
        sharpe_ratio: 0,
        total_trades: 0,
        avg_hold_days: 0,
        benchmark_return: 0
      };
    }

    // Total compounded return
    let cumulativeStrategy = 1;
    for (const r of strategyReturns) cumulativeStrategy *= (1 + r);
    const totalReturn = cumulativeStrategy - 1;

    // Benchmark (buy & hold)
    let cumulativeBench = 1;
    for (const r of dailyReturns) cumulativeBench *= (1 + r);
    const benchmarkReturn = cumulativeBench - 1;

    // Annualized return
    const nDays = dailyReturns.length;
    const annualizedReturn = Math.pow(1 + totalReturn, 252 / nDays) - 1;

    // Win rate from trades
    const trades = extractTrades(klineData, position);
    const winningTrades = trades.filter(t => t.pnl > 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) : 0;

    // Max drawdown
    let peak = 1, maxDD = 0;
    for (const r of strategyReturns) {
      cumulativeStrategy = (cumulativeStrategy / (1 + totalReturn)) * (1 + r); // rebuild
    }
    // Rebuild for DD calculation
    let cum = 1;
    for (const r of strategyReturns) {
      cum *= (1 + r);
      if (cum > peak) peak = cum;
      const dd = (cum - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }

    // Sharpe ratio
    const meanRet = strategyReturns.reduce((a, b) => a + b, 0) / strategyReturns.length;
    const variance = strategyReturns.reduce((sum, r) => sum + (r - meanRet) ** 2, 0) / strategyReturns.length;
    const stdRet = Math.sqrt(variance);
    const riskFreeDaily = 0.03 / 252;
    const sharpe = stdRet > 0 ? Math.sqrt(252) * (meanRet - riskFreeDaily) / stdRet : 0;

    // Average hold days
    const avgHoldDays = trades.length > 0
      ? trades.reduce((sum, t) => sum + t.holdDays, 0) / trades.length
      : 0;

    return {
      total_return: totalReturn * 100,
      annualized_return: annualizedReturn * 100,
      win_rate: winRate * 100,
      max_drawdown: maxDD * 100,
      sharpe_ratio: sharpe,
      total_trades: trades.length,
      avg_hold_days: avgHoldDays,
      benchmark_return: benchmarkReturn * 100
    };
  }

  return { compute, buildPosition, extractTrades };
})();
