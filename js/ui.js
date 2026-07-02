/* ========================================
   UI — DOM manipulation & event helpers
   ======================================== */

const UI = (() => {
  // --------------- Strategy Grid ---------------
  function buildStrategyGrid(onSelect) {
    const grid = document.getElementById('strategyGrid');
    grid.innerHTML = '';

    STRATEGIES.forEach((strat, idx) => {
      const btn = document.createElement('button');
      btn.className = 'strategy-btn';
      btn.dataset.strategyId = strat.id;
      if (idx === 0) btn.classList.add('active');

      btn.innerHTML = `
        <span class="strategy-icon">${strat.icon}</span>
        <span class="strategy-name">${strat.name}</span>
        <span class="strategy-brief">${strat.brief}</span>
      `;

      btn.addEventListener('click', () => {
        // Toggle active
        grid.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Show explanation
        showStrategyExplanation(strat);
        // Callback
        if (onSelect) onSelect(strat.id);
      });

      grid.appendChild(btn);
    });

    // Show first strategy explanation by default
    showStrategyExplanation(STRATEGIES[0]);
  }

  function showStrategyExplanation(strat) {
    const el = document.getElementById('strategyExplanation');
    const desc = document.getElementById('strategyDescText');
    el.classList.remove('hidden');
    desc.innerHTML = `<strong>${strat.name}</strong>：${strat.desc}`;
  }

  function setActiveStrategy(strategyId) {
    const grid = document.getElementById('strategyGrid');
    grid.querySelectorAll('.strategy-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.strategyId === strategyId);
    });
    const strat = STRATEGIES.find(s => s.id === strategyId);
    if (strat) showStrategyExplanation(strat);
  }

  // --------------- Period Selector ---------------
  function buildPeriodSelector(onSelect) {
    const group = document.getElementById('periodGroup');
    group.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (onSelect) onSelect(btn.dataset.period);
      });
    });
  }

  function getActivePeriod() {
    const btn = document.querySelector('.period-btn.active');
    return btn ? btn.dataset.period : '1y';
  }

  function setActivePeriod(periodId) {
    const group = document.getElementById('periodGroup');
    group.querySelectorAll('.period-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.period === periodId);
    });
  }

  // --------------- Market Toggle ---------------
  function buildMarketToggle(onChange) {
    const buttons = document.querySelectorAll('.toggle-btn[data-market]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (onChange) onChange(btn.dataset.market);
      });
    });
  }

  function getActiveMarket() {
    const btn = document.querySelector('.toggle-btn[data-market].active');
    return btn ? btn.dataset.market : 'cn';
  }

  // --------------- Loading ---------------
  function showLoading() {
    document.getElementById('chartLoading').classList.remove('hidden');
    document.getElementById('chartPlaceholder').classList.add('hidden');
  }

  function hideLoading() {
    document.getElementById('chartLoading').classList.add('hidden');
  }

  // --------------- Error ---------------
  function showError(message) {
    const banner = document.getElementById('errorBanner');
    document.getElementById('errorMessage').textContent = message;
    banner.classList.remove('hidden');
    // Auto-hide after 8 seconds
    clearTimeout(banner._timeout);
    banner._timeout = setTimeout(() => hideError(), 8000);
  }

  function hideError() {
    document.getElementById('errorBanner').classList.add('hidden');
  }

  // --------------- Metrics Panel ---------------
  function showMetricsPanel() {
    document.getElementById('metricsPanel').classList.remove('hidden');
  }

  function renderMetrics(metrics) {
    showMetricsPanel();

    const formatPct = (val) => {
      const sign = val >= 0 ? '+' : '';
      return `${sign}${val.toFixed(2)}%`;
    };

    const setVal = (id, text, cssClass) => {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = 'metric-value';
      if (cssClass) el.classList.add(cssClass);
    };

    setVal('metricTotalReturn', formatPct(metrics.total_return),
      metrics.total_return >= 0 ? '' : 'negative');
    setVal('metricAnnualReturn', formatPct(metrics.annualized_return),
      metrics.annualized_return >= 0 ? '' : 'negative');
    setVal('metricWinRate', `${metrics.win_rate.toFixed(1)}%`,
      metrics.win_rate >= 50 ? '' : 'negative');
    setVal('metricMaxDrawdown', `${metrics.max_drawdown.toFixed(2)}%`, 'negative');
    setVal('metricSharpe', metrics.sharpe_ratio.toFixed(2),
      metrics.sharpe_ratio >= 1 ? '' : (metrics.sharpe_ratio >= 0 ? 'neutral' : 'negative'));
    setVal('metricTrades', metrics.total_trades, 'neutral');
    setVal('metricAvgHold', `${metrics.avg_hold_days.toFixed(0)} 天`, 'neutral');
    setVal('metricBenchmark', formatPct(metrics.benchmark_return),
      metrics.benchmark_return >= 0 ? '' : 'negative');
  }

  function hideMetricsPanel() {
    document.getElementById('metricsPanel').classList.add('hidden');
  }

  // --------------- Autocomplete ---------------
  function setupAutocomplete(inputEl, onSelect) {
    const dropdown = document.getElementById('autocompleteDropdown');
    let debounceTimer;

    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = inputEl.value.trim();
        if (query.length === 0) {
          dropdown.classList.add('hidden');
          return;
        }
        const results = Api.searchStocks(query);
        if (results.length === 0) {
          dropdown.classList.add('hidden');
          return;
        }
        renderAutocomplete(results, onSelect);
      }, 200);
    });

    // Hide dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!inputEl.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    // Keyboard navigation
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        inputEl.blur();
      }
    });
  }

  function renderAutocomplete(results, onSelect) {
    const dropdown = document.getElementById('autocompleteDropdown');
    dropdown.innerHTML = '';

    results.forEach(stock => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      const marketLabel = stock.market === 'us' ? '美股' : (stock.market === 'sh' ? '沪市' : '深市');
      const localBadge = stock.hasLocal ? ' ⚡本地' : '';
      item.innerHTML = `
        <span class="stock-code">${stock.code}${localBadge}</span>
        <span class="stock-name">${stock.name}</span>
        <span class="stock-market">${marketLabel}</span>
      `;
      item.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        if (onSelect) onSelect(stock);
      });
      dropdown.appendChild(item);
    });

    dropdown.classList.remove('hidden');
  }

  // --------------- Chart Type Toggle ---------------
  function buildChartTypeToggle(onChange) {
    document.querySelectorAll('.chart-toggle .chart-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-toggle .chart-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (onChange) onChange(btn.dataset.chartType);
      });
    });
  }

  function getActiveChartType() {
    const btn = document.querySelector('.chart-type-btn.active');
    return btn ? btn.dataset.chartType : 'candlestick';
  }

  // --------------- Query Button ---------------
  function setQueryLoading(loading) {
    const btn = document.getElementById('queryBtn');
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-inline"></span> 查询中...';
    } else {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">🔍</span> 查询回测';
    }
  }

  return {
    buildStrategyGrid,
    setActiveStrategy,
    buildPeriodSelector,
    getActivePeriod,
    setActivePeriod,
    buildMarketToggle,
    getActiveMarket,
    showLoading,
    hideLoading,
    showError,
    hideError,
    renderMetrics,
    hideMetricsPanel,
    setupAutocomplete,
    setQueryLoading,
    buildChartTypeToggle,
    getActiveChartType,
    showStrategyExplanation
  };
})();
