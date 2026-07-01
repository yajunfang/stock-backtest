/* ========================================
   API — 搜索 & 在线获取（精简版）
   数据加载主体逻辑已合并到 app.js
   ======================================== */

const Api = (() => {
  // ---- 自动初始化索引（从 window.__STOCK_DATA__） ----
  let _index = { stocks: [], total: 0 };
  (function initIndex() {
    const g = window.__STOCK_DATA__;
    if (g) {
      const stocks = [];
      for (const code of Object.keys(g)) {
        const d = g[code];
        stocks.push({
          code: d.code, name: d.name, market: d.market,
          klines_count: d.klines ? d.klines.length : 0,
          strategies: d.strategies ? Object.keys(d.strategies).length : 0,
          updated: d.updated || ''
        });
      }
      _index = { stocks, total: stocks.length };
      console.log(`[Api] 索引就绪: ${_index.total} 只股票预计算完毕`);
    }
  })();

  // ---- 搜索 ----
  function searchStocks(query) {
    if (!query || !query.trim()) return [];
    const q = query.trim().toUpperCase();
    const matches = STOCK_LIST.filter(s =>
      s.code.toUpperCase().includes(q) || s.name.toUpperCase().includes(q)
    ).slice(0, 8);
    return matches.map(s => ({
      ...s,
      hasLocal: _index.stocks.some(ls => ls.code === s.code)
    }));
  }

  function detectMarket(raw) {
    const input = raw.trim().toUpperCase();
    if (/[A-Z]/.test(input)) return { market: 'us', code: input };
    if (/^6/.test(input)) return { market: 'sh', code: input };
    return { market: 'sz', code: input };
  }

  return { searchStocks, detectMarket };
})();
