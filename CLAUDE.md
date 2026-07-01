# 股票策略历史回测系统 — 项目文档 & 开发约束

## 项目概述

纯静态网页，用于股票买卖策略的历史回测。支持 A 股（沪深）和美股，个股及 ETF。通过技术指标策略（均线、布林带、RSI、MACD 等）生成买卖信号，在 K 线图上标注买卖点并展示收益率指标。

**部署方式**：GitHub Pages（免费静态托管）或本地双击 `index.html` 直接打开。

## 架构

```
index.html                     ← 单页入口
├── data/{code}.js             ← 预计算的股票数据（script 标签嵌入，全局变量）
├── js/echarts.min.js          ← ECharts 图表库（本地文件，1005 KB）
├── js/constants.js            ← 策略元数据、股票列表、颜色常量
├── js/api.js                  ← 搜索 + 在线 API 获取（回退用）
├── js/strategy.js             ← 8 种策略类（JS 计算，在线 API 回退时使用）
├── js/metrics.js              ← 回测指标计算（JS，在线 API 回退时使用）
├── js/chart.js                ← ECharts 渲染（K线图 + 买卖点 + tooltip）
├── js/ui.js                   ← DOM 操作（按钮、loading、错误提示）
├── js/app.js                  ← 主控制器（状态管理 + 事件绑定 + 流程编排）
└── css/style.css              ← 暗色科技主题样式
```

**数据加载优先级**（`app.js`）：
1. `window.__STOCK_DATA__['{code}']` — script 标签嵌入的预计算数据（毫秒级）
2. `fetch('data/{code}.json')` — HTTP 服务器下加载 JSON
3. 东方财富 / Yahoo Finance 在线 API — 实时获取 + JS 计算策略

## 数据流

```
下载阶段（一次性）：
  python build_data.py 600519
    → 东方财富 API 拉取全量日K线
    → Python 计算 8 种策略 × 6 个周期的买卖信号 + 回测指标
    → 输出 data/600519.json + data/600519.js

使用阶段（每次）：
  打开 index.html
    → <script src="data/600519.js"> 加载预计算数据到 window.__STOCK_DATA__
    → 用户输入 600519 点击查询
    → app.js 从 window.__STOCK_DATA__ 直接读取
    → 按策略 + 周期过滤信号和 K 线（纯数组操作，毫秒级）
    → ECharts 渲染图表 + 指标面板
```

## 文件说明

| 文件 | 用途 | 是否需要修改 |
|------|------|-------------|
| `build_data.py` | 预下载 + 预计算股票数据 | 添加股票时执行 |
| `download_data.py` | 旧版下载脚本（仅下载，无预计算） | 保留备用 |
| `data/{code}.js` | 预计算数据（JS 格式，script 嵌入） | build_data.py 自动生成 |
| `data/{code}.json` | 预计算数据（JSON 格式，fetch 备用） | build_data.py 自动生成 |
| `data/index.json` | 已下载股票索引 | build_data.py 自动更新 |
| `start.bat` | 一键启动本地 HTTP 服务器 | 预下载股票足够时不需要 |
| `index.html` | 主页面 | 添加新股票时新增 `<script>` 标签 |

## 使用方式

### 1. 下载预计算数据

```bash
python build_data.py 600519          # 单只股票
python build_data.py 600519 AAPL     # 多只
python build_data.py --all           # 全部 58 只内置股票
```

### 2. 注册到页面

在 `index.html` 中添加 `<script>` 标签：

```html
<script src="data/600519.js"></script>
```

### 3. 打开页面

- 直接双击 `index.html`（仅使用预下载股票）
- 或 `python -m http.server 8080` → `http://localhost:8080`（支持在线查询）

---

## Debug 注意事项（踩坑记录）

### 1. ECharts 不能使用 CDN

`jsdelivr.net` 在国内被墙或极慢。**必须下载 ECharts 到本地**（`js/echarts.min.js`，1005 KB）。

### 2. 不能使用 Google Fonts

`@import url('https://fonts.googleapis.com/...')` 在国内被墙，会导致整个 CSS 文件加载失败。**所有字体只能使用系统自带字体栈**。

### 3. chartPlaceholder 不能放在 chartContainer 内部

`echarts.init(dom)` 会清空容器内所有子元素。如果 `chartPlaceholder` 是 `chartContainer` 的子元素，它会被 ECharts 销毁，后续 `document.getElementById('chartPlaceholder')` 返回 `null`，导致 `UI.showLoading()` 抛出 `Cannot read properties of null`，spinner 卡住不消失。**必须将 placeholder 和 loading 放在 chartContainer 外部，用一个 wrapper 包裹**。

### 4. UI.showLoading() 必须在 try-catch 内部

`runBacktest()` 的老代码中 `UI.showLoading()` 在 `try` 之前调用，如果它抛出异常，`UI.hideLoading()` 永远执行不到，loading spinner 会卡住。**所有可能失败的操作都必须在 try-catch 内**。

### 5. tooltip 不能依赖 ECharts 的 p.value

ECharts 可能内部修改 candlestick 数据值，导致 tooltip 显示错误的 OHLC。**必须自建 `dateInfoMap`，tooltip 中按日期从 map 读取数据，不依赖 `p.value`**。

### 6. A 股数据不使用前复权（fqt=1）

前复权（`fqt=1`）会把历史股价调整为负值（如贵州茅台 2001 年价格变成 -312），ECharts K 线图不支持负数。**必须使用不复权（`fqt=0`）**。

### 7. 涨跌幅含义

中文股票语境中"涨跌幅" = `(当日收盘 - 昨日收盘) / 昨日收盘`，不是日内涨跌 `(收盘 - 开盘) / 开盘`。tooltip 中要明确标注计算方式和昨收价格。

### 8. 预计算数据格式

`build_data.py` 输出的 JSON 结构：
```json
{
  "code": "600519",
  "name": "贵州茅台",
  "klines": [{ "date": "...", "open": 0, "close": 0, "high": 0, "low": 0, "volume": 0 }],
  "strategies": {
    "dual_ma": {
      "signals": [{ "date": "...", "type": "buy|sell", "price": 0, "reason": "..." }],
      "periods": {
        "1y": { "klines_count": 0, "signals_count": 0, "metrics": { "total_return": 0, ... } }
      }
    }
  }
}
```

---

## 约束规则（禁止操作）

### 绝对禁止

- ❌ **使用 CDN 加载 ECharts** — 国内网络不可用，必须本地 `js/echarts.min.js`
- ❌ **使用 Google Fonts 或任何外部字体 CDN** — 只用系统字体
- ❌ **将 UI 占位元素（placeholder/loading）放在 chartContainer 内部** — ECharts 会销毁它们
- ❌ **使用前复权（fqt=1）** — 历史股价可能为负数，ECharts 不支持
- ❌ **在 try-catch 外部调用 UI.showLoading()** — 异常会导致 spinner 卡死
- ❌ **tooltip 中信任 ECharts p.value** — 必须用自建的 dateInfoMap

### 遵循规范

- ✅ 所有 JS 文件使用 `<script>` 标签加载（非 module），按依赖顺序排列
- ✅ 预计算数据通过 `<script src="data/{code}.js">` 嵌入（零 fetch、零 CORS）
- ✅ 新增股票：先 `python build_data.py {code}`，再在 HTML 添加 `<script>` 标签
- ✅ 新增策略：在 `strategy.js`（JS 版，在线回退用）+ `build_data.py`（Python 版，预计算用）同步实现
- ✅ CSS 中所有 URL 引用必须是本地相对路径

### 浏览器兼容

- 目标：Chrome 80+、Edge 80+、Firefox 75+、Safari 13+
- ES6 语法仅在 `strategy.js`、`metrics.js`、`chart.js`、`ui.js` 中使用（现代浏览器均支持）
- `app.js` 使用 ES5 语法（`var`、传统函数、`for` 循环），兼容性最广
- 不依赖 `padStart`（`app.js` 中手动实现 `p2()` 函数）

---

## 8 种策略

| ID | 名称 | 核心参数 | 买入条件 | 卖出条件 |
|----|------|---------|---------|---------|
| `dual_ma` | 双均线交叉法 | 5日 & 20日 MA | 5MA 上穿 20MA（金叉）| 5MA 下穿 20MA（死叉）|
| `bollinger` | 55日布林带法 | 55日 MA ± 2σ | 从下轨下方回升 | 从上轨上方回落 |
| `rsi` | RSI 法 | 14日 RSI (30/70) | RSI 从超卖区回升 | RSI 从超买区回落 |
| `macd` | MACD 法 | 12/26/9 EMA | DIF 上穿 DEA（金叉）| DIF 下穿 DEA（死叉）|
| `kdj` | KDJ 法 | 9日 K/D/J | K 上穿 D 且 <50 | K 下穿 D 且 >50 |
| `single_ma` | 单均线法 | 20日 MA | 收盘价上穿 MA | 收盘价下穿 MA |
| `momentum` | 动量突破法 | 20日最高/最低 | 突破 20 日最高价 | 跌破 20 日最低价 |
| `mean_reversion` | 均值回归法 | 20日 MA ± 2σ | 价格跌破下轨 | 价格回归均线 |

## 6 个回测周期

`5y`（5年）、`3y`（3年）、`1y`（1年）、`6m`（6月）、`3m`（3月）、`1m`（1月）

## 回测指标

总收益率、年化收益率、胜率、最大回撤、夏普比率、交易次数、平均持仓天数、基准收益（买入持有）
