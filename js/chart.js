/* ========================================
   Chart — ECharts initialization & rendering
   ======================================== */

const Chart = (() => {
  let chartInstance = null;
  let currentChartType = 'candlestick';
  let showBollinger = false;
  let lastKlineData = null;

  function computeBollinger(klineData, window, numStd) {
    var closes = klineData.map(function(d) { return d.close; });
    var mid = [], upper = [], lower = [];
    var sum = 0;
    for (var i = 0; i < closes.length; i++) {
      sum += closes[i];
      if (i >= window) sum -= closes[i - window];
      if (i >= window - 1) {
        var ma = sum / window;
        mid.push({ value: [klineData[i].date, ma] });
        var sqSum = 0;
        for (var j = i - window + 1; j <= i; j++) { sqSum += (closes[j] - ma) * (closes[j] - ma); }
        var sd = Math.sqrt(sqSum / window);
        upper.push({ value: [klineData[i].date, ma + numStd * sd] });
        lower.push({ value: [klineData[i].date, ma - numStd * sd] });
      }
    }
    return { mid: mid, upper: upper, lower: lower };
  }

  function init(domElement) {
    if (chartInstance) chartInstance.dispose();
    chartInstance = echarts.init(domElement, null, { renderer: 'canvas' });

    // Responsive resize
    window.addEventListener('resize', () => {
      if (chartInstance && !chartInstance.isDisposed()) {
        chartInstance.resize();
      }
    });

    return chartInstance;
  }

  /**
   * Render backtest results on the chart.
   * @param {Array} klineData - [{date, open, close, high, low, volume}, ...]
   * @param {Array} signals - [{date, type, price, reason}, ...]
   * @param {Object} opts - { chartType: 'candlestick'|'line', stockName: string }
   */
  function render(klineData, signals, opts = {}) {
    if (!chartInstance || chartInstance.isDisposed()) {
      console.warn('Chart not initialized');
      return;
    }

    const chartType = opts.chartType || currentChartType;
    currentChartType = chartType;
    lastKlineData = klineData;

    const dates = klineData.map(d => d.date);

    // K-line series data: [open, close, low, high] (standard ECharts format)
    const ohlcData = klineData.map(d => [d.open, d.close, d.low, d.high]);

    // Build a date-indexed map for tooltip: all OHLC + prevClose + changePct
    // Use this instead of p.value (ECharts may alter the data)
    var dateInfoMap = {};
    for (var i = 0; i < klineData.length; i++) {
      var d = klineData[i];
      var prevClose = i > 0 ? klineData[i-1].close : d.close;
      var changePct = prevClose !== 0 ? ((d.close - prevClose) / prevClose * 100) : 0;
      dateInfoMap[d.date] = {
        open: d.open, close: d.close, high: d.high, low: d.low,
        prevClose: prevClose, changePct: changePct
      };
    }

    // Buy signals scatter data
    const buyData = signals
      .filter(s => s.type === 'buy')
      .map(s => ({
        value: [s.date, s.price],
        reason: s.reason
      }));

    // Sell signals scatter data
    const sellData = signals
      .filter(s => s.type === 'sell')
      .map(s => ({
        value: [s.date, s.price],
        reason: s.reason
      }));

    const series = [];

    // Main price series
    if (chartType === 'candlestick') {
      series.push({
        name: 'K线',
        type: 'candlestick',
        data: ohlcData,
        itemStyle: {
          color: COLORS.up,
          color0: COLORS.down,
          borderColor: COLORS.up,
          borderColor0: COLORS.down
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          data: []
        }
      });
    } else {
      // Line chart: show close price
      const closeData = klineData.map(d => d.close);
      series.push({
        name: '收盘价',
        type: 'line',
        data: closeData,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: COLORS.line, width: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(84,112,198,0.15)' },
            { offset: 1, color: 'rgba(84,112,198,0.01)' }
          ])
        }
      });
    }

    // Buy scatter
    series.push({
      name: '买入',
      type: 'scatter',
      data: buyData,
      symbol: 'triangle',
      symbolSize: 14,
      symbolRotate: 0,
      itemStyle: { color: COLORS.buy },
      z: 10,
      emphasis: {
        scale: 1.8,
        itemStyle: { color: COLORS.buy }
      },
      encode: { x: 0, y: 1 }
    });

    // Sell scatter
    series.push({
      name: '卖出',
      type: 'scatter',
      data: sellData,
      symbol: 'triangle',
      symbolSize: 14,
      symbolRotate: 180,
      itemStyle: { color: COLORS.sell },
      z: 10,
      emphasis: {
        scale: 1.8,
        itemStyle: { color: COLORS.sell }
      },
      encode: { x: 0, y: 1 }
    });

    // Bollinger Bands overlay
    if (showBollinger && klineData && klineData.length > 55) {
      var bb = computeBollinger(klineData, 55, 2);
      series.push({ name: 'BOLL上轨', type: 'line', data: bb.upper, symbol: 'none', lineStyle: { color: '#3b82f6', width: 1.2 }, silent: true, z: 1 });
      series.push({ name: 'BOLL中轨', type: 'line', data: bb.mid, symbol: 'none', lineStyle: { color: '#f59e0b', width: 1.2 }, silent: true, z: 1 });
      series.push({ name: 'BOLL下轨', type: 'line', data: bb.lower, symbol: 'none', lineStyle: { color: '#a855f7', width: 1.2 }, silent: true, z: 1 });
    }

    const option = {
      backgroundColor: 'transparent',
      title: {
        text: opts.stockName ? `${opts.stockName}` : '',
        left: 'center',
        top: 0,
        textStyle: { fontSize: 13, fontWeight: 600, color: '#94a3b8' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(17,24,39,0.95)',
        borderColor: 'rgba(99,102,241,0.3)',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        axisPointer: {
          type: 'cross',
          crossStyle: { color: '#475569' }
        },
        formatter: function (params) {
          if (!params || params.length === 0) return '';
          let html = `<strong>${params[0].axisValue}</strong><br/>`;
          let hasSignal = false;

          params.forEach(p => {
            if (p.seriesName === 'K线' && Array.isArray(p.value)) {
              var date = params[0].axisValue;
              var info = dateInfoMap[date];
              if (!info) {
                // fallback: use p.value (may be unreliable)
                info = {
                  open: p.value[0], close: p.value[1], low: p.value[2], high: p.value[3],
                  prevClose: p.value[4] || p.value[0], changePct: p.value[5] || 0
                };
              }
              var color = info.close >= info.open ? COLORS.up : COLORS.down;
              html += '<span style=\"color:' + color + '\">';
              html += '开 ' + info.open.toFixed(2) + ' | 收 ' + info.close.toFixed(2) + '<br/>';
              html += '高 ' + info.high.toFixed(2) + ' | 低 ' + info.low.toFixed(2) + '<br/>';
              html += '涨跌幅 ' + (info.changePct >= 0 ? '+' : '') + info.changePct.toFixed(2) + '%';
              html += ' (昨收 ' + info.prevClose.toFixed(2) + ')';
              html += '</span><br/>';
            } else if (p.seriesName === '收盘价') {
              html += `收盘价: <strong>${p.value}</strong><br/>`;
            } else if (p.seriesName === '买入') {
              hasSignal = true;
              html += `<span style="color:${COLORS.buy};font-weight:700">▲ 买入 ${p.value[1]}</span><br/>`;
              if (p.data && p.data.reason) {
                html += `<span style="color:#888;font-size:12px">　${p.data.reason}</span><br/>`;
              }
            } else if (p.seriesName === '卖出') {
              hasSignal = true;
              html += `<span style="color:${COLORS.sell};font-weight:700">▼ 卖出 ${p.value[1]}</span><br/>`;
              if (p.data && p.data.reason) {
                html += `<span style="color:#888;font-size:12px">　${p.data.reason}</span><br/>`;
              }
            }
          });

          return html;
        }
      },
      legend: {
        data: showBollinger ? ['K线', '买入', '卖出', 'BOLL上轨', 'BOLL中轨', 'BOLL下轨'] : ['K线', '买入', '卖出'],
        bottom: 55,
        left: 'center',
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { fontSize: 11, color: '#94a3b8' }
      },
      grid: {
        left: '3%',
        right: '3%',
        top: chartType === 'candlestick' ? 50 : 30,
        bottom: 80,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisLabel: {
          color: '#64748b',
          fontSize: 10,
          formatter: function (val) {
            if (val.length > 10) return val.slice(5);
            return val;
          }
        },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitNumber: 6,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748b',
          fontSize: 10,
          formatter: function (val) {
            if (val >= 10000) return (val / 1000).toFixed(1) + 'k';
            return val.toFixed(2);
          }
        },
        splitLine: {
          lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' }
        }
      },
      dataZoom: [
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 26,
          bottom: 30,
          borderColor: 'rgba(255,255,255,0.06)',
          backgroundColor: 'rgba(17,24,39,0.5)',
          fillerColor: 'rgba(99,102,241,0.1)',
          handleStyle: { color: '#6366f1' },
          textStyle: { fontSize: 10, color: '#64748b' },
          brushSelect: true
        },
        {
          type: 'inside',
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false
        }
      ],
      series: series
    };

    chartInstance.setOption(option, true);
  }

  /**
   * Switch chart type and re-render.
   */
  function switchType(klineData, signals, chartType, stockName) {
    render(klineData, signals, { chartType, stockName });
  }

  /**
   * Clear chart to placeholder.
   */
  function clear() {
    if (chartInstance && !chartInstance.isDisposed()) {
      chartInstance.clear();
      chartInstance.setOption({
        title: {},
        series: [],
        xAxis: { data: [] },
        yAxis: {},
        dataZoom: []
      });
    }
  }

  function getInstance() {
    return chartInstance;
  }

  function dispose() {
    if (chartInstance && !chartInstance.isDisposed()) {
      chartInstance.dispose();
      chartInstance = null;
    }
  }

  function toggleBollinger(show) { showBollinger = show; }
  function isBollingerShown() { return showBollinger; }

  return { init, render, switchType, clear, getInstance, dispose, toggleBollinger, isBollingerShown };
})();
