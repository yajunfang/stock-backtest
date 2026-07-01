/* App v5 — minimal, defensive, every step logged */
var App = (function() {
  'use strict';

  var state = {
    code: null, name: null, market: 'cn',
    strategy: 'dual_ma', period: '1y', chartType: 'candlestick',
    klines: null, signals: null, metrics: null, localData: null
  };

  function log(msg) {
    var el = document.getElementById('statusBar');
    if (el) el.textContent = msg;
    console.log('[App] ' + msg);
  }

  function fmt(d) {
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate());
  }

  function detectMarket(raw) {
    var input = raw.trim().toUpperCase();
    if (/[A-Z]/.test(input)) return { market: 'us', code: input };
    if (/^6/.test(input)) return { market: 'sh', code: input };
    return { market: 'sz', code: input };
  }

  // 核心：从预计算数据提取指定策略+周期的数据
  function extract(localData, periodId, strategyId) {
    log('extract: period=' + periodId + ' strategy=' + strategyId);

    // 查找周期参数
    var period = null;
    for (var i = 0; i < PERIODS.length; i++) {
      if (PERIODS[i].id === periodId) { period = PERIODS[i]; break; }
    }
    if (!period) { period = PERIODS[2]; }
    log('extract: period days=' + period.days);

    // 日期范围
    var end = new Date();
    var start = new Date();
    start.setDate(start.getDate() - period.days - 120);
    var ss = fmt(start);
    var ee = fmt(end);
    log('extract: date range ' + ss + ' ~ ' + ee);

    // 过滤 K 线
    var klines = [];
    for (var i = 0; i < localData.klines.length; i++) {
      var d = localData.klines[i].date;
      if (d >= ss && d <= ee) { klines.push(localData.klines[i]); }
    }
    log('extract: klines ' + klines.length + '/' + localData.klines.length);

    // 获取策略
    var strat = localData.strategies[strategyId];
    if (!strat) { throw new Error('Strategy not found: ' + strategyId); }

    // 过滤信号
    var signals = [];
    var rawSigs = strat.signals || [];
    for (var i = 0; i < rawSigs.length; i++) {
      if (rawSigs[i].date >= ss && rawSigs[i].date <= ee) {
        signals.push(rawSigs[i]);
      }
    }
    log('extract: signals ' + signals.length + '/' + rawSigs.length);

    // 预计算指标
    var metrics = null;
    if (strat.periods) {
      var pd = strat.periods[periodId];
      if (pd && pd.metrics) { metrics = pd.metrics; }
    }
    log('extract: metrics ' + (metrics ? 'found' : 'null'));

    return {
      klines: klines,
      signals: signals,
      metrics: metrics,
      localData: localData
    };
  }

  // 渲染
  function render() {
    if (!state.klines || !state.signals) { log('render: no data'); return; }

    if (!state.metrics) {
      state.metrics = Metrics.compute(state.klines, state.signals);
    }

    log('render: chart...');
    Chart.render(state.klines, state.signals, {
      chartType: state.chartType,
      stockName: state.name + ' (' + state.code + ')'
    });

    document.getElementById('chartTitle').textContent =
      state.name + ' (' + state.code + ') — 股价走势图';
    document.getElementById('chartPlaceholder').classList.add('hidden');

    if (state.metrics) {
      log('render: metrics...');
      UI.renderMetrics(state.metrics);
    }

    var stratInfo = null;
    for (var i = 0; i < STRATEGIES.length; i++) {
      if (STRATEGIES[i].id === state.strategy) { stratInfo = STRATEGIES[i]; break; }
    }
    if (stratInfo) { UI.showStrategyExplanation(stratInfo); }
    log('render: done');
  }

  // 主查询
  function runBacktest() {
    var raw = document.getElementById('stockInput').value.trim();
    if (!raw) { UI.showError('请输入股票代码'); return; }

    var dm = detectMarket(raw);
    state.code = dm.code;
    state.market = dm.market === 'us' ? 'us' : 'cn';

    log('=== 查询: ' + dm.code + ' ===');
    UI.hideError();
    UI.showLoading();
    UI.setQueryLoading(true);

    try {
      // 1. 查本地数据
      var g = window.__STOCK_DATA__;
      log('__STOCK_DATA__: ' + (g ? Object.keys(g).join(',') : 'NULL'));
      var local = g ? g[dm.code] : null;
      log('local data: ' + (local ? local.name + ' ' + local.klines.length + ' klines' : 'NULL'));

      if (local && local.klines && local.strategies) {
        // 2. 提取
        var result = extract(local, state.period, state.strategy);
        state.name = local.name;
        state.klines = result.klines;
        state.signals = result.signals;
        state.metrics = result.metrics;
        state.localData = local;

        // 3. 渲染
        render();
        UI.hideLoading();
        UI.setQueryLoading(false);
        log('=== 完成 ===');
        return;
      }

      // 无本地数据 → 在线
      log('无本地数据，在线获取...');
      fetchOnline(dm.code, dm.market);

    } catch(e) {
      log('ERROR: ' + e.message);
      console.error(e);
      UI.showError(e.message);
      UI.hideLoading();
      UI.setQueryLoading(false);
    }
  }

  function reload() {
    if (!state.localData) return;
    try {
      var result = extract(state.localData, state.period, state.strategy);
      state.klines = result.klines;
      state.signals = result.signals;
      state.metrics = result.metrics;
      render();
    } catch(e) {
      log('reload ERROR: ' + e.message);
      UI.showError(e.message);
    }
  }

  // 在线获取
  async function fetchOnline(code, market) {
    try {
      var period = PERIODS[2];
      for (var i = 0; i < PERIODS.length; i++) {
        if (PERIODS[i].id === state.period) { period = PERIODS[i]; break; }
      }
      var end = new Date();
      var start = new Date();
      start.setDate(start.getDate() - period.days - 120);

      var klines;
      if (market === 'us') {
        var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + code +
          '?period1=' + Math.floor(start.getTime()/1000) +
          '&period2=' + Math.floor(end.getTime()/1000) + '&interval=1d&events=history';
        log('fetch: ' + url.substring(0, 80));
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var json = await resp.json();
        var r = json.chart && json.chart.result && json.chart.result[0];
        if (!r) throw new Error('No data');
        state.name = (r.meta && r.meta.symbol) || code;
        var ts = r.timestamp || [];
        var q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
        klines = [];
        for (var i = 0; i < ts.length; i++) {
          if (q.open[i] == null || q.close[i] == null) continue;
          var d = new Date(ts[i] * 1000);
          klines.push({ date: fmt(d), open: +q.open[i].toFixed(3), close: +q.close[i].toFixed(3),
                        high: +q.high[i].toFixed(3), low: +q.low[i].toFixed(3), volume: Math.round(q.volume[i]||0) });
        }
      } else {
        var prefix = market === 'sh' ? '1' : '0';
        function p2(n) { return (n < 10 ? '0' : '') + n; }
        function toDS(dt) { return ''+dt.getFullYear()+p2(dt.getMonth()+1)+p2(dt.getDate()); }
        var url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=' + prefix + '.' + code +
          '&klt=101&fqt=0&beg=' + toDS(start) + '&end=' + toDS(end) +
          '&lmt=2000&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';
        log('fetch: eastmoney');
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var json = await resp.json();
        if (!json.data || !json.data.klines || !json.data.klines.length) throw new Error('No data');
        state.name = json.data.name || code;
        klines = json.data.klines.map(function(line) {
          var p = line.split(',');
          return { date: p[0], open: +p[1], close: +p[2], high: +p[3], low: +p[4], volume: +p[5] };
        });
      }

      state.klines = klines;
      state.localData = null;
      var sigResult = runStrategy(state.strategy, klines);
      state.signals = sigResult.signals;
      state.metrics = Metrics.compute(klines, state.signals);
      render();
      UI.hideLoading();
      UI.setQueryLoading(false);
      log('=== 完成(在线) ===');
    } catch(e) {
      log('fetch ERROR: ' + e.message);
      console.error(e);
      UI.showError(e.message);
      UI.hideLoading();
      UI.setQueryLoading(false);
    }
  }

  // 事件处理
  function onStrategySelect(sid) {
    if (state.strategy === sid) return;
    state.strategy = sid;
    if (state.localData) reload();
  }

  function onPeriodSelect(pid) {
    if (state.period === pid) return;
    state.period = pid;
    if (state.localData) reload();
  }

  function onChartTypeChange(ct) {
    state.chartType = ct;
    if (state.klines && state.signals) {
      Chart.switchType(state.klines, state.signals, ct, state.name);
    }
  }

  function onStockAutocomplete(stock) {
    document.getElementById('stockInput').value = stock.code;
    state.code = stock.code;
    state.name = stock.name;
    state.market = stock.market === 'us' ? 'us' : 'cn';
    runBacktest();
  }

  function init() {
    log('init...');
    try {
      Chart.init(document.getElementById('chartContainer'));
      UI.buildStrategyGrid(onStrategySelect);
      UI.buildPeriodSelector(onPeriodSelect);
      UI.buildChartTypeToggle(onChartTypeChange);

      var input = document.getElementById('stockInput');
      UI.setupAutocomplete(input, onStockAutocomplete);
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); runBacktest(); }
      });

      document.getElementById('queryBtn').addEventListener('click', runBacktest);
      document.getElementById('errorClose').addEventListener('click', UI.hideError);

      log('init done. data=' + (window.__STOCK_DATA__ ? 'OK' : 'NO') +
        ' echarts=' + (typeof echarts !== 'undefined' ? 'OK' : 'NO'));
    } catch(e) {
      log('INIT FAIL: ' + e.message);
      console.error(e);
    }
  }

  return { init: init };
})();

document.addEventListener('DOMContentLoaded', function() { App.init(); });
