"""
全量数据预计算脚本
1. 下载股票全量日K线
2. 计算 8 种策略的买卖信号
3. 计算 6 个周期的回测指标
4. 输出 data/{code}.json（前端直接加载展示）

用法: python build_data.py 600519          # 单只
      python build_data.py 600519 AAPL    # 多只
      python build_data.py --all           # 全部内置股票
"""

import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from io import TextIOWrapper

if sys.platform == 'win32':
    sys.stdout = TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

# ===================== 数据获取 =====================

def http_get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fetch_a_share(code, market='sh'):
    prefix = '1' if market == 'sh' else '0'
    secid = f'{prefix}.{code}'
    today = datetime.now().strftime('%Y%m%d')
    url = (
        f'https://push2his.eastmoney.com/api/qt/stock/kline/get'
        f'?secid={secid}&klt=101&fqt=0&beg=19900101&end={today}&lmt=10000'
        f'&fields1=f1,f2,f3,f4,f5,f6'
        f'&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
    )
    print(f'  [下载] {code}...')
    data = http_get(url)
    if not data.get('data') or not data['data'].get('klines'):
        raise ValueError(f'未获取到数据')
    name = data['data'].get('name', code)
    klines = []
    for line in data['data']['klines']:
        p = line.split(',')
        klines.append({
            'date': p[0],
            'open': round(float(p[1]), 3),
            'close': round(float(p[2]), 3),
            'high': round(float(p[3]), 3),
            'low': round(float(p[4]), 3),
            'volume': int(float(p[5]))
        })
    print(f'    {name} 共 {len(klines)} 条日K线')
    return {'code': code, 'name': name, 'market': market, 'klines': klines}


def fetch_us_stock(symbol):
    today = datetime.now()
    start = datetime(1970, 1, 1)
    url = (
        f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
        f'?period1={int(start.timestamp())}&period2={int(today.timestamp())}'
        f'&interval=1d&events=history'
    )
    print(f'  [下载] {symbol}...')
    data = http_get(url)
    result = data.get('chart', {}).get('result', [None])[0]
    if not result:
        raise ValueError(f'未获取到数据')
    meta = result.get('meta', {})
    name = meta.get('symbol', symbol)
    ts = result.get('timestamp', [])
    q = result.get('indicators', {}).get('quote', [{}])[0]
    klines = []
    for i, t in enumerate(ts):
        o, h, l, c, v = q['open'][i], q['high'][i], q['low'][i], q['close'][i], q['volume'][i]
        if o is None or c is None:
            continue
        d = datetime.fromtimestamp(t)
        klines.append({
            'date': d.strftime('%Y-%m-%d'),
            'open': round(float(o), 3),
            'close': round(float(c), 3),
            'high': round(float(h), 3),
            'low': round(float(l), 3),
            'volume': int(v) if v else 0
        })
    print(f'    {name} 共 {len(klines)} 条日K线')
    return {'code': symbol, 'name': name, 'market': 'us', 'klines': klines}


# ===================== 技术指标工具 =====================

def ma(values, window):
    """简单移动平均"""
    result = [None] * len(values)
    s = 0
    for i in range(len(values)):
        s += values[i]
        if i >= window:
            s -= values[i - window]
        if i >= window - 1:
            result[i] = s / window
    return result


def ema(values, window):
    """指数移动平均"""
    result = [None] * len(values)
    alpha = 2 / (window + 1)
    # 找第一个 SMA 种子
    first = -1
    s = 0
    for i in range(len(values)):
        s += values[i]
        if i >= window:
            s -= values[i - window]
        if i >= window - 1:
            first = i
            result[i] = s / window
            break
    if first == -1:
        return result
    for i in range(first + 1, len(values)):
        result[i] = alpha * values[i] + (1 - alpha) * result[i - 1]
    return result


def std(values, start, end):
    """计算 values[start:end+1] 的标准差"""
    n = end - start + 1
    mean = sum(values[start:end + 1]) / n
    variance = sum((v - mean) ** 2 for v in values[start:end + 1]) / n
    return math.sqrt(variance)


def cross_above(a, b, i):
    """a 上穿 b"""
    if i < 1:
        return False
    if None in (a[i], b[i], a[i - 1], b[i - 1]):
        return False
    return a[i] > b[i] and a[i - 1] <= b[i - 1]


def cross_below(a, b, i):
    """a 下穿 b"""
    if i < 1:
        return False
    if None in (a[i], b[i], a[i - 1], b[i - 1]):
        return False
    return a[i] < b[i] and a[i - 1] >= b[i - 1]


# ===================== 8 种策略 =====================

def strategy_dual_ma(klines):
    """双均线交叉法: 5MA 上穿/下穿 20MA"""
    closes = [k['close'] for k in klines]
    ma5 = ma(closes, 5)
    ma20 = ma(closes, 20)
    signals = []
    for i in range(20, len(klines)):
        if cross_above(ma5, ma20, i):
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'5MA({ma5[i]:.2f})上穿20MA({ma20[i]:.2f})金叉'})
        elif cross_below(ma5, ma20, i):
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'5MA({ma5[i]:.2f})下穿20MA({ma20[i]:.2f})死叉'})
    return signals


def strategy_bollinger(klines):
    """55日布林带: 价格穿越上下轨"""
    closes = [k['close'] for k in klines]
    window = 55
    mid = ma(closes, window)
    upper = [None] * len(closes)
    lower = [None] * len(closes)
    for i in range(window - 1, len(closes)):
        sd = std(closes, i - window + 1, i)
        upper[i] = mid[i] + 2 * sd
        lower[i] = mid[i] - 2 * sd
    signals = []
    for i in range(window + 1, len(klines)):
        if cross_above(closes, lower, i):
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'价格({closes[i]:.2f})从下轨({lower[i]:.2f})回升'})
        elif cross_below(closes, upper, i):
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'价格({closes[i]:.2f})从上轨({upper[i]:.2f})回落'})
    return signals


def strategy_rsi(klines):
    """RSI: 14日 RSI 超买超卖"""
    closes = [k['close'] for k in klines]
    window = 14
    rsi = [None] * len(closes)
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(d if d > 0 else 0)
        losses.append(-d if d < 0 else 0)
    if len(gains) < window:
        return []
    avg_gain = sum(gains[:window]) / window
    avg_loss = sum(losses[:window]) / window
    if avg_loss == 0:
        rsi[window] = 100
    else:
        rsi[window] = 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(window + 1, len(closes)):
        avg_gain = (avg_gain * (window - 1) + gains[i - 1]) / window
        avg_loss = (avg_loss * (window - 1) + losses[i - 1]) / window
        if avg_loss == 0:
            rsi[i] = 100
        else:
            rsi[i] = 100 - 100 / (1 + avg_gain / avg_loss)
    signals = []
    for i in range(window + 2, len(klines)):
        if rsi[i] is None or rsi[i - 1] is None:
            continue
        if rsi[i - 1] <= 30 and rsi[i] > 30:
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'RSI从超卖回升({rsi[i]:.1f}>30)'})
        elif rsi[i - 1] >= 70 and rsi[i] < 70:
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'RSI从超买回落({rsi[i]:.1f}<70)'})
    return signals


def strategy_macd(klines):
    """MACD: DIF 与 DEA 交叉"""
    closes = [k['close'] for k in klines]
    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    dif = [None] * len(closes)
    for i in range(len(closes)):
        if ema12[i] is not None and ema26[i] is not None:
            dif[i] = ema12[i] - ema26[i]
    # DEA: 9-day EMA of DIF
    dea = [None] * len(closes)
    # 找 DIF 的 SMA 种子
    first = -1
    s, cnt = 0, 0
    for i in range(len(dif)):
        if dif[i] is not None:
            s += dif[i]
            cnt += 1
        if cnt >= 9:
            first = i
            dea[i] = s / cnt
            break
    if first != -1:
        alpha = 2 / 10  # 9-day EMA
        for i in range(first + 1, len(dif)):
            if dif[i] is not None and dea[i - 1] is not None:
                dea[i] = alpha * dif[i] + (1 - alpha) * dea[i - 1]
    signals = []
    start = max(26 + 9, 35)
    for i in range(start, len(klines)):
        if cross_above(dif, dea, i):
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'MACD金叉 DIF({dif[i]:.3f})上穿DEA({dea[i]:.3f})'})
        elif cross_below(dif, dea, i):
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'MACD死叉 DIF({dif[i]:.3f})下穿DEA({dea[i]:.3f})'})
    return signals


def strategy_kdj(klines):
    """KDJ: K/D 交叉"""
    closes = [k['close'] for k in klines]
    highs = [k['high'] for k in klines]
    lows = [k['low'] for k in klines]
    n = 9
    rsv = [None] * len(closes)
    k = [None] * len(closes)
    d = [None] * len(closes)
    for i in range(n - 1, len(closes)):
        hh = max(highs[i - n + 1:i + 1])
        ll = min(lows[i - n + 1:i + 1])
        rng = hh - ll
        rsv[i] = 50 if rng == 0 else (closes[i] - ll) / rng * 100
    for i in range(n, len(closes)):
        prev_k = k[i - 1] if k[i - 1] is not None else 50
        prev_d = d[i - 1] if d[i - 1] is not None else 50
        k[i] = 2 / 3 * prev_k + 1 / 3 * rsv[i]
        d[i] = 2 / 3 * prev_d + 1 / 3 * k[i]
    signals = []
    for i in range(n + 2, len(klines)):
        if k[i] is None or d[i] is None:
            continue
        if cross_above(k, d, i) and k[i] < 50:
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'KDJ金叉 K({k[i]:.1f})上穿D({d[i]:.1f})'})
        elif cross_below(k, d, i) and k[i] > 50:
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'KDJ死叉 K({k[i]:.1f})下穿D({d[i]:.1f})'})
    return signals


def strategy_single_ma(klines):
    """单均线法: 收盘价上穿/下穿 20MA"""
    closes = [k['close'] for k in klines]
    m = ma(closes, 20)
    signals = []
    for i in range(21, len(klines)):
        if cross_above(closes, m, i):
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'价格({closes[i]:.2f})上穿20MA({m[i]:.2f})'})
        elif cross_below(closes, m, i):
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'价格({closes[i]:.2f})下穿20MA({m[i]:.2f})'})
    return signals


def strategy_momentum(klines):
    """动量突破: 突破 20 日最高/最低"""
    closes = [k['close'] for k in klines]
    highs = [k['high'] for k in klines]
    lows = [k['low'] for k in klines]
    lookback = 20
    n_high = [None] * len(closes)
    n_low = [None] * len(closes)
    for i in range(lookback, len(closes)):
        n_high[i] = max(highs[i - lookback:i])
        n_low[i] = min(lows[i - lookback:i])
    signals = []
    for i in range(lookback + 1, len(klines)):
        if n_high[i] is None:
            continue
        if closes[i] > n_high[i] and closes[i - 1] <= n_high[i - 1]:
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'突破{lookback}日最高({n_high[i]:.2f})'})
        elif closes[i] < n_low[i] and closes[i - 1] >= n_low[i - 1]:
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'跌破{lookback}日最低({n_low[i]:.2f})'})
    return signals


def strategy_mean_reversion(klines):
    """均值回归: 价格跌破下轨买入，回归均线卖出"""
    closes = [k['close'] for k in klines]
    window = 20
    m = ma(closes, window)
    lower = [None] * len(closes)
    for i in range(window - 1, len(closes)):
        sd = std(closes, i - window + 1, i)
        lower[i] = m[i] - 2 * sd
    signals = []
    for i in range(window + 2, len(klines)):
        if lower[i] is None:
            continue
        if closes[i - 1] >= lower[i - 1] and closes[i] < lower[i]:
            signals.append({'date': klines[i]['date'], 'type': 'buy', 'price': klines[i]['close'],
                           'reason': f'跌破下轨({lower[i]:.2f})触发买入'})
        elif cross_above(closes, m, i):
            signals.append({'date': klines[i]['date'], 'type': 'sell', 'price': klines[i]['close'],
                           'reason': f'回归均线({m[i]:.2f})卖出'})
    return signals


STRATEGIES = {
    'dual_ma':        {'name': '双均线交叉法', 'fn': strategy_dual_ma},
    'bollinger':      {'name': '55日布林带法', 'fn': strategy_bollinger},
    'rsi':            {'name': 'RSI法', 'fn': strategy_rsi},
    'macd':           {'name': 'MACD法', 'fn': strategy_macd},
    'kdj':            {'name': 'KDJ法', 'fn': strategy_kdj},
    'single_ma':      {'name': '单均线法', 'fn': strategy_single_ma},
    'momentum':       {'name': '动量突破法', 'fn': strategy_momentum},
    'mean_reversion': {'name': '均值回归法', 'fn': strategy_mean_reversion},
}

PERIODS = [
    ('5y', 1825), ('3y', 1095), ('1y', 365),
    ('6m', 180), ('3m', 90), ('1m', 30)
]


# ===================== 回测指标计算 =====================

def compute_metrics(klines, signals):
    """从信号计算回测指标"""
    n = len(klines)
    # 构建持仓序列
    date_map = {k['date']: i for i, k in enumerate(klines)}
    sorted_sigs = sorted(
        [s for s in signals if s['date'] in date_map],
        key=lambda s: date_map[s['date']]
    )
    position = [0] * n
    holding = False
    sig_ptr = 0
    for i in range(n):
        while sig_ptr < len(sorted_sigs) and date_map[sorted_sigs[sig_ptr]['date']] == i:
            s = sorted_sigs[sig_ptr]
            if s['type'] == 'buy':
                holding = True
            else:
                holding = False
            sig_ptr += 1
        position[i] = 1 if holding else 0

    # 每日收益
    daily_returns = []
    strategy_returns = []
    for i in range(1, n):
        ret = (klines[i]['close'] - klines[i - 1]['close']) / klines[i - 1]['close']
        daily_returns.append(ret)
        strategy_returns.append(ret * position[i - 1])

    if not strategy_returns:
        return _empty_metrics()

    # 总收益
    cum_st = 1.0
    for r in strategy_returns:
        cum_st *= (1 + r)
    total_return = cum_st - 1

    # 基准收益
    cum_bench = 1.0
    for r in daily_returns:
        cum_bench *= (1 + r)
    benchmark_return = cum_bench - 1

    # 年化
    nd = len(daily_returns)
    annualized = (1 + total_return) ** (252 / nd) - 1 if nd > 0 else 0

    # 提取交易
    trades = []
    entry = -1
    for i in range(n):
        if entry == -1 and position[i] == 1:
            entry = i
        elif entry != -1 and position[i] == 0:
            pnl = (klines[i]['close'] - klines[entry]['close']) / klines[entry]['close']
            trades.append({'pnl': pnl, 'hold_days': i - entry})
            entry = -1
    if entry != -1:
        pnl = (klines[-1]['close'] - klines[entry]['close']) / klines[entry]['close']
        trades.append({'pnl': pnl, 'hold_days': len(klines) - 1 - entry})

    win_count = sum(1 for t in trades if t['pnl'] > 0)
    win_rate = win_count / len(trades) if trades else 0
    avg_hold = sum(t['hold_days'] for t in trades) / len(trades) if trades else 0

    # 最大回撤
    cum = 1.0
    peak = 1.0
    max_dd = 0.0
    for r in strategy_returns:
        cum *= (1 + r)
        if cum > peak:
            peak = cum
        dd = (cum - peak) / peak
        if dd < max_dd:
            max_dd = dd

    # 夏普
    mean_ret = sum(strategy_returns) / len(strategy_returns)
    variance = sum((r - mean_ret) ** 2 for r in strategy_returns) / len(strategy_returns)
    std_ret = math.sqrt(variance)
    rf_daily = 0.03 / 252
    sharpe = math.sqrt(252) * (mean_ret - rf_daily) / std_ret if std_ret > 0 else 0

    return {
        'total_return': round(total_return * 100, 2),
        'annualized_return': round(annualized * 100, 2),
        'win_rate': round(win_rate * 100, 2),
        'max_drawdown': round(max_dd * 100, 2),
        'sharpe_ratio': round(sharpe, 2),
        'total_trades': len(trades),
        'avg_hold_days': round(avg_hold, 1),
        'benchmark_return': round(benchmark_return * 100, 2),
    }


def _empty_metrics():
    return {
        'total_return': 0, 'annualized_return': 0, 'win_rate': 0,
        'max_drawdown': 0, 'sharpe_ratio': 0, 'total_trades': 0,
        'avg_hold_days': 0, 'benchmark_return': 0
    }


def filter_by_period(klines, signals, period_days):
    """过滤 K 线和信号到指定周期"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=period_days + 120)
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

    filtered_k = [k for k in klines if start_str <= k['date'] <= end_str]
    filtered_s = [s for s in signals if start_str <= s['date'] <= end_str]
    return filtered_k, filtered_s


# ===================== 主流程 =====================

def build_stock(raw_code):
    """下载 + 计算单只股票的全部数据"""
    code = raw_code.strip().upper()
    print(f'\n{"="*60}')
    print(f'>>> {code}')

    # 1. 下载数据
    if any(c.isalpha() for c in code):
        stock = fetch_us_stock(code)
    elif code.startswith('6'):
        stock = fetch_a_share(code, 'sh')
    else:
        stock = fetch_a_share(code, 'sz')

    klines = stock['klines']
    print(f'  共 {len(klines)} 条日K线')

    # 2. 计算所有策略的信号（全量）
    strategies = {}
    for sid, sdef in STRATEGIES.items():
        print(f'  [计算] {sdef["name"]}...', end=' ')
        t0 = time.time()
        signals = sdef['fn'](klines)
        elapsed = time.time() - t0
        print(f'{len(signals)} 个信号 ({elapsed:.1f}s)')

        # 为每个周期计算指标
        periods = {}
        for pid, pdays in PERIODS:
            fk, fs = filter_by_period(klines, signals, pdays)
            metrics = compute_metrics(fk, fs)
            periods[pid] = {
                'klines_count': len(fk),
                'signals_count': len(fs),
                'metrics': metrics
            }

        strategies[sid] = {
            'name': sdef['name'],
            'signals': signals,  # 全量信号，前端按日期过滤
            'periods': periods   # 各周期预计算指标
        }

    stock['strategies'] = strategies
    stock['updated'] = datetime.now().strftime('%Y-%m-%d %H:%M')
    return stock


def save_stock(stock):
    os.makedirs('data', exist_ok=True)

    # JSON 文件
    filepath = f'data/{stock["code"]}.json'
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(stock, f, ensure_ascii=False, separators=(',', ':'))
    size_kb = os.path.getsize(filepath) / 1024
    print(f'  [JSON] {filepath} ({size_kb:.0f} KB)')

    # JS 文件（script 标签嵌入，无需 fetch，无 CORS）
    js_path = f'data/{stock["code"]}.js'
    js_code = 'window.__STOCK_DATA__=window.__STOCK_DATA__||{};'
    js_code += f'window.__STOCK_DATA__["{stock["code"]}"]='
    js_code += json.dumps(stock, ensure_ascii=False, separators=(',', ':'))
    js_code += ';'
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_code)
    js_kb = os.path.getsize(js_path) / 1024
    print(f'  [JS]   {js_path} ({js_kb:.0f} KB)')


def update_index():
    os.makedirs('data', exist_ok=True)
    stocks = []
    for f in sorted(os.listdir('data')):
        if f.endswith('.json') and f != 'index.json':
            try:
                with open(f'data/{f}', 'r', encoding='utf-8') as fp:
                    d = json.load(fp)
                strategies_count = len(d.get('strategies', {}))
                stocks.append({
                    'code': d['code'], 'name': d['name'], 'market': d['market'],
                    'klines_count': len(d.get('klines', [])),
                    'strategies': strategies_count,
                    'updated': d.get('updated', '')
                })
            except:
                pass
    with open('data/index.json', 'w', encoding='utf-8') as f:
        json.dump({'stocks': stocks, 'total': len(stocks)}, f, ensure_ascii=False, indent=2)
    print(f'\n[索引] data/index.json ({len(stocks)} 只股票)')


# 内置列表
BUILTIN_STOCKS = [
    ('600519', 'sh'), ('000858', 'sz'), ('601318', 'sh'), ('600036', 'sh'),
    ('000333', 'sz'), ('300750', 'sz'), ('002415', 'sz'), ('600900', 'sh'),
    ('510050', 'sh'), ('510300', 'sh'), ('510500', 'sh'), ('159915', 'sz'),
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'SPY', 'QQQ',
]


def main():
    args = sys.argv[1:]
    if not args or '--help' in args:
        print(__doc__)
        print('示例: python build_data.py 600519')
        print('      python build_data.py --all')
        return

    if '--all' in args:
        codes = BUILTIN_STOCKS
    else:
        codes = args

    success = 0
    for raw in codes:
        if isinstance(raw, tuple):
            raw = raw[0]
        try:
            stock = build_stock(raw)
            save_stock(stock)
            success += 1
        except Exception as e:
            print(f'  [失败] {raw}: {e}')
        time.sleep(0.3)

    update_index()
    print(f'\n{"="*60}')
    print(f'完成: {success}/{len(codes)} 成功')


if __name__ == '__main__':
    main()
