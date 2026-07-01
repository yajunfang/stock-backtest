"""
股票数据预下载脚本（纯标准库，无需 pip install）
用法: python download_data.py 600519          # 下载单只 A 股
      python download_data.py 600519 000858   # 下载多只 A 股
      python download_data.py AAPL            # 下载美股
      python download_data.py --all           # 下载内置列表中的所有股票
      python download_data.py --list          # 查看内置股票列表
"""

import json
import os
import sys
import time
import urllib.request
from datetime import datetime
from io import TextIOWrapper

# Fix Windows GBK encoding for emoji
if sys.platform == 'win32':
    sys.stdout = TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ---------- 数据获取 ----------

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

def http_get(url):
    """标准库 HTTP GET，返回解析后的 JSON"""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fetch_a_share(code, market='sh'):
    """从东方财富获取 A 股全量日 K 线数据"""
    prefix = '1' if market == 'sh' else '0'
    secid = f'{prefix}.{code}'
    today = datetime.now().strftime('%Y%m%d')
    url = (
        f'https://push2his.eastmoney.com/api/qt/stock/kline/get'
        f'?secid={secid}&klt=101&fqt=0&beg=19900101&end={today}&lmt=10000'
        f'&fields1=f1,f2,f3,f4,f5,f6'
        f'&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
    )
    print(f'  📡 请求东方财富...')
    data = http_get(url)

    if not data.get('data') or not data['data'].get('klines'):
        raise ValueError(f'未获取到 {code} 的数据，请检查代码')

    name = data['data'].get('name', code)
    klines_raw = data['data']['klines']

    klines = []
    for line in klines_raw:
        parts = line.split(',')
        klines.append({
            'date': parts[0],
            'open':  round(float(parts[1]), 3),
            'close': round(float(parts[2]), 3),
            'high':  round(float(parts[3]), 3),
            'low':   round(float(parts[4]), 3),
            'volume': int(float(parts[5]))
        })

    print(f'  ✅ {name}({code}) 获取 {len(klines)} 条日 K 线数据')
    return {'code': code, 'name': name, 'market': market, 'klines': klines}


def fetch_us_stock(symbol):
    """从 Yahoo Finance 获取美股全量日 K 线数据"""
    today = datetime.now()
    start = datetime(1970, 1, 1)
    url = (
        f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
        f'?period1={int(start.timestamp())}&period2={int(today.timestamp())}'
        f'&interval=1d&events=history'
    )
    print(f'  📡 请求 Yahoo Finance...')
    data = http_get(url)

    result = data.get('chart', {}).get('result', [None])[0]
    if not result:
        raise ValueError(f'未获取到 {symbol} 的数据')

    meta = result.get('meta', {})
    name = meta.get('symbol', symbol)
    timestamps = result.get('timestamp', [])
    quote = result.get('indicators', {}).get('quote', [{}])[0]

    opens = quote.get('open', [])
    highs = quote.get('high', [])
    lows = quote.get('low', [])
    closes = quote.get('close', [])
    volumes = quote.get('volume', [])

    klines = []
    for i, ts in enumerate(timestamps):
        o, h, l, c, v = opens[i], highs[i], lows[i], closes[i], volumes[i]
        if o is None or c is None:
            continue
        d = datetime.fromtimestamp(ts)
        klines.append({
            'date': d.strftime('%Y-%m-%d'),
            'open':  round(float(o), 3),
            'close': round(float(c), 3),
            'high':  round(float(h), 3),
            'low':   round(float(l), 3),
            'volume': int(v) if v else 0
        })

    print(f'  ✅ {name}({symbol}) 获取 {len(klines)} 条日 K 线数据')
    return {'code': symbol, 'name': name, 'market': 'us', 'klines': klines}


# ---------- 内置股票列表 ----------

BUILTIN_STOCKS = [
    # A 股知名个股
    ('600519', 'sh'), ('000858', 'sz'), ('601318', 'sh'), ('600036', 'sh'),
    ('000333', 'sz'), ('600276', 'sh'), ('000651', 'sz'), ('600887', 'sh'),
    ('000568', 'sz'), ('300750', 'sz'), ('002415', 'sz'), ('600900', 'sh'),
    ('000002', 'sz'), ('601857', 'sh'), ('601398', 'sh'), ('600030', 'sh'),
    ('300059', 'sz'), ('002594', 'sz'), ('601888', 'sh'), ('000725', 'sz'),
    ('600809', 'sh'), ('002475', 'sz'), ('600585', 'sh'), ('000001', 'sz'),
    ('002714', 'sz'), ('600690', 'sh'), ('000063', 'sz'),
    # A 股 ETF
    ('510050', 'sh'), ('510300', 'sh'), ('510500', 'sh'), ('159915', 'sz'),
    ('512880', 'sh'), ('588000', 'sh'), ('513100', 'sh'), ('159949', 'sz'),
    # 美股
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
    'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'BAC',
    'DIS', 'NFLX', 'ADBE',
    # 美股 ETF
    'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'TLT', 'GLD', 'XLF',
]


# ---------- 主逻辑 ----------

def ensure_data_dir():
    os.makedirs('data', exist_ok=True)


def save_stock_data(stock_data):
    """保存单只股票数据到 data/{code}.json"""
    ensure_data_dir()
    filepath = f'data/{stock_data["code"]}.json'
    stock_data['updated'] = datetime.now().strftime('%Y-%m-%d %H:%M')
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(stock_data, f, ensure_ascii=False, separators=(',', ':'))
    size_kb = os.path.getsize(filepath) / 1024
    print(f'  💾 已保存: {filepath} ({size_kb:.0f} KB)')


def update_index():
    """更新 data/index.json 清单"""
    ensure_data_dir()
    files = [f for f in os.listdir('data') if f.endswith('.json') and f != 'index.json']
    stocks = []
    for f in sorted(files):
        filepath = f'data/{f}'
        try:
            with open(filepath, 'r', encoding='utf-8') as fp:
                d = json.load(fp)
            stocks.append({
                'code': d['code'],
                'name': d['name'],
                'market': d['market'],
                'klines_count': len(d.get('klines', [])),
                'updated': d.get('updated', '')
            })
        except Exception:
            pass
    with open('data/index.json', 'w', encoding='utf-8') as f:
        json.dump({'stocks': stocks, 'total': len(stocks)}, f, ensure_ascii=False, indent=2)
    print(f'\n📋 索引已更新: data/index.json ({len(stocks)} 只股票)')


def download_one(raw_code):
    """下载一只股票"""
    code = raw_code.strip().upper()
    print(f'\n{"="*50}')
    print(f'🔽 下载: {code}')

    if any(c.isalpha() for c in code):
        stock_data = fetch_us_stock(code)
    elif code.startswith('6'):
        stock_data = fetch_a_share(code, 'sh')
    else:
        stock_data = fetch_a_share(code, 'sz')

    save_stock_data(stock_data)
    return True


def main():
    args = sys.argv[1:]

    if not args or '--help' in args or '-h' in args:
        print(__doc__)
        print('\n示例:')
        print('  python download_data.py 600519              # 下载贵州茅台')
        print('  python download_data.py 600519 AAPL         # 同时下载 A 股和美股')
        print('  python download_data.py --all               # 下载全部内置股票')
        print('  python download_data.py --list              # 查看内置列表')
        return

    if '--list' in args:
        print('内置股票列表:')
        for i, s in enumerate(BUILTIN_STOCKS):
            code = s if isinstance(s, str) else s[0]
            print(f'  {i+1:3d}. {code}')
        print(f'\n共 {len(BUILTIN_STOCKS)} 只')
        return

    if '--all' in args:
        codes = BUILTIN_STOCKS
    else:
        codes = args

    success, fail = 0, 0
    for raw in codes:
        if isinstance(raw, tuple):
            raw = raw[0]
        try:
            download_one(raw)
            success += 1
        except Exception as e:
            print(f'  ❌ 失败: {e}')
            fail += 1
        time.sleep(0.5)

    update_index()
    print(f'\n{"="*50}')
    print(f'🎉 完成: {success} 成功, {fail} 失败')


if __name__ == '__main__':
    main()
