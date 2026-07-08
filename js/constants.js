/* ========================================
   Constants — Strategy metadata, periods, colors
   ======================================== */

const STRATEGIES = [
  {
    id: 'dual_ma',
    name: '双均线交叉法',
    icon: '↯',
    brief: '5日 & 20日均线',
    desc: '利用 5 日短期均线与 20 日长期均线的交叉产生交易信号。当 5 日均线上穿 20 日均线时（金叉）买入，下穿时（死叉）卖出。适合趋势明显的市场，在震荡市中可能产生较多假信号。',
    params: { short_window: 5, long_window: 20 }
  },
  {
    id: 'bollinger',
    name: '55日布林带法',
    icon: '⊡',
    brief: '55日均线 ± 2σ',
    desc: '基于 55 日移动平均线和 2 倍标准差构建上下轨。当股价从下轨下方回升时买入（超卖反弹），从上轨上方回落时卖出（超买回调）。适合震荡市和均值回归行情。',
    params: { window: 55, num_std: 2.0 }
  },
  {
    id: 'rsi',
    name: 'RSI 法',
    icon: '⟳',
    brief: '14日 RSI (30/70)',
    desc: '使用 14 日相对强弱指数（RSI）。当 RSI 从 30 以下（超卖区）回升时买入，从 70 以上（超买区）回落时卖出。适合震荡市场，在强趋势市场中可能过早离场。',
    params: { window: 14, oversold: 30, overbought: 70 }
  },
  {
    id: 'macd',
    name: 'MACD 法',
    icon: '∿',
    brief: '12/26/9 EMA',
    desc: 'MACD（指数平滑异同移动平均线）由 DIF 线（12日 EMA - 26日 EMA）、DEA 线（DIF 的 9 日 EMA）和柱状图组成。当 DIF 上穿 DEA 时（金叉）买入，DIF 下穿 DEA 时（死叉）卖出。是最经典的趋势跟踪指标之一。',
    params: { fast: 12, slow: 26, signal: 9 }
  },
  {
    id: 'kdj',
    name: 'KDJ 法',
    icon: 'κ',
    brief: '9日 K/D/J',
    desc: 'KDJ 随机指标通过比较收盘价与价格区间的关系判断超买超卖。当 K 线上穿 D 线且处于 50 以下低位时买入，当 K 线下穿 D 线且处于 50 以上高位时卖出。适合短线波段操作。',
    params: { n: 9 }
  },
  {
    id: 'single_ma',
    name: '单均线法',
    icon: '—',
    brief: '20日均线',
    desc: '最简单的均线策略：当收盘价上穿 20 日均线时买入，下穿时卖出。规则简单明确，适合判断中长期趋势方向，但在震荡市中会产生较多假突破信号。',
    params: { window: 20 }
  },
  {
    id: 'momentum',
    name: '动量突破法',
    icon: '↗',
    brief: '20日最高/最低',
    desc: '基于价格动量突破的策略。当收盘价突破过去 20 个交易日的最高价时买入（向上突破），跌破过去 20 个交易日的最低价时卖出（向下突破）。适合趋势性强、波动大的市场。',
    params: { lookback: 20 }
  },
  {
    id: 'mean_reversion',
    name: '均值回归法',
    icon: '⇄',
    brief: '20日均线 ± 2σ',
    desc: '基于均值回归理论的策略。当股价偏离 20 日均线超过 2 个标准差时（跌破下轨）买入，当股价回归到均线附近时卖出。假设价格最终会回归均值，适合震荡行情。',
    params: { window: 20, num_std: 2.0 }
  }
];

const PERIODS = [
  { id: '5y', label: '5 年', days: 1825 },
  { id: '3y', label: '3 年', days: 1095 },
  { id: '1y', label: '1 年', days: 365 },
  { id: '6m', label: '6 月', days: 180 },
  { id: '3m', label: '3 月', days: 90 },
  { id: '1m', label: '1 月', days: 30 }
];

const COLORS = {
  buy: '#22c55e',
  sell: '#ef4444',
  up: '#ef4444',
  down: '#22c55e',
  line: '#6366f1',
  ma5: '#f59e0b',
  ma20: '#ef4444',
  bollUpper: '#22c55e',
  bollLower: '#22c55e',
  bollMid: '#f59e0b'
};

const STOCK_LIST = [
  // A-shares (common stocks)
  { code: '600519', name: '贵州茅台', market: 'sh' },
  { code: '000858', name: '五粮液', market: 'sz' },
  { code: '601318', name: '中国平安', market: 'sh' },
  { code: '600036', name: '招商银行', market: 'sh' },
  { code: '000333', name: '美的集团', market: 'sz' },
  { code: '600276', name: '恒瑞医药', market: 'sh' },
  { code: '601166', name: '兴业银行', market: 'sh' },
  { code: '000651', name: '格力电器', market: 'sz' },
  { code: '600887', name: '伊利股份', market: 'sh' },
  { code: '000568', name: '泸州老窖', market: 'sz' },
  { code: '601012', name: '隆基绿能', market: 'sh' },
  { code: '300750', name: '宁德时代', market: 'sz' },
  { code: '002415', name: '海康威视', market: 'sz' },
  { code: '600900', name: '长江电力', market: 'sh' },
  { code: '000002', name: '万科A', market: 'sz' },
  { code: '601857', name: '中国石油', market: 'sh' },
  { code: '601398', name: '工商银行', market: 'sh' },
  { code: '600030', name: '中信证券', market: 'sh' },
  { code: '300059', name: '东方财富', market: 'sz' },
  { code: '002594', name: '比亚迪', market: 'sz' },
  { code: '601888', name: '中国中免', market: 'sh' },
  { code: '000725', name: '京东方A', market: 'sz' },
  { code: '600809', name: '山西汾酒', market: 'sh' },
  { code: '688521', name: '芯原股份', market: 'sh' },
  { code: '003018', name: '金富科技', market: 'sz' },
  { code: '002475', name: '立讯精密', market: 'sz' },
  { code: '600585', name: '海螺水泥', market: 'sh' },
  { code: '000001', name: '平安银行', market: 'sz' },
  { code: '601688', name: '华泰证券', market: 'sh' },
  { code: '002714', name: '牧原股份', market: 'sz' },
  { code: '600690', name: '海尔智家', market: 'sh' },
  { code: '000063', name: '中兴通讯', market: 'sz' },
  // A-share ETFs
  { code: '510050', name: '上证50ETF', market: 'sh' },
  { code: '510300', name: '沪深300ETF', market: 'sh' },
  { code: '510500', name: '中证500ETF', market: 'sh' },
  { code: '159915', name: '创业板ETF', market: 'sz' },
  { code: '512880', name: '证券ETF', market: 'sh' },
  { code: '512100', name: '中证1000ETF', market: 'sh' },
  { code: '159949', name: '创业板50ETF', market: 'sz' },
  { code: '513100', name: '纳指ETF', market: 'sh' },
  { code: '588000', name: '科创50ETF', market: 'sh' },
  // US stocks
  { code: 'AAPL', name: 'Apple', market: 'us' },
  { code: 'MSFT', name: 'Microsoft', market: 'us' },
  { code: 'GOOGL', name: 'Alphabet (Google)', market: 'us' },
  { code: 'AMZN', name: 'Amazon', market: 'us' },
  { code: 'NVDA', name: 'NVIDIA', market: 'us' },
  { code: 'META', name: 'Meta', market: 'us' },
  { code: 'TSLA', name: 'Tesla', market: 'us' },
  { code: 'BRK-B', name: 'Berkshire Hathaway', market: 'us' },
  { code: 'JPM', name: 'JPMorgan Chase', market: 'us' },
  { code: 'V', name: 'Visa', market: 'us' },
  { code: 'JNJ', name: 'Johnson & Johnson', market: 'us' },
  { code: 'WMT', name: 'Walmart', market: 'us' },
  { code: 'PG', name: 'Procter & Gamble', market: 'us' },
  { code: 'MA', name: 'Mastercard', market: 'us' },
  { code: 'UNH', name: 'UnitedHealth', market: 'us' },
  { code: 'HD', name: 'Home Depot', market: 'us' },
  { code: 'BAC', name: 'Bank of America', market: 'us' },
  { code: 'DIS', name: 'Disney', market: 'us' },
  { code: 'NFLX', name: 'Netflix', market: 'us' },
  { code: 'ADBE', name: 'Adobe', market: 'us' },
  // US ETFs
  { code: 'SPY', name: 'SPDR S&P 500 ETF', market: 'us' },
  { code: 'QQQ', name: 'Invesco QQQ Trust', market: 'us' },
  { code: 'IWM', name: 'iShares Russell 2000 ETF', market: 'us' },
  { code: 'DIA', name: 'SPDR Dow Jones ETF', market: 'us' },
  { code: 'VTI', name: 'Vanguard Total Stock Market', market: 'us' },
  { code: 'TLT', name: 'iShares 20+ Year Treasury', market: 'us' },
  { code: 'GLD', name: 'SPDR Gold Trust', market: 'us' },
  { code: 'XLF', name: 'Financial Select Sector', market: 'us' },
];
