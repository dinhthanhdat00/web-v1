const API = "https://api.binance.com";
const WS_BASE = "wss://stream.binance.com:9443/ws";
const TIMEZONE_OFFSET_SECONDS = 7 * 60 * 60;
const VISIBLE_BARS = 40;
const RSI_LOW_LEVEL = 20;
const RSI_HIGH_LEVEL = 80;
const RSI_LOW_COLOR = "#8b0000";
const RSI_HIGH_COLOR = "#ff2bd6";
const NOISE_LOOKBACK = 7;
const NOISE_CROSS_COUNT = 3;
const II_TO_3_WINDOW_BARS = 2;

const FRAMES = [
  { key: "h4", label: "4h", apiTf: "4h", wsTf: "4h", aggregate: 1, limit: 360 },
  { key: "h12", label: "12h", apiTf: "12h", wsTf: "12h", aggregate: 1, limit: 360 },
  { key: "d1", label: "1D", apiTf: "1d", wsTf: "1d", aggregate: 1, limit: 360 },
  { key: "d2", label: "2D", apiTf: "1d", wsTf: "1d", aggregate: 2, limit: 720 }
];

const SINGLE_FRAMES = [
  { key: "h1", label: "1H", apiTf: "1h", wsTf: "1h", aggregate: 1, limit: 600 },
  { key: "h2", label: "2H", apiTf: "2h", wsTf: "2h", aggregate: 1, limit: 600 },
  { key: "h4", label: "4H", apiTf: "4h", wsTf: "4h", aggregate: 1, limit: 600 },
  { key: "h12", label: "12H", apiTf: "12h", wsTf: "12h", aggregate: 1, limit: 600 },
  { key: "d1", label: "1D", apiTf: "1d", wsTf: "1d", aggregate: 1, limit: 600 },
  { key: "d2", label: "2D", apiTf: "1d", wsTf: "1d", aggregate: 2, limit: 900 },
  { key: "d3", label: "3D", apiTf: "3d", wsTf: "3d", aggregate: 1, limit: 600 },
  { key: "w1", label: "W", apiTf: "1w", wsTf: "1w", aggregate: 1, limit: 600 },
  { key: "w2", label: "2W", apiTf: "1w", wsTf: "1w", aggregate: 2, limit: 900 },
  { key: "m1", label: "M", apiTf: "1M", wsTf: "1M", aggregate: 1, limit: 600 }
];

let currentSymbol = "BTCUSDT";
let sessionId = 0;
let singleSessionId = 0;
let tickerWs = null;
let singlePanel = null;
const panels = new Map();
const rsiOnlyPanels = new Map();
const rsiFrameStates = new Map();
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const DEFAULT_PARAMS = {
  baselineLength: 70,
  baselinePhase: 5,
  slowBaselineLength: 150,
  slowBaselinePhase: 0,
  rsiLength: 14,
  rsiEmaLength: 9,
  rsiWmaLength: 45
};
const params = { ...DEFAULT_PARAMS };
const layerState = {
  baseline: true,
  slowBaseline: true,
  vwap: true,
  rsi: true,
  rsiEma: true,
  rsiWma: true,
  signals: true
};

const RSI_STATES = [
  {
    name: "Mới lên",
    description: "RSI vừa cắt lên trên EMA9 hoặc WMA45, thường là điểm 3 cho form Long."
  },
  {
    name: "Lên 1/2",
    description: "RSI đã mở rộng khoảng cách đáng kể, xu hướng lên đang chạy."
  },
  {
    name: "Gần hết lên",
    description: "RSI bắt đầu cuộn lại sau nhịp lên, chuẩn bị cho form Sell."
  },
  {
    name: "Mới xuống",
    description: "RSI vừa cắt xuống dưới EMA9 hoặc WMA45, thường là điểm 3 cho form Short."
  },
  {
    name: "Xuống 1/2",
    description: "Lực xả đang mạnh và đã đi được một quãng."
  },
  {
    name: "Gần hết xuống",
    description: "RSI cạn lực xuống, chuẩn bị tạo form Buy."
  }
];

const RSI_RULES = [
  ["Mới lên", "Mới lên", 100, "Vào Long full với khung con."],
  ["Mới lên", "Lên 1/2", 90, "Vào Long. Xu hướng đang được duy trì tốt."],
  ["Mới lên", "Gần hết lên", 80, "Gồng Long. Đã qua điểm vào đẹp, chuẩn bị quản lý lệnh."],
  ["Mới lên", "Mới xuống", 70, "Gồng Long. Coi khung con là nhiễu vì khung bố mới xuất phát."],
  ["Mới lên", "Xuống 1/2", 60, "Quan sát. Chờ khung con điều chỉnh xong tạo form Buy để vào."],
  ["Mới lên", "Gần hết xuống", 80, "Canh Long. Khung con sắp hết lực xả, chuẩn bị bồi lệnh."],
  ["Lên 1/2", "Mới lên", 90, "Vào Long theo xu hướng, ưu tiên nhịp pullback vừa xong."],
  ["Lên 1/2", "Lên 1/2", 85, "Giữ hoặc đi theo Long, nhưng hạn chế đuổi quá xa."],
  ["Lên 1/2", "Gần hết lên", 70, "Quản lý Long, chốt bớt nếu RSI khung con cuộn lại rõ."],
  ["Lên 1/2", "Mới xuống", 60, "Gồng nhẹ hoặc giảm vị thế, chờ khung con xác nhận lại."],
  ["Lên 1/2", "Xuống 1/2", 50, "Quan sát, không mua đuổi. Đợi khung con cạn lực xả."],
  ["Lên 1/2", "Gần hết xuống", 75, "Canh Long lại khi khung con tạo form Buy."],
  ["Gần hết lên", "Mới lên", 75, "Long ngắn được, nhưng khung bố đã cuối pha nên quản lý sát."],
  ["Gần hết lên", "Lên 1/2", 65, "Long còn lực nhưng rủi ro cao, tránh vào quá lớn."],
  ["Gần hết lên", "Gần hết lên", 55, "Canh chốt Long, chuẩn bị kịch bản Sell."],
  ["Gần hết lên", "Mới xuống", 80, "Ưu tiên thoát Long hoặc canh Sell sớm khi khung con xác nhận."],
  ["Gần hết lên", "Xuống 1/2", 90, "Sell thuận pha đảo chiều, lực xuống đang mở."],
  ["Gần hết lên", "Gần hết xuống", 70, "Gồng Sell hoặc đợi hồi, tránh bán trễ ở đáy khung con."],
  ["Mới xuống", "Mới lên", 70, "Gồng Short. Coi khung con là nhịp hồi kỹ thuật."],
  ["Mới xuống", "Lên 1/2", 60, "Quan sát. Đợi khung con cuộn xuống rồi mới Short."],
  ["Mới xuống", "Gần hết lên", 80, "Canh Short vì khung con hồi gần xong."],
  ["Mới xuống", "Mới xuống", 100, "Vào Short full với khung con."],
  ["Mới xuống", "Xuống 1/2", 90, "Vào hoặc giữ Short. Xu hướng xuống đang duy trì tốt."],
  ["Mới xuống", "Gần hết xuống", 80, "Gồng Short, đồng thời chuẩn bị quản lý lệnh."],
  ["Xuống 1/2", "Mới lên", 60, "Giảm Short hoặc đợi hồi xong, không Sell đuổi."],
  ["Xuống 1/2", "Lên 1/2", 50, "Quan sát, Short đang bị hồi ngược."],
  ["Xuống 1/2", "Gần hết lên", 75, "Canh Short lại khi khung con hết lực hồi."],
  ["Xuống 1/2", "Mới xuống", 90, "Short theo khung bố, điểm vào đẹp nếu phá xuống tiếp."],
  ["Xuống 1/2", "Xuống 1/2", 85, "Giữ Short nhưng tránh vào muộn."],
  ["Xuống 1/2", "Gần hết xuống", 70, "Quản lý Short, chốt bớt khi khung con cạn lực."],
  ["Gần hết xuống", "Mới lên", 80, "Canh Long sớm vì khung bố bắt đầu cạn lực xuống."],
  ["Gần hết xuống", "Lên 1/2", 90, "Vào hoặc giữ Long hồi phục, lực mua đang mở."],
  ["Gần hết xuống", "Gần hết lên", 70, "Gồng Long ngắn, khung con gần cuối pha hồi."],
  ["Gần hết xuống", "Mới xuống", 75, "Short ngắn và rủi ro cao vì khung bố đã gần cạn lực."],
  ["Gần hết xuống", "Xuống 1/2", 65, "Quan sát, tránh Sell đuổi ở vùng cuối xu hướng."],
  ["Gần hết xuống", "Gần hết xuống", 55, "Chờ form Buy rõ hơn, hạn chế vào lệnh mới."]
];

const MANUAL_RULE_STORAGE_KEY = "manualRsiRuleConfig";
const TWO_RULE_STORAGE_KEY = "twoRsiRuleConfig";
const TRADE_HISTORY_STORAGE_KEY = "singleTradeHistoryV2";
const TRADE_HISTORY_LIMIT = 600;
const STRATEGY_PARITY_READY = false;
const MANUAL_TIMEFRAMES = ["2D", "1D", "H12", "H4", "2H", "1H"];
const DEFAULT_MANUAL_RULE_CONFIG = {
  frames: ["1D", "H12", "H4"],
  states: ["Mới lên", "Mới lên", "Mới lên"]
};
const DEFAULT_TWO_RULE_CONFIG = {
  frames: ["H12", "H4"],
  states: ["Mới lên", "Mới lên"]
};
let manualRuleConfig = { ...DEFAULT_MANUAL_RULE_CONFIG, frames: DEFAULT_MANUAL_RULE_CONFIG.frames.slice(), states: DEFAULT_MANUAL_RULE_CONFIG.states.slice() };
let twoRuleConfig = { ...DEFAULT_TWO_RULE_CONFIG, frames: DEFAULT_TWO_RULE_CONFIG.frames.slice(), states: DEFAULT_TWO_RULE_CONFIG.states.slice() };

const $ = (id) => document.getElementById(id);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateInUtcPlus7(time) {
  return new Date((time + TIMEZONE_OFFSET_SECONDS) * 1000);
}

function formatChartTime(time) {
  if (typeof time !== "number") return "";
  const d = dateInUtcPlus7(time);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function formatTickTime(time) {
  if (typeof time !== "number") return "";
  const d = dateInUtcPlus7(time);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();

  if (hour === 0 && minute === 0) {
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
  }

  return `${pad2(hour)}:${pad2(minute)}`;
}

function formatTradePrice(value) {
  if (!Number.isFinite(value)) return "--";
  return fmt.format(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function tradeTypeLabel(order) {
  if (order.action === "entry") return order.position === "belowBar" ? "Long entry" : "Short entry";
  if (String(order.text || "").startsWith("REV")) return "Reverse out";
  if (order.text === "SL") return "Stop out";
  return "Exit";
}

function loadTradeHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRADE_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveTradeHistory(items) {
  localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(items));
}

function normalizeTradeOrder(symbol, timeframe, order) {
  const key = [symbol, timeframe, order.time, order.action, order.text, order.position].join("|");
  return {
    key,
    time: order.time,
    timeLabel: formatChartTime(order.time),
    symbol,
    timeframe,
    type: tradeTypeLabel(order),
    tag: order.text || "--",
    price: Number.isFinite(order.price) ? order.price : null,
    priceLabel: formatTradePrice(order.price),
    detail: order.detail || order.text || "--",
    action: order.action || "signal"
  };
}

function renderTradeHistory() {
  const rowsEl = $("tradeHistoryRows");
  if (!rowsEl) return;

  const history = loadTradeHistory().sort((a, b) => b.time - a.time);
  rowsEl.innerHTML = history.length
    ? history.map((item, index) => {
        const tone = item.action === "entry" ? "entry" : "exit";
        return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.timeLabel)}</td>
          <td>${escapeHtml(item.symbol)}</td>
          <td>${escapeHtml(item.timeframe)}</td>
          <td><span class="trade-type ${tone}">${escapeHtml(item.type)}</span></td>
          <td><b class="trade-tag">${escapeHtml(item.tag)}</b></td>
          <td>${escapeHtml(item.priceLabel)}</td>
          <td>${escapeHtml(item.detail)}</td>
        </tr>
      `;
      }).join("")
    : `<tr><td class="trade-empty" colspan="8">No saved Single strategy orders yet.</td></tr>`;

  const entryCount = history.filter((item) => item.action === "entry").length;
  const exitCount = history.filter((item) => item.action === "exit").length;
  const latest = history[0];
  const totalEl = document.querySelector('[data-role="trade-total"]');
  const entriesEl = document.querySelector('[data-role="trade-entries"]');
  const exitsEl = document.querySelector('[data-role="trade-exits"]');
  const latestEl = document.querySelector('[data-role="trade-latest"]');
  if (totalEl) totalEl.textContent = String(history.length);
  if (entriesEl) entriesEl.textContent = String(entryCount);
  if (exitsEl) exitsEl.textContent = String(exitCount);
  if (latestEl) latestEl.textContent = latest ? `${latest.tag} ${latest.timeframe}` : "--";
}

function mergeTradeHistory(symbol, timeframe, orders) {
  const relevant = orders.filter((order) => order.action === "entry" || order.action === "exit");
  if (!relevant.length) {
    renderTradeHistory();
    return;
  }

  const byKey = new Map(loadTradeHistory().map((item) => [item.key, item]));
  relevant.forEach((order) => {
    const item = normalizeTradeOrder(symbol, timeframe, order);
    byKey.set(item.key, item);
  });

  const merged = Array.from(byKey.values()).sort((a, b) => b.time - a.time).slice(0, TRADE_HISTORY_LIMIT);
  saveTradeHistory(merged);
  renderTradeHistory();
}

function chartOptions(background = "#0d0d0d") {
  return {
    layout: {
      background: { color: background },
      textColor: "#8f8f8f"
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.07)" },
      horzLines: { color: "rgba(255,255,255,0.07)" }
    },
    rightPriceScale: {
      borderColor: "#242424"
    },
    timeScale: {
      borderColor: "#242424",
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: formatTickTime
    },
    localization: {
      locale: "vi-VN",
      timeFormatter: formatChartTime
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: "rgba(255,255,255,0.55)", style: 3, width: 1 },
      horzLine: { color: "rgba(255,255,255,0.55)", style: 3, width: 1 }
    }
  };
}

function fixedRsiAutoscaleInfo() {
  return {
    priceRange: {
      minValue: 0,
      maxValue: 100
    }
  };
}

function applyRsiChartScale(chart) {
  chart.priceScale("right").applyOptions({
    autoScale: true,
    invertScale: false,
    borderColor: "#242424",
    scaleMargins: {
      top: 0.08,
      bottom: 0.08
    }
  });
}

function rsiLineOptions(options = {}) {
  return {
    title: "",
    lastValueVisible: false,
    priceLineVisible: false,
    autoscaleInfoProvider: fixedRsiAutoscaleInfo,
    ...options
  };
}

function toChartCandle(kline) {
  return {
    time: Math.floor(kline[0] / 1000),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5])
  };
}

function aggregateCandles(source, groupSize) {
  if (groupSize <= 1) return source.slice();

  const result = [];
  for (let i = 0; i < source.length; i += groupSize) {
    const group = source.slice(i, i + groupSize);
    if (!group.length) continue;

    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0)
    });
  }

  return result;
}

function timeframeSeconds(config) {
  const match = String(config.apiTf || "").match(/^(\d+)([hdwM])$/);
  if (!match) return 4 * 60 * 60;

  const value = Number(match[1]);
  const unit = match[2];
  const baseSeconds = {
    h: 60 * 60,
    d: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
    M: 30 * 24 * 60 * 60
  }[unit];

  return value * baseSeconds * (config.aggregate || 1);
}

function currentPriceLineData(candles, config, barsRight = 80) {
  if (!candles.length) return [];

  const last = candles[candles.length - 1];
  const step = timeframeSeconds(config);
  return Array.from({ length: barsRight + 1 }, (_, index) => ({
    time: last.time + step * index,
    value: last.close
  }));
}

function emaFromValues(values, length) {
  const result = [];
  const k = 2 / (length + 1);
  let previous = null;

  values.forEach((point, index) => {
    if (index < length - 1) return;

    if (previous === null) {
      const slice = values.slice(index - length + 1, index + 1);
      previous = slice.reduce((sum, item) => sum + item.value, 0) / length;
    } else {
      previous = point.value * k + previous * (1 - k);
    }

    result.push({ time: point.time, value: previous });
  });

  return result;
}

function emaFromClose(candles, length) {
  return emaFromValues(candles.map((c) => ({ time: c.time, value: c.close })), length);
}

function wmaFromValues(values, length) {
  const result = [];
  const weightSum = length * (length + 1) / 2;

  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < length; j += 1) {
      sum += values[i - j].value * (length - j);
    }
    result.push({ time: values[i].time, value: sum / weightSum });
  }

  return result;
}

function wmaFromClose(candles, length) {
  const result = [];
  const weightSum = length * (length + 1) / 2;

  for (let i = length - 1; i < candles.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < length; j += 1) {
      sum += candles[i - j].close * (length - j);
    }
    result.push({ time: candles[i].time, value: sum / weightSum });
  }

  return result;
}

function valueMap(points) {
  return new Map(points.map((point) => [point.time, point.value]));
}

function marker(time, text, color, position = "belowBar", shape = "circle") {
  return { time, text, color, position, shape, size: 1 };
}

const STRATEGY_CONFIG = {
  noiseLookback: 7,
  noiseCrossCount: 3,
  iiTo3WindowBars: 2,
  stateFreshBars: 1,
  setupStopLookback: 6,
  trapHighLevel: 80,
  trapLowLevel: 20,
  allowDirectITriggers: true,
  requireStrictFormSequence: false,
  filterPointsByEmaWmaTrend: true,
  ignoreH4NoiseGate: true,
  allowSoftLowQualityProbe: true,
  softQualityBuffer: 1,
  minQualityScore: 4,
  minSlPct: 0.20,
  maxSlPct: 8.00
};

const SEM = {
  INIT: 0,
  NEUTRAL_REARM: 1,
  BUY_I: 10,
  BUY_II: 11,
  BUY_1: 12,
  BUY_2: 13,
  BUY_3: 14,
  BUY_STALE: 15,
  BUY_TRAP_WAIT: 16,
  SELL_I: 20,
  SELL_II: 21,
  SELL_1: 22,
  SELL_2: 23,
  SELL_3: 24,
  SELL_STALE: 25,
  SELL_TRAP_WAIT: 26
};

function valueAt(series, index) {
  return series[index]?.value ?? null;
}

function rollingBarssince(flags, index) {
  for (let i = index; i >= 0; i -= 1) {
    if (flags[i]) return index - i;
  }
  return Infinity;
}

function freshAt(flags, index) {
  return !!flags[index] && (index === 0 || !flags[index - 1]);
}

function trapCode(rsiValue, noiseState) {
  if (noiseState) return 0;
  if (rsiValue >= STRATEGY_CONFIG.trapHighLevel) return 1;
  if (rsiValue <= STRATEGY_CONFIG.trapLowLevel) return -1;
  return 0;
}

function resolveStrategySemanticState(prevState, familySide, pointHint, aboveBothFlag, belowBothFlag, linesExpandingFlag, spreadShrinkingFlag, noiseFlag, trapFlag, buyConvergingFlag, sellConvergingFlag, rsiVal, emaVal, wmaVal, stateAgeBars) {
  const staleThresholdBars = STRATEGY_CONFIG.iiTo3WindowBars + STRATEGY_CONFIG.stateFreshBars + 2;

  if (familySide === 0) return prevState === SEM.INIT ? SEM.INIT : SEM.NEUTRAL_REARM;
  if (noiseFlag) {
    if (familySide === 1) return [SEM.BUY_1, SEM.BUY_2, SEM.BUY_3, SEM.BUY_STALE].includes(prevState) ? SEM.BUY_STALE : SEM.NEUTRAL_REARM;
    return [SEM.SELL_1, SEM.SELL_2, SEM.SELL_3, SEM.SELL_STALE].includes(prevState) ? SEM.SELL_STALE : SEM.NEUTRAL_REARM;
  }

  if (familySide === 1) {
    if (trapFlag === -1 && pointHint <= 2) return SEM.BUY_TRAP_WAIT;
    if (belowBothFlag && linesExpandingFlag) return SEM.BUY_I;
    if (belowBothFlag && buyConvergingFlag) return SEM.BUY_II;
    if (aboveBothFlag) return stateAgeBars > staleThresholdBars && !linesExpandingFlag ? SEM.BUY_STALE : SEM.BUY_3;
    if (rsiVal > emaVal && rsiVal < wmaVal) return [SEM.BUY_2, SEM.BUY_3, SEM.BUY_STALE].includes(prevState) || pointHint >= 4 || (prevState === SEM.BUY_1 && stateAgeBars > 0) ? SEM.BUY_2 : SEM.BUY_1;
    if (stateAgeBars > staleThresholdBars && (spreadShrinkingFlag || !linesExpandingFlag)) return SEM.BUY_STALE;
    return SEM.BUY_II;
  }

  if (trapFlag === 1 && pointHint <= 2) return SEM.SELL_TRAP_WAIT;
  if (aboveBothFlag && linesExpandingFlag) return SEM.SELL_I;
  if (aboveBothFlag && sellConvergingFlag) return SEM.SELL_II;
  if (belowBothFlag) return stateAgeBars > staleThresholdBars && !linesExpandingFlag ? SEM.SELL_STALE : SEM.SELL_3;
  if (rsiVal < emaVal && rsiVal > wmaVal) return [SEM.SELL_2, SEM.SELL_3, SEM.SELL_STALE].includes(prevState) || pointHint >= 4 || (prevState === SEM.SELL_1 && stateAgeBars > 0) ? SEM.SELL_2 : SEM.SELL_1;
  if (stateAgeBars > staleThresholdBars && (spreadShrinkingFlag || !linesExpandingFlag)) return SEM.SELL_STALE;
  return SEM.SELL_II;
}

function computeStrategyCurrentTfEvents(candles, rsiData, rsiEmaData, rsiWmaData) {
  const rows = alignedRsiRows(rsiData, rsiEmaData, rsiWmaData);
  const rowByTime = new Map(rows.map((row) => [row.time, row]));
  const aligned = candles.map((candle) => rowByTime.get(candle.time) || null);
  const markers = [];
  const orders = [];
  const emaCrossFlags = [];
  const wmaCrossUpFlags = [];
  const wmaCrossDownFlags = [];
  const buy2Condition = [];
  const sell2Condition = [];
  const buy3Condition = [];
  const sell3Condition = [];
  let side = 0;
  let point = 0;
  let stateBar = null;
  let semanticState = SEM.INIT;
  let positionSide = 0;
  let lastEntrySide = 0;
  let lastEntryText = "No entry";
  let positionStop = null;
  let lastExitIndex = null;

  aligned.forEach((row, index) => {
    const prev = aligned[index - 1];
    const candle = candles[index];
    if (!row || !prev) {
      emaCrossFlags[index] = false;
      wmaCrossUpFlags[index] = false;
      wmaCrossDownFlags[index] = false;
      return;
    }

    if (positionSide === 1 && positionStop != null && candle.low <= positionStop) {
      orders.push({
        time: candle.time,
        position: "aboveBar",
        color: "#ff6b6b",
        shape: "arrowDown",
        text: "SL",
        action: "exit",
        price: positionStop,
        detail: "EXIT LONG SL",
        size: 1
      });
      positionSide = 0;
      positionStop = null;
      lastExitIndex = index;
    } else if (positionSide === -1 && positionStop != null && candle.high >= positionStop) {
      orders.push({
        time: candle.time,
        position: "belowBar",
        color: "#4caf50",
        shape: "arrowUp",
        text: "SL",
        action: "exit",
        price: positionStop,
        detail: "EXIT SHORT SL",
        size: 1
      });
      positionSide = 0;
      positionStop = null;
      lastExitIndex = index;
    }

    const prevSpread = Math.max(Math.abs(prev.rsi - prev.ema), Math.abs(prev.rsi - prev.wma), Math.abs(prev.ema - prev.wma));
    const spread = Math.max(Math.abs(row.rsi - row.ema), Math.abs(row.rsi - row.wma), Math.abs(row.ema - row.wma));
    const aboveBoth = row.rsi > row.ema && row.rsi > row.wma;
    const belowBoth = row.rsi < row.ema && row.rsi < row.wma;
    const betweenBoth = !aboveBoth && !belowBoth;
    const spreadShrinking = spread <= prevSpread;
    const linesExpanding = spread > prevSpread;
    const rsiRising = row.rsi >= prev.rsi;
    const rsiFalling = row.rsi <= prev.rsi;
    const emaFlatUp = row.ema >= prev.ema;
    const emaFlatDown = row.ema <= prev.ema;
    const emaCrossUp = prev.rsi <= prev.ema && row.rsi > row.ema;
    const emaCrossDown = prev.rsi >= prev.ema && row.rsi < row.ema;
    const wmaCrossUp = prev.rsi <= prev.wma && row.rsi > row.wma;
    const wmaCrossDown = prev.rsi >= prev.wma && row.rsi < row.wma;
    const emaCross = emaCrossUp || emaCrossDown;
    emaCrossFlags[index] = emaCross;
    wmaCrossUpFlags[index] = wmaCrossUp;
    wmaCrossDownFlags[index] = wmaCrossDown;
    const recentEmaCrosses = emaCrossFlags.slice(Math.max(0, index - STRATEGY_CONFIG.noiseLookback + 1), index + 1).filter(Boolean).length;
    const noiseState = recentEmaCrosses >= STRATEGY_CONFIG.noiseCrossCount && betweenBoth;
    const buyConverging = belowBoth && !linesExpanding && (spreadShrinking || rsiRising || emaFlatUp);
    const sellConverging = aboveBoth && !linesExpanding && (spreadShrinking || rsiFalling || emaFlatDown);
    const emaWmaTrendSide = row.ema > row.wma ? 1 : row.ema < row.wma ? -1 : 0;
    const buyPointsAllowed = !STRATEGY_CONFIG.filterPointsByEmaWmaTrend || emaWmaTrendSide === -1;
    const sellPointsAllowed = !STRATEGY_CONFIG.filterPointsByEmaWmaTrend || emaWmaTrendSide === 1;
    const rsiPeakVal = index > 1 && prev.rsi > aligned[index - 2]?.rsi && prev.rsi > row.rsi ? prev.rsi : null;
    const rsiTroughVal = index > 1 && prev.rsi < aligned[index - 2]?.rsi && prev.rsi < row.rsi ? prev.rsi : null;
    const barsSinceWmaUp = rollingBarssince(wmaCrossUpFlags, index);
    const barsSinceWmaDown = rollingBarssince(wmaCrossDownFlags, index);
    const previewStateAgeBars = stateBar == null ? 0 : index - stateBar;
    const previewTrap = trapCode(row.rsi, noiseState);
    const previewSemanticState = resolveStrategySemanticState(semanticState, side, point, aboveBoth, belowBoth, linesExpanding, spreadShrinking, noiseState, previewTrap, buyConverging, sellConverging, row.rsi, row.ema, row.wma, previewStateAgeBars);

    const switchToBuyI = belowBoth && linesExpanding && barsSinceWmaDown > 1 && (side !== 1 || point !== 1);
    const switchToSellI = aboveBoth && linesExpanding && barsSinceWmaUp > 1 && (side !== -1 || point !== 1);
    const buyIIEvent = buyPointsAllowed && side === 1 && point === 1 && buyConverging && (rsiTroughVal != null || spreadShrinking);
    const sellIIEvent = sellPointsAllowed && side === -1 && point === 1 && sellConverging && (rsiPeakVal != null || spreadShrinking);
    const buy1Event = buyPointsAllowed && side === 1 && point === 2 && emaCrossUp && row.rsi < row.wma && !noiseState;
    const sell1Event = sellPointsAllowed && side === -1 && point === 2 && emaCrossDown && row.rsi > row.wma && !noiseState;
    const buy2DirectFromI = buyPointsAllowed && STRATEGY_CONFIG.allowDirectITriggers && side === 1 && point === 1 && index > (stateBar ?? -1) && row.rsi > row.ema && row.rsi < row.wma && !noiseState;
    const sell2DirectFromI = sellPointsAllowed && STRATEGY_CONFIG.allowDirectITriggers && side === -1 && point === 1 && index > (stateBar ?? -1) && row.rsi < row.ema && row.rsi > row.wma && !noiseState;
    const buy2Candidate = buyPointsAllowed && side === 1 && point >= 3 && index > (stateBar ?? -1) && row.rsi > row.ema && row.rsi < row.wma && !noiseState;
    const sell2Candidate = sellPointsAllowed && side === -1 && point >= 3 && index > (stateBar ?? -1) && row.rsi < row.ema && row.rsi > row.wma && !noiseState;
    const buy2SemanticCandidate = buyPointsAllowed && previewSemanticState === SEM.BUY_2 && semanticState !== SEM.BUY_2 && index > (stateBar ?? -1) && !noiseState;
    const sell2SemanticCandidate = sellPointsAllowed && previewSemanticState === SEM.SELL_2 && semanticState !== SEM.SELL_2 && index > (stateBar ?? -1) && !noiseState;
    buy2Condition[index] = buy2Candidate || buy2SemanticCandidate;
    sell2Condition[index] = sell2Candidate || sell2SemanticCandidate;
    const buy2Event = freshAt(buy2Condition, index) || buy2DirectFromI;
    const sell2Event = freshAt(sell2Condition, index) || sell2DirectFromI;
    const buy3DirectFromII = buyPointsAllowed && STRATEGY_CONFIG.allowDirectITriggers && side === 1 && point === 1 && buyIIEvent && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3DirectFromII = sellPointsAllowed && STRATEGY_CONFIG.allowDirectITriggers && side === -1 && point === 1 && sellIIEvent && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3WindowFromII = buyPointsAllowed && side === 1 && point === 2 && index > (stateBar ?? -1) && barsSinceWmaUp >= 0 && barsSinceWmaUp <= STRATEGY_CONFIG.iiTo3WindowBars && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3WindowFromII = sellPointsAllowed && side === -1 && point === 2 && index > (stateBar ?? -1) && barsSinceWmaDown >= 0 && barsSinceWmaDown <= STRATEGY_CONFIG.iiTo3WindowBars && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Impulse = buyPointsAllowed && side === 1 && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3Impulse = sellPointsAllowed && side === -1 && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Candidate = buyPointsAllowed && side === 1 && index > (stateBar ?? -1) && !noiseState && (point >= 3 && wmaCrossUp || buy3WindowFromII);
    const sell3Candidate = sellPointsAllowed && side === -1 && index > (stateBar ?? -1) && !noiseState && (point >= 3 && wmaCrossDown || sell3WindowFromII);
    const buy3SemanticCandidate = buyPointsAllowed && previewSemanticState === SEM.BUY_3 && semanticState !== SEM.BUY_3 && index > (stateBar ?? -1) && !noiseState;
    const sell3SemanticCandidate = sellPointsAllowed && previewSemanticState === SEM.SELL_3 && semanticState !== SEM.SELL_3 && index > (stateBar ?? -1) && !noiseState;
    buy3Condition[index] = buy3Candidate || buy3SemanticCandidate;
    sell3Condition[index] = sell3Candidate || sell3SemanticCandidate;
    const buy3Event = freshAt(buy3Condition, index) || buy3DirectFromII || buy3Impulse;
    const sell3Event = freshAt(sell3Condition, index) || sell3DirectFromII || sell3Impulse;
    const triggerCode = buy2Event ? 4 : buy3Event ? 5 : sell2Event ? -4 : sell3Event ? -5 : 0;

    if (buyIIEvent) markers.push(marker(candle.time, "II", "#00ff66", "belowBar", "circle"));
    if (sellIIEvent) markers.push(marker(candle.time, "II", "#ff9800", "aboveBar", "circle"));
    if (freshAt([...(buy2Condition.slice(0, index)), buy2Candidate], index)) markers.push(marker(candle.time, "2", "#4caf50", "belowBar", "square"));
    if (freshAt([...(sell2Condition.slice(0, index)), sell2Candidate], index)) markers.push(marker(candle.time, "2", "#ff4d5a", "aboveBar", "square"));
    if (freshAt([...(buy3Condition.slice(0, index)), buy3Candidate], index)) markers.push(marker(candle.time, "3", "#4caf50", "belowBar", "arrowUp"));
    if (freshAt([...(sell3Condition.slice(0, index)), sell3Candidate], index)) markers.push(marker(candle.time, "3", "#ff4d5a", "aboveBar", "arrowDown"));

    if (triggerCode !== 0) {
      const isLong = triggerCode > 0;
      const lowWindow = candles.slice(Math.max(0, index - STRATEGY_CONFIG.setupStopLookback + 1), index + 1).map((c) => c.low);
      const highWindow = candles.slice(Math.max(0, index - STRATEGY_CONFIG.setupStopLookback + 1), index + 1).map((c) => c.high);
      const stop = isLong ? Math.min(...lowWindow) : Math.max(...highWindow);
      const risk = isLong ? candle.close - stop : stop - candle.close;
      const slPct = risk > 0 ? risk / candle.close * 100 : NaN;
      const validStop = risk > 0 && slPct >= STRATEGY_CONFIG.minSlPct && slPct <= STRATEGY_CONFIG.maxSlPct;
      const flatCooldownOk = lastExitIndex == null || index > lastExitIndex + 1;
      const oppositePosition = positionSide !== 0 && positionSide !== (isLong ? 1 : -1);
      const flatEntryReady = validStop && positionSide === 0 && flatCooldownOk;
      const reversePrepare = validStop && oppositePosition;

      if (reversePrepare) {
        const code = Math.abs(triggerCode) === 4 ? "B2" : "B3";
        positionSide = 0;
        positionStop = null;
        lastExitIndex = index;
        orders.push({
          time: candle.time,
          position: isLong ? "belowBar" : "aboveBar",
          color: isLong ? "#304cff" : "#d000ff",
          shape: isLong ? "arrowUp" : "arrowDown",
          text: `REV ${code}`,
          action: "exit",
          price: candle.close,
          detail: `REVERSE OUT ${code}`,
          size: 1
        });
      } else if (flatEntryReady && isLong) {
        const code = Math.abs(triggerCode) === 4 ? "B2" : "B3";
        const entryText = `PARTIAL ONLY H4/early/${code}`;
        orders.push({
          time: candle.time,
          position: isLong ? "belowBar" : "aboveBar",
          color: isLong ? "#304cff" : "#d000ff",
          shape: isLong ? "arrowUp" : "arrowDown",
          text: `L ${code}`,
          action: "entry",
          price: candle.close,
          detail: entryText,
          size: 1
        });
        positionSide = isLong ? 1 : -1;
        lastEntrySide = positionSide;
        lastEntryText = entryText;
        positionStop = stop;
      }
    }

    if (side === 0) {
      if (buy3Impulse) { side = 1; point = 5; stateBar = index; }
      else if (sell3Impulse) { side = -1; point = 5; stateBar = index; }
      else if (belowBoth) { side = 1; point = 1; stateBar = index; }
      else if (aboveBoth) { side = -1; point = 1; stateBar = index; }
    } else if (switchToSellI) {
      side = -1; point = 1; stateBar = index;
    } else if (switchToBuyI) {
      side = 1; point = 1; stateBar = index;
    } else if (buy3Impulse) {
      side = 1; point = 5; stateBar = index;
    } else if (sell3Impulse) {
      side = -1; point = 5; stateBar = index;
    } else if (buy3DirectFromII || sell3DirectFromII) {
      point = 5; stateBar = index;
    } else if (buyIIEvent || sellIIEvent) {
      point = 2; stateBar = index;
    } else if (buy1Event || sell1Event) {
      point = 3; stateBar = index;
    } else if (buy2Event || sell2Event) {
      point = 4; stateBar = index;
    } else if (buy3Event || sell3Event) {
      point = 5; stateBar = index;
    }

    const stateAgeBars = stateBar == null ? 0 : index - stateBar;
    semanticState = resolveStrategySemanticState(semanticState, side, point, aboveBoth, belowBoth, linesExpanding, spreadShrinking, noiseState, trapCode(row.rsi, noiseState), buyConverging, sellConverging, row.rsi, row.ema, row.wma, stateAgeBars);
  });

  return {
    markers,
    orders,
    status: {
      positionSide: positionSide || lastEntrySide,
      lastEntrySide,
      lastEntryText
    }
  };
}

function latestRsiRow(rsiData, rsiEmaData, rsiWmaData) {
  const rows = alignedRsiRows(rsiData, rsiEmaData, rsiWmaData);
  return rows.length ? rows[rows.length - 1] : null;
}

function singleStrategyFromSignal(rsiState, signalMarkers, rsiData, rsiEmaData, rsiWmaData) {
  const recentTimes = new Set(rsiData.slice(-12).map((point) => point.time));
  const recentEntry = signalMarkers
    .filter((item) => recentTimes.has(item.time) && ["2", "3"].includes(String(item.text)))
    .sort((a, b) => a.time - b.time)
    .at(-1);
  const recentSetup = signalMarkers
    .filter((item) => recentTimes.has(item.time) && String(item.text) === "II")
    .sort((a, b) => a.time - b.time)
    .at(-1);
  const last = latestRsiRow(rsiData, rsiEmaData, rsiWmaData);

  if (recentEntry?.position === "belowBar") {
    return {
      tone: "buy",
      label: "BUY",
      detail: `${rsiState || "RSI up"} | signal ${recentEntry.text}`
    };
  }

  if (recentEntry?.position === "aboveBar") {
    return {
      tone: "sell",
      label: "SELL",
      detail: `${rsiState || "RSI down"} | signal ${recentEntry.text}`
    };
  }

  if (recentSetup?.position === "belowBar") {
    return {
      tone: "hold",
      label: "WATCH L",
      detail: `${rsiState || "Buy setup"} | wait 2/3`
    };
  }

  if (recentSetup?.position === "aboveBar") {
    return {
      tone: "hold",
      label: "WATCH S",
      detail: `${rsiState || "Sell setup"} | wait 2/3`
    };
  }

  if (last && last.rsi > last.ema && last.rsi > last.wma) {
    return {
      tone: "hold",
      label: "HOLD L",
      detail: `${rsiState || "RSI above EMA/WMA"} | no fresh entry`
    };
  }

  if (last && last.rsi < last.ema && last.rsi < last.wma) {
    return {
      tone: "hold",
      label: "HOLD S",
      detail: `${rsiState || "RSI below EMA/WMA"} | no fresh entry`
    };
  }

  return {
    tone: "wait",
    label: "WAIT",
    detail: `${rsiState || "RSI mixed"} | no clean setup`
  };
}

function strategyPriceMarkers(signalMarkers) {
  return signalMarkers
    .filter((item) => ["2", "3"].includes(String(item.text)))
    .map((item) => ({
      time: item.time,
      position: item.position,
      color: item.position === "belowBar" ? "#4caf50" : "#ff4d5a",
      shape: item.position === "belowBar" ? "arrowUp" : "arrowDown",
      text: item.position === "belowBar" ? `BUY ${item.text}` : `SELL ${item.text}`,
      size: 1
    }));
}

function rsiExtremeLineData(rsiData, predicate) {
  return rsiData.map((point, index) => {
    const prev = rsiData[index - 1];
    const next = rsiData[index + 1];
    const shouldHighlight = predicate(point.value) || (prev && predicate(prev.value)) || (next && predicate(next.value));
    return shouldHighlight ? { time: point.time, value: point.value } : { time: point.time };
  });
}

function rsiColorData(rsiData) {
  return rsiData.map((point) => {
    let color = "#f2f2f2";
    if (point.value <= RSI_LOW_LEVEL) color = RSI_LOW_COLOR;
    if (point.value >= RSI_HIGH_LEVEL) color = RSI_HIGH_COLOR;
    return { ...point, color };
  });
}

function alignedRsiRows(rsiData, rsiEmaData, rsiWmaData) {
  const emaByTime = valueMap(rsiEmaData);
  const wmaByTime = valueMap(rsiWmaData);
  return rsiData
    .map((point) => ({
      time: point.time,
      rsi: point.value,
      ema: emaByTime.get(point.time),
      wma: wmaByTime.get(point.time)
    }))
    .filter((row) => row.ema !== undefined && row.wma !== undefined);
}

function recentCross(rows, direction, lookback = 2) {
  const start = Math.max(1, rows.length - lookback);
  for (let i = rows.length - 1; i >= start; i -= 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (!prev || !curr) continue;

    const emaCrossUp = prev.rsi <= prev.ema && curr.rsi > curr.ema;
    const wmaCrossUp = prev.rsi <= prev.wma && curr.rsi > curr.wma;
    const emaCrossDown = prev.rsi >= prev.ema && curr.rsi < curr.ema;
    const wmaCrossDown = prev.rsi >= prev.wma && curr.rsi < curr.wma;

    if (direction === "up" && (emaCrossUp || wmaCrossUp)) return true;
    if (direction === "down" && (emaCrossDown || wmaCrossDown)) return true;
  }

  return false;
}

function recentSignalState(signalMarkers, rsiData, lookback = 8) {
  if (!signalMarkers.length || !rsiData.length) return null;

  const recentTimes = new Set(rsiData.slice(-lookback).map((point) => point.time));
  const recentMarkers = signalMarkers
    .filter((item) => recentTimes.has(item.time) && ["2", "3"].includes(String(item.text)))
    .sort((a, b) => a.time - b.time);
  const lastMarker = recentMarkers[recentMarkers.length - 1];
  if (!lastMarker) return null;

  if (lastMarker.position === "belowBar") return "Mới lên";
  if (lastMarker.position === "aboveBar") return "Mới xuống";
  return null;
}

function detectRsiState(rsiData, rsiEmaData, rsiWmaData, signalMarkers = []) {
  const signalState = recentSignalState(signalMarkers, rsiData);
  if (signalState) return signalState;

  const rows = alignedRsiRows(rsiData, rsiEmaData, rsiWmaData);
  if (rows.length < 4) return null;

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const earlier = rows[rows.length - 4];
  const spread = Math.max(Math.abs(last.rsi - last.ema), Math.abs(last.rsi - last.wma));
  const prevSpread = Math.max(Math.abs(prev.rsi - prev.ema), Math.abs(prev.rsi - prev.wma));
  const earlySpread = Math.max(Math.abs(earlier.rsi - earlier.ema), Math.abs(earlier.rsi - earlier.wma));
  const spreadShrinking = spread <= prevSpread && spread <= earlySpread;
  const rsiRising = last.rsi > prev.rsi;
  const rsiFalling = last.rsi < prev.rsi;
  const aboveBoth = last.rsi > last.ema && last.rsi > last.wma;
  const belowBoth = last.rsi < last.ema && last.rsi < last.wma;

  if (recentCross(rows, "up")) return "Mới lên";
  if (recentCross(rows, "down")) return "Mới xuống";

  if (aboveBoth) {
    return spreadShrinking || rsiFalling ? "Gần hết lên" : "Lên 1/2";
  }

  if (belowBoth) {
    return spreadShrinking || rsiRising ? "Gần hết xuống" : "Xuống 1/2";
  }

  if (last.rsi >= last.ema && last.rsi >= last.wma) return rsiFalling ? "Gần hết lên" : "Lên 1/2";
  if (last.rsi <= last.ema && last.rsi <= last.wma) return rsiRising ? "Gần hết xuống" : "Xuống 1/2";
  return last.rsi >= prev.rsi ? "Mới lên" : "Mới xuống";
}

function countRecentEmaCrosses(rows, index) {
  let count = 0;
  const start = Math.max(1, index - NOISE_LOOKBACK + 1);

  for (let i = start; i <= index; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (!prev || !curr) continue;

    const crossed = (prev.rsi <= prev.ema && curr.rsi > curr.ema) || (prev.rsi >= prev.ema && curr.rsi < curr.ema);
    if (crossed) count += 1;
  }

  return count;
}

function computeSignalMarkers(rsiData, rsiEmaData, rsiWmaData) {
  const emaByTime = valueMap(rsiEmaData);
  const wmaByTime = valueMap(rsiWmaData);
  const rows = rsiData
    .map((point) => ({
      time: point.time,
      rsi: point.value,
      ema: emaByTime.get(point.time),
      wma: wmaByTime.get(point.time)
    }))
    .filter((row) => row.ema !== undefined && row.wma !== undefined);

  const markers = [];
  let side = 0;
  let point = 0;
  let stateIndex = null;
  let lastBuy2Index = -Infinity;
  let lastSell2Index = -Infinity;
  let lastBuy3Index = -Infinity;
  let lastSell3Index = -Infinity;
  let lastBuyIiIndex = -Infinity;
  let lastSellIiIndex = -Infinity;

  rows.forEach((row, index) => {
    const prev = rows[index - 1];
    if (!prev) return;

    const aboveBoth = row.rsi > row.ema && row.rsi > row.wma;
    const belowBoth = row.rsi < row.ema && row.rsi < row.wma;
    const betweenBoth = !aboveBoth && !belowBoth;
    const prevSpread = Math.max(Math.abs(prev.rsi - prev.ema), Math.abs(prev.rsi - prev.wma), Math.abs(prev.ema - prev.wma));
    const spread = Math.max(Math.abs(row.rsi - row.ema), Math.abs(row.rsi - row.wma), Math.abs(row.ema - row.wma));
    const spreadShrinking = spread <= prevSpread;
    const linesExpanding = spread > prevSpread;
    const rsiRising = row.rsi >= prev.rsi;
    const rsiFalling = row.rsi <= prev.rsi;
    const emaFlatUp = row.ema >= prev.ema;
    const emaFlatDown = row.ema <= prev.ema;
    const emaCrossUp = prev.rsi <= prev.ema && row.rsi > row.ema;
    const emaCrossDown = prev.rsi >= prev.ema && row.rsi < row.ema;
    const wmaCrossUp = prev.rsi <= prev.wma && row.rsi > row.wma;
    const wmaCrossDown = prev.rsi >= prev.wma && row.rsi < row.wma;
    const noiseState = countRecentEmaCrosses(rows, index) >= NOISE_CROSS_COUNT && betweenBoth;
    const rsiTrough = index > 1 && prev.rsi < rows[index - 2].rsi && prev.rsi < row.rsi;
    const rsiPeak = index > 1 && prev.rsi > rows[index - 2].rsi && prev.rsi > row.rsi;
    const buyConverging = belowBoth && !linesExpanding && (spreadShrinking || rsiRising || emaFlatUp);
    const sellConverging = aboveBoth && !linesExpanding && (spreadShrinking || rsiFalling || emaFlatDown);
    const barsSinceState = stateIndex === null ? Infinity : index - stateIndex;

    if (belowBoth && linesExpanding && side !== 1) {
      side = 1;
      point = 1;
      stateIndex = index;
    } else if (aboveBoth && linesExpanding && side !== -1) {
      side = -1;
      point = 1;
      stateIndex = index;
    }

    const buyIIEvent = side === 1 && point === 1 && buyConverging && (rsiTrough || spreadShrinking);
    const sellIIEvent = side === -1 && point === 1 && sellConverging && (rsiPeak || spreadShrinking);
    const buy1Event = side === 1 && point === 2 && emaCrossUp && row.rsi < row.wma && !noiseState;
    const sell1Event = side === -1 && point === 2 && emaCrossDown && row.rsi > row.wma && !noiseState;
    const buy2Event = side === 1 && point >= 3 && barsSinceState > 0 && row.rsi > row.ema && row.rsi < row.wma && !noiseState;
    const sell2Event = side === -1 && point >= 3 && barsSinceState > 0 && row.rsi < row.ema && row.rsi > row.wma && !noiseState;
    const buy3Window = side === 1 && point === 2 && index - lastBuyIiIndex <= II_TO_3_WINDOW_BARS && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3Window = side === -1 && point === 2 && index - lastSellIiIndex <= II_TO_3_WINDOW_BARS && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Event = side === 1 && !noiseState && ((point >= 3 && wmaCrossUp) || buy3Window);
    const sell3Event = side === -1 && !noiseState && ((point >= 3 && wmaCrossDown) || sell3Window);

    if (buyIIEvent && index - lastBuyIiIndex > 1) {
      markers.push(marker(row.time, "II", "#00ff66", "belowBar", "circle"));
      side = 1;
      point = 2;
      stateIndex = index;
      lastBuyIiIndex = index;
    }
    if (sellIIEvent && index - lastSellIiIndex > 1) {
      markers.push(marker(row.time, "II", "#ff9800", "aboveBar", "circle"));
      side = -1;
      point = 2;
      stateIndex = index;
      lastSellIiIndex = index;
    }
    if (buy1Event) {
      side = 1;
      point = 3;
      stateIndex = index;
    }
    if (sell1Event) {
      side = -1;
      point = 3;
      stateIndex = index;
    }
    if (buy2Event && index - lastBuy2Index > 1) {
      markers.push(marker(row.time, "2", "#4caf50", "belowBar", "square"));
      side = 1;
      point = 4;
      stateIndex = index;
      lastBuy2Index = index;
    }
    if (sell2Event && index - lastSell2Index > 1) {
      markers.push(marker(row.time, "2", "#ff4d5a", "aboveBar", "square"));
      side = -1;
      point = 4;
      stateIndex = index;
      lastSell2Index = index;
    }
    if (buy3Event && index - lastBuy3Index > 1) {
      markers.push(marker(row.time, "3", "#4caf50", "belowBar", "arrowUp"));
      side = 1;
      point = 5;
      stateIndex = index;
      lastBuy3Index = index;
    }
    if (sell3Event && index - lastSell3Index > 1) {
      markers.push(marker(row.time, "3", "#ff4d5a", "aboveBar", "arrowDown"));
      side = -1;
      point = 5;
      stateIndex = index;
      lastSell3Index = index;
    }

  });

  return markers;
}

function jmaFromClose(candles, length, power, phase) {
  const result = [];
  const phaseRatio = phase < -100 ? 0.5 : phase > 100 ? 2.5 : phase / 100 + 1.5;
  const beta = 0.45 * (length - 1) / (0.45 * (length - 1) + 2);
  const alpha = Math.pow(beta, power);
  const oneMinusAlphaSq = Math.pow(1 - alpha, 2);
  const alphaSq = Math.pow(alpha, 2);
  let jma = 0;
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;

  candles.forEach((candle) => {
    const src = candle.close;
    e0 = (1 - alpha) * src + alpha * e0;
    e1 = (src - e0) * (1 - beta) + beta * e1;
    e2 = (e0 + phaseRatio * e1 - jma) * oneMinusAlphaSq + alphaSq * e2;
    jma = e2 + jma;
    result.push({ time: candle.time, value: jma });
  });

  return result;
}

function getAnchorBucket(time, anchorTf = "D") {
  const d = dateInUtcPlus7(time);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  if (anchorTf === "W") {
    const dow = d.getUTCDay();
    const daysFromMonday = (dow + 6) % 7;
    const monday = new Date(Date.UTC(year, d.getUTCMonth(), day - daysFromMonday, 0, 0, 0));
    return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
  }

  if (anchorTf === "M") {
    return `${year}-${pad2(month)}`;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function anchoredVwap(candles, anchorTf = "D") {
  const result = [];
  let currentBucket = null;
  let cumulativeVolume = 0;
  let cumulativeSrcVolume = 0;

  candles.forEach((candle) => {
    const bucket = getAnchorBucket(candle.time, anchorTf);
    const currentVolume = Number.isFinite(candle.volume) ? candle.volume : 0;
    const currentSrc = (candle.high + candle.low + candle.close) / 3;

    if (bucket !== currentBucket) {
      currentBucket = bucket;
      cumulativeVolume = currentVolume;
      cumulativeSrcVolume = currentSrc * currentVolume;
    } else {
      cumulativeVolume += currentVolume;
      cumulativeSrcVolume += currentSrc * currentVolume;
    }

    result.push({
      time: candle.time,
      value: cumulativeVolume === 0 ? currentSrc : cumulativeSrcVolume / cumulativeVolume
    });
  });

  return result;
}

function crossSignals(candles, fastBaseline, slowBaseline) {
  const byTimeFast = new Map(fastBaseline.map((point) => [point.time, point.value]));
  const byTimeSlow = new Map(slowBaseline.map((point) => [point.time, point.value]));
  const result = new Map();

  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const prevFast = byTimeFast.get(prev.time);
    const currFast = byTimeFast.get(curr.time);
    const prevSlow = byTimeSlow.get(prev.time);
    const currSlow = byTimeSlow.get(curr.time);

    if (prevFast !== undefined && currFast !== undefined) {
      if (prev.close <= prevFast && curr.close > currFast) result.set(curr.time, "#4caf50");
      if (prev.close >= prevFast && curr.close < currFast) result.set(curr.time, "#ff4d5a");
    }

    if (prevSlow !== undefined && currSlow !== undefined) {
      if (prev.close <= prevSlow && curr.close > currSlow) result.set(curr.time, "#2f5cff");
      if (prev.close >= prevSlow && curr.close < currSlow) result.set(curr.time, "#9c27b0");
    }
  }

  return result;
}

function rsi(candles, length = 14) {
  const result = [];
  if (candles.length <= length + 1) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / length;
  let avgLoss = losses / length;

  for (let i = length + 1; i < candles.length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: candles[i].time, value: 100 - (100 / (1 + rs)) });
  }

  return result;
}

function closeSocket(ws) {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  try { ws.close(); } catch (err) {}
}

function loadParams() {
  const saved = JSON.parse(localStorage.getItem("indicatorParams") || "{}");
  Object.entries(DEFAULT_PARAMS).forEach(([key, defaultValue]) => {
    const value = Number(saved[key]);
    params[key] = Number.isFinite(value) ? value : defaultValue;
  });
}

function saveParams() {
  localStorage.setItem("indicatorParams", JSON.stringify(params));
}

function syncParamInputs() {
  document.querySelectorAll(".param-input").forEach((input) => {
    input.value = params[input.dataset.param] ?? "";
  });
}

function resetParams() {
  Object.assign(params, DEFAULT_PARAMS);
  saveParams();
  syncParamInputs();
  redrawAll();
}

function bindControls() {
  document.querySelectorAll(".layer-toggle").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      layerState[checkbox.dataset.layer] = checkbox.checked;
      redrawAll();
    });
  });

  document.querySelectorAll(".param-input").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.param;
      const min = Number(input.min);
      const max = Number(input.max);
      let value = Number(input.value);
      if (!Number.isFinite(value)) value = DEFAULT_PARAMS[key];
      if (Number.isFinite(min)) value = Math.max(min, value);
      if (Number.isFinite(max)) value = Math.min(max, value);
      params[key] = Math.round(value);
      input.value = params[key];
      saveParams();
      redrawAll();
    });
  });

  $("resetParams").addEventListener("click", resetParams);
}

function setLiveStatus(isOnline, text) {
  $("liveDot").classList.toggle("online", isOnline);
  $("liveStatus").textContent = text;
}

function updateRsiValue(el, value) {
  el.textContent = value === null ? "--" : fmt.format(value);
  el.classList.toggle("rsi-low", value !== null && value <= 20);
  el.classList.toggle("rsi-high", value !== null && value >= 80);
}

function updateOhlc(candle) {
  if (!candle) {
    $("mainOhlc").textContent = "O -- H -- L -- C --";
    $("mainChange").textContent = "--%";
    $("mainChange").className = "main-change";
    return;
  }

  const change = candle.close - candle.open;
  const pct = candle.open ? (change / candle.open) * 100 : 0;
  $("mainOhlc").textContent = `O${fmt.format(candle.open)} H${fmt.format(candle.high)} L${fmt.format(candle.low)} C${fmt.format(candle.close)}`;
  $("mainChange").textContent = `${change >= 0 ? "+" : ""}${fmt.format(change)} (${pct.toFixed(2)}%)`;
  $("mainChange").className = `main-change ${change >= 0 ? "up" : "down"}`;
}

class MarketPanel {
  constructor(config) {
    this.config = config;
    this.el = document.querySelector(`[data-frame="${config.key}"]`);
    this.rawCandles = [];
    this.candles = [];
    this.ws = null;
    this.closeEl = this.el.querySelector('[data-role="close"]');
    this.priceNode = this.el.querySelector('[data-role="price-chart"]');

    this.priceChart = LightweightCharts.createChart(this.priceNode, chartOptions("#0d0d0d"));

    this.candleSeries = this.priceChart.addCandlestickSeries({
      upColor: "#4caf50",
      downColor: "#b8b8b8",
      borderUpColor: "#4caf50",
      borderDownColor: "#b8b8b8",
      wickUpColor: "#4caf50",
      wickDownColor: "#b8b8b8",
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.currentPriceSeries = this.priceChart.addLineSeries({
      color: "rgba(242,242,242,0.72)",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.baselineSeries = this.priceChart.addLineSeries({
      color: "#ffff00",
      lineWidth: 2,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.slowBaselineSeries = this.priceChart.addLineSeries({
      color: "#9c27b0",
      lineWidth: 2,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.vwapSeries = this.priceChart.addLineSeries({
      color: "#f2f2f2",
      lineWidth: 2,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false
    });
  }

  resize() {
    this.priceChart.applyOptions({
      width: this.priceNode.clientWidth,
      height: this.priceNode.clientHeight
    });
  }

  klineUrl() {
    return `${API}/api/v3/klines?symbol=${currentSymbol}&interval=${this.config.apiTf}&limit=${this.config.limit}`;
  }

  refreshCandles() {
    this.candles = aggregateCandles(this.rawCandles, this.config.aggregate);
  }

  focusLatest(bars = VISIBLE_BARS) {
    const total = this.candles.length;
    if (!total) return;

    const from = Math.max(total - bars, 0);
    const to = total + 1;
    this.priceChart.timeScale().setVisibleLogicalRange({ from, to });
  }

  async load(session) {
    closeSocket(this.ws);
    this.closeEl.textContent = "--";

    const response = await fetch(this.klineUrl());
    if (!response.ok) throw new Error(`${this.config.label} HTTP ${response.status}`);

    const raw = await response.json();
    if (session !== sessionId) return;

    this.rawCandles = raw.map(toChartCandle);
    this.refreshCandles();
    this.draw(true);
    this.startWebSocket(session);
  }

  draw(fit = false) {
    const candles = this.candles;
    if (!candles.length) return;

    const baseline = jmaFromClose(candles, params.baselineLength, 2, params.baselinePhase);
    const slowBaseline = jmaFromClose(candles, params.slowBaselineLength, 2, params.slowBaselinePhase);
    const vwapData = anchoredVwap(candles, "W");
    const barColors = crossSignals(candles, baseline, slowBaseline);

    this.candleSeries.setData(candles.map((c) => {
      const signalColor = barColors.get(c.time);
      const bodyColor = signalColor || (c.close >= c.open ? "#4caf50" : "#b8b8b8");
      return {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
        close: c.close,
        color: bodyColor,
        borderColor: bodyColor,
        wickColor: bodyColor
      };
    }));
    this.currentPriceSeries.setData(currentPriceLineData(candles, this.config));
    this.baselineSeries.setData(layerState.baseline ? baseline : []);
    this.slowBaselineSeries.setData(layerState.slowBaseline ? slowBaseline : []);
    this.vwapSeries.setData(layerState.vwap ? vwapData : []);

    const rsiData = rsi(candles, params.rsiLength);
    const rsiEmaData = emaFromValues(rsiData, params.rsiEmaLength);
    const rsiWmaData = wmaFromValues(rsiData, params.rsiWmaLength);
    const signalMarkers = computeSignalMarkers(rsiData, rsiEmaData, rsiWmaData);
    const rsiState = detectRsiState(rsiData, rsiEmaData, rsiWmaData, signalMarkers);
    if (rsiState) {
      rsiFrameStates.set(this.config.key, {
        state: rsiState,
        rsi: rsiData.length ? rsiData[rsiData.length - 1].value : null
      });
      updateCurrentRule();
    }

    const last = candles[candles.length - 1];
    this.closeEl.textContent = fmt.format(last.close);
    rsiOnlyPanels.get(this.config.key)?.draw(candles, rsiData, rsiEmaData, rsiWmaData, signalMarkers, fit);

    if (this.config.key === "h4") updateOhlc(last);

    if (fit) this.focusLatest();
  }

  startWebSocket(session) {
    const stream = `${currentSymbol.toLowerCase()}@kline_${this.config.wsTf}`;
    this.ws = new WebSocket(`${WS_BASE}/${stream}`);

    this.ws.onopen = () => {
      if (session === sessionId) setLiveStatus(true, `Live ${currentSymbol}`);
    };

    this.ws.onclose = () => {
      if (session !== sessionId) return;
      setLiveStatus(false, "Reconnecting...");
      setTimeout(() => {
        if (session === sessionId) this.startWebSocket(session);
      }, 1500);
    };

    this.ws.onerror = () => {
      if (session !== sessionId) return;
      setLiveStatus(false, "WebSocket error");
      try { this.ws.close(); } catch (err) {}
    };

    this.ws.onmessage = (event) => {
      if (session !== sessionId) return;

      const msg = JSON.parse(event.data);
      const k = msg.k;
      const candle = {
        time: Math.floor(k.t / 1000),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v)
      };
      const last = this.rawCandles[this.rawCandles.length - 1];

      if (last && last.time === candle.time) {
        this.rawCandles[this.rawCandles.length - 1] = candle;
      } else {
        this.rawCandles.push(candle);
        while (this.rawCandles.length > this.config.limit) this.rawCandles.shift();
      }

      this.refreshCandles();
      this.draw(false);
    };
  }
}

class RsiOnlyPanel {
  constructor(config) {
    this.config = config;
    this.el = document.querySelector(`[data-rsi-frame="${config.key}"]`);
    this.valueEl = this.el.querySelector('[data-role="rsi-only-value"]');
    this.chartNode = this.el.querySelector('[data-role="rsi-only-chart"]');
    this.lastCandles = [];

    this.chart = LightweightCharts.createChart(this.chartNode, chartOptions("#090909"));
    applyRsiChartScale(this.chart);

    this.rsiSeries = this.chart.addLineSeries(rsiLineOptions({
      color: "#f2f2f2",
      lineWidth: 2
    }));
    this.rsiLowSeries = this.chart.addLineSeries(rsiLineOptions({
      color: RSI_LOW_COLOR,
      lineWidth: 3
    }));
    this.rsiHighSeries = this.chart.addLineSeries(rsiLineOptions({
      color: RSI_HIGH_COLOR,
      lineWidth: 4
    }));
    this.rsiEmaSeries = this.chart.addLineSeries(rsiLineOptions({
      color: "#ff9800",
      lineWidth: 2
    }));
    this.rsiWmaSeries = this.chart.addLineSeries(rsiLineOptions({
      color: "#ff3045",
      lineWidth: 2
    }));
    this.rsi70 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(255,77,90,0.65)", lineWidth: 1, lineStyle: 2 }));
    this.rsi80 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(255,43,214,0.8)", lineWidth: 1, lineStyle: 2 }));
    this.rsi50 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(255,255,255,0.24)", lineWidth: 1, lineStyle: 2 }));
    this.rsi20 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(139,0,0,0.8)", lineWidth: 1, lineStyle: 2 }));
    this.rsi30 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.65)", lineWidth: 1, lineStyle: 2 }));
  }

  resize() {
    this.chart.applyOptions({
      width: this.chartNode.clientWidth,
      height: this.chartNode.clientHeight
    });
  }

  focusLatest(bars = VISIBLE_BARS) {
    const total = this.lastCandles.length;
    if (!total) return;

    const from = Math.max(total - bars, 0);
    const to = total + 1;
    this.chart.timeScale().setVisibleLogicalRange({ from, to });
  }

  draw(candles, rsiData, rsiEmaData, rsiWmaData, signalMarkers = [], fit = false) {
    this.lastCandles = candles;
    this.rsiSeries.setData(layerState.rsi ? rsiColorData(rsiData) : []);
    this.rsiLowSeries.setData([]);
    this.rsiHighSeries.setData([]);
    this.rsiEmaSeries.setData(layerState.rsiEma ? rsiEmaData : []);
    this.rsiWmaSeries.setData(layerState.rsiWma ? rsiWmaData : []);
    this.rsiSeries.setMarkers(layerState.signals ? signalMarkers : []);
    this.rsi70.setData(candles.map((c) => ({ time: c.time, value: 70 })));
    this.rsi80.setData(candles.map((c) => ({ time: c.time, value: RSI_HIGH_LEVEL })));
    this.rsi50.setData(candles.map((c) => ({ time: c.time, value: 50 })));
    this.rsi20.setData(candles.map((c) => ({ time: c.time, value: RSI_LOW_LEVEL })));
    this.rsi30.setData(candles.map((c) => ({ time: c.time, value: 30 })));

    const lastRsi = rsiData.length ? rsiData[rsiData.length - 1].value : null;
    updateRsiValue(this.valueEl, lastRsi);
    if (fit) this.focusLatest();
  }
}

class SingleFramePanel {
  constructor() {
    this.config = SINGLE_FRAMES.find((frame) => frame.key === (localStorage.getItem("singleFrameTf") || "h12")) || SINGLE_FRAMES[3];
    this.rawCandles = [];
    this.candles = [];
    this.ws = null;
    this.symbolEl = document.querySelector('[data-role="single-symbol"]');
    this.priceEl = document.querySelector('[data-role="single-price"]');
    this.changeEl = document.querySelector('[data-role="single-change"]');
    this.strategyEl = document.querySelector('[data-role="single-strategy"]');
    this.strategyLabelEl = document.querySelector('[data-role="single-strategy-label"]');
    this.strategyDetailEl = document.querySelector('[data-role="single-strategy-detail"]');
    this.shellNode = document.querySelector(".single-shell");
    this.priceNode = document.querySelector('[data-role="single-price-chart"]');
    this.rsiNode = document.querySelector('[data-role="single-rsi-chart"]');
    this.resizeHandle = document.querySelector('[data-role="single-rsi-resize"]');
    this.tfNode = $("singleTfButtons");
    this.rsiRatio = this.savedRsiRatio();

    this.priceChart = LightweightCharts.createChart(this.priceNode, chartOptions("#10131b"));
    this.rsiChart = LightweightCharts.createChart(this.rsiNode, chartOptions("#10131b"));
    applyRsiChartScale(this.rsiChart);

    this.candleSeries = this.priceChart.addCandlestickSeries({
      upColor: "#4caf50",
      downColor: "#d7d7d7",
      borderUpColor: "#4caf50",
      borderDownColor: "#d7d7d7",
      wickUpColor: "#4caf50",
      wickDownColor: "#d7d7d7",
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.currentPriceSeries = this.priceChart.addLineSeries({
      color: "rgba(242,242,242,0.72)",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.baselineSeries = this.priceChart.addLineSeries({ color: "#ffff00", lineWidth: 2, title: "", lastValueVisible: false, priceLineVisible: false });
    this.slowBaselineSeries = this.priceChart.addLineSeries({ color: "#9c27b0", lineWidth: 2, title: "", lastValueVisible: false, priceLineVisible: false });
    this.vwapSeries = this.priceChart.addLineSeries({ color: "#f2f2f2", lineWidth: 2, title: "", lastValueVisible: false, priceLineVisible: false });
    this.rsiSeries = this.rsiChart.addLineSeries(rsiLineOptions({ color: "#f2f2f2", lineWidth: 2 }));
    this.rsiEmaSeries = this.rsiChart.addLineSeries(rsiLineOptions({ color: "#ff9800", lineWidth: 2 }));
    this.rsiWmaSeries = this.rsiChart.addLineSeries(rsiLineOptions({ color: "#ff3045", lineWidth: 2 }));
    this.rsi70 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.65)", lineWidth: 1, lineStyle: 2 }));
    this.rsi80 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.42)", lineWidth: 1, lineStyle: 2 }));
    this.rsi50 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(255,255,255,0.24)", lineWidth: 1, lineStyle: 2 }));
    this.rsi20 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(255,77,90,0.42)", lineWidth: 1, lineStyle: 2 }));
    this.rsi30 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(255,77,90,0.65)", lineWidth: 1, lineStyle: 2 }));

    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) this.rsiChart.timeScale().setVisibleLogicalRange(range);
    });
    this.renderTfButtons();
    this.initResizeHandle();
    requestAnimationFrame(() => this.resize());
  }

  savedRsiRatio() {
    const saved = Number(localStorage.getItem("singleRsiRatio"));
    return Number.isFinite(saved) ? Math.min(0.72, Math.max(0.18, saved)) : 0.30;
  }

  applyRsiRatio() {
    if (!this.shellNode || !this.priceNode || !this.rsiNode || !this.resizeHandle) return;

    const shellHeight = this.shellNode.clientHeight;
    const headHeight = this.shellNode.querySelector(".single-head")?.offsetHeight || 38;
    const handleHeight = this.resizeHandle.offsetHeight || 8;
    const available = Math.max(220, shellHeight - headHeight - handleHeight);
    const minRsi = Math.min(180, available * 0.42);
    const maxRsi = Math.max(minRsi, available * 0.72);
    const rsiHeight = Math.min(maxRsi, Math.max(minRsi, available * this.rsiRatio));
    const priceHeight = Math.max(120, available - rsiHeight);

    this.shellNode.style.gridTemplateRows = `${headHeight}px minmax(0, ${priceHeight}px) ${handleHeight}px minmax(0, ${rsiHeight}px)`;
  }

  initResizeHandle() {
    if (!this.resizeHandle) return;

    let startY = 0;
    let startRatio = this.rsiRatio;
    let available = 1;

    const onMove = (event) => {
      const pointerY = event.clientY ?? event.touches?.[0]?.clientY;
      if (!Number.isFinite(pointerY)) return;
      const deltaY = pointerY - startY;
      this.rsiRatio = Math.min(0.72, Math.max(0.18, startRatio - deltaY / available));
      localStorage.setItem("singleRsiRatio", String(this.rsiRatio));
      this.applyRsiRatio();
      this.resizeCharts();
    };

    const onUp = () => {
      this.resizeHandle.classList.remove("dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    this.resizeHandle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      startY = event.clientY;
      startRatio = this.rsiRatio;
      const headHeight = this.shellNode.querySelector(".single-head")?.offsetHeight || 38;
      const handleHeight = this.resizeHandle.offsetHeight || 8;
      available = Math.max(1, this.shellNode.clientHeight - headHeight - handleHeight);
      this.resizeHandle.classList.add("dragging");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  renderTfButtons() {
    this.tfNode.innerHTML = "";
    SINGLE_FRAMES.forEach((frame) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "single-tf-btn";
      button.dataset.tf = frame.key;
      button.textContent = frame.label;
      button.addEventListener("click", () => {
        if (this.config.key === frame.key) return;
        this.setConfig(frame.key);
      });
      this.tfNode.appendChild(button);
    });
    this.updateTfButtons();
  }

  updateTfButtons() {
    this.tfNode.querySelectorAll(".single-tf-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.tf === this.config.key);
    });
  }

  setConfig(key) {
    const nextConfig = SINGLE_FRAMES.find((frame) => frame.key === key);
    if (!nextConfig) return;
    this.config = nextConfig;
    localStorage.setItem("singleFrameTf", key);
    this.updateTfButtons();
    this.load(++singleSessionId).catch((err) => {
      console.error(err);
      setLiveStatus(false, "Cannot load single chart");
    });
  }

  resize() {
    this.applyRsiRatio();
    this.resizeCharts();
  }

  resizeCharts() {
    this.priceChart.applyOptions({
      width: this.priceNode.clientWidth,
      height: this.priceNode.clientHeight
    });
    this.rsiChart.applyOptions({
      width: this.rsiNode.clientWidth,
      height: this.rsiNode.clientHeight
    });
  }

  klineUrl() {
    return `${API}/api/v3/klines?symbol=${currentSymbol}&interval=${this.config.apiTf}&limit=${this.config.limit}`;
  }

  refreshCandles() {
    this.candles = aggregateCandles(this.rawCandles, this.config.aggregate);
  }

  focusLatest(bars = 140) {
    const total = this.candles.length;
    if (!total) return;

    const from = Math.max(total - bars, 0);
    const to = total + 4;
    this.priceChart.timeScale().setVisibleLogicalRange({ from, to });
    this.rsiChart.timeScale().setVisibleLogicalRange({ from, to });
  }

  async load(session) {
    closeSocket(this.ws);
    this.priceEl.textContent = "--";
    this.changeEl.textContent = "--%";
    this.changeEl.className = "";
    this.updateStrategyBadge({ tone: "wait", label: "WAIT", detail: "Loading RSI state" });

    const response = await fetch(this.klineUrl());
    if (!response.ok) throw new Error(`${this.config.label} HTTP ${response.status}`);

    const raw = await response.json();
    if (session !== singleSessionId) return;

    this.rawCandles = raw.map(toChartCandle);
    this.refreshCandles();
    this.draw(true);
    this.startWebSocket(session);
  }

  updateStrategyBadge(strategy) {
    if (!this.strategyEl || !this.strategyLabelEl || !this.strategyDetailEl) return;
    this.strategyEl.className = `single-strategy ${strategy.tone}`;
    this.strategyLabelEl.textContent = strategy.label;
    this.strategyDetailEl.textContent = strategy.detail;
  }

  draw(fit = false) {
    const candles = this.candles;
    if (!candles.length) return;

    const baseline = jmaFromClose(candles, params.baselineLength, 2, params.baselinePhase);
    const slowBaseline = jmaFromClose(candles, params.slowBaselineLength, 2, params.slowBaselinePhase);
    const vwapData = anchoredVwap(candles, "W");
    const barColors = crossSignals(candles, baseline, slowBaseline);
    const rsiData = rsi(candles, params.rsiLength);
    const rsiEmaData = emaFromValues(rsiData, params.rsiEmaLength);
    const rsiWmaData = wmaFromValues(rsiData, params.rsiWmaLength);
    const strategyCore = computeStrategyCurrentTfEvents(candles, rsiData, rsiEmaData, rsiWmaData);
    if (STRATEGY_PARITY_READY) mergeTradeHistory(currentSymbol, this.config.label, strategyCore.orders);
    const signalMarkers = strategyCore.markers;
    const latestEntry = STRATEGY_PARITY_READY ? strategyCore.orders.filter((order) => order.action === "entry").at(-1) : null;
    const rsiState = detectRsiState(rsiData, rsiEmaData, rsiWmaData, signalMarkers);
    const strategy = !STRATEGY_PARITY_READY
      ? {
          tone: "wait",
          label: "PENDING",
          detail: "Full v17 parity not loaded"
        }
      : strategyCore.status.positionSide
      ? {
          tone: strategyCore.status.positionSide === 1 ? "buy" : "sell",
          label: strategyCore.status.positionSide === 1 ? "LONG" : "SHORT",
          detail: strategyCore.status.lastEntryText
        }
      : latestEntry
        ? {
            tone: latestEntry.position === "belowBar" ? "buy" : "sell",
            label: latestEntry.position === "belowBar" ? "LONG" : "SHORT",
            detail: latestEntry.text
          }
        : singleStrategyFromSignal(rsiState, signalMarkers, rsiData, rsiEmaData, rsiWmaData);

    this.candleSeries.setData(candles.map((candle) => {
      const signalColor = barColors.get(candle.time);
      const bodyColor = signalColor || (candle.close >= candle.open ? "#4caf50" : "#d7d7d7");
      return {
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        color: bodyColor,
        borderColor: bodyColor,
        wickColor: bodyColor
      };
    }));
    this.candleSeries.setMarkers(STRATEGY_PARITY_READY && layerState.signals ? strategyCore.orders : []);
    this.currentPriceSeries.setData(currentPriceLineData(candles, this.config));
    this.baselineSeries.setData(layerState.baseline ? baseline : []);
    this.slowBaselineSeries.setData(layerState.slowBaseline ? slowBaseline : []);
    this.vwapSeries.setData(layerState.vwap ? vwapData : []);
    this.rsiSeries.setData(layerState.rsi ? rsiColorData(rsiData) : []);
    this.rsiEmaSeries.setData(layerState.rsiEma ? rsiEmaData : []);
    this.rsiWmaSeries.setData(layerState.rsiWma ? rsiWmaData : []);
    this.rsiSeries.setMarkers(layerState.signals ? signalMarkers : []);
    this.rsi70.setData(candles.map((c) => ({ time: c.time, value: 70 })));
    this.rsi80.setData(candles.map((c) => ({ time: c.time, value: RSI_HIGH_LEVEL })));
    this.rsi50.setData(candles.map((c) => ({ time: c.time, value: 50 })));
    this.rsi20.setData(candles.map((c) => ({ time: c.time, value: RSI_LOW_LEVEL })));
    this.rsi30.setData(candles.map((c) => ({ time: c.time, value: 30 })));

    const base = currentSymbol.replace("USDT", "");
    const last = candles[candles.length - 1];
    const change = last.close - last.open;
    const pct = last.open ? (change / last.open) * 100 : 0;
    this.symbolEl.textContent = `${base}/USDT`;
    this.priceEl.textContent = `$${fmt.format(last.close)}`;
    this.changeEl.textContent = `${change >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    this.changeEl.className = change >= 0 ? "up" : "down";
    this.updateStrategyBadge(strategy);

    if (fit) this.focusLatest();
  }

  startWebSocket(session) {
    const stream = `${currentSymbol.toLowerCase()}@kline_${this.config.wsTf}`;
    this.ws = new WebSocket(`${WS_BASE}/${stream}`);

    this.ws.onopen = () => {
      if (session === singleSessionId) setLiveStatus(true, `Live ${currentSymbol}`);
    };

    this.ws.onclose = () => {
      if (session !== singleSessionId) return;
      setTimeout(() => {
        if (session === singleSessionId) this.startWebSocket(session);
      }, 1500);
    };

    this.ws.onerror = () => {
      if (session !== singleSessionId) return;
      try { this.ws.close(); } catch (err) {}
    };

    this.ws.onmessage = (event) => {
      if (session !== singleSessionId) return;

      const msg = JSON.parse(event.data);
      const k = msg.k;
      const candle = {
        time: Math.floor(k.t / 1000),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v)
      };
      const last = this.rawCandles[this.rawCandles.length - 1];

      if (last && last.time === candle.time) {
        this.rawCandles[this.rawCandles.length - 1] = candle;
      } else {
        this.rawCandles.push(candle);
        while (this.rawCandles.length > this.config.limit) this.rawCandles.shift();
      }

      this.refreshCandles();
      this.draw(false);
    };
  }
}

function normalizeSymbol(value) {
  const cleaned = value.trim().toUpperCase().replace("/", "");
  if (!cleaned) return currentSymbol;
  return cleaned.endsWith("USDT") ? cleaned : `${cleaned}USDT`;
}

function updateSymbolTitle() {
  $("symbolInput").value = currentSymbol;
  const base = currentSymbol.replace("USDT", "");
  $("symbolTitle").textContent = `${base} / TetherUS`;
  document.title = `${base} Matrix`;
}

function startTickerWebSocket(session) {
  closeSocket(tickerWs);
  tickerWs = new WebSocket(`${WS_BASE}/${currentSymbol.toLowerCase()}@miniTicker`);

  tickerWs.onmessage = (event) => {
    if (session !== sessionId) return;
    const ticker = JSON.parse(event.data);
    const price = Number(ticker.c);
    document.title = `${fmt.format(price)} | ${$("symbolTitle").textContent}`;
  };

  tickerWs.onclose = () => {
    if (session !== sessionId) return;
    setTimeout(() => {
      if (session === sessionId) startTickerWebSocket(session);
    }, 1500);
  };
}

async function loadMarketMatrix() {
  const session = ++sessionId;
  closeSocket(tickerWs);
  panels.forEach((panel) => closeSocket(panel.ws));
  if (singlePanel) closeSocket(singlePanel.ws);

  updateSymbolTitle();
  updateOhlc(null);
  setLiveStatus(false, "Loading matrix...");

  try {
    await Promise.all([
      ...Array.from(panels.values()).map((panel) => panel.load(session)),
      singlePanel?.load(++singleSessionId)
    ]);
    if (session !== sessionId) return;
    startTickerWebSocket(session);
    setLiveStatus(true, `Live ${currentSymbol}`);
  } catch (err) {
    console.error(err);
    if (session !== sessionId) return;
    setLiveStatus(false, "Cannot load Binance data");
  }
}

function reloadCharts() {
  loadMarketMatrix();
}

function queryParams() {
  return new URLSearchParams(window.location.search);
}

function cleanStartupUrl() {
  const params = queryParams();
  if (!params.has("tf")) return;

  params.delete("tf");
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function initialSymbol() {
  const params = queryParams();
  return normalizeSymbol(params.get("sym") || params.get("symbol") || currentSymbol);
}

function normalizeTfKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["4h", "h4"].includes(normalized)) return "h4";
  if (["12h", "h12"].includes(normalized)) return "h12";
  if (["1d", "d1", "daily"].includes(normalized)) return "d1";
  if (["2d", "d2"].includes(normalized)) return "d2";
  return "";
}

function applyInitialTimeframeFocus() {
  const tfKey = normalizeTfKey(queryParams().get("tf"));
  if (!tfKey) return;

  const selectors = [`[data-frame="${tfKey}"]`, `[data-rsi-frame="${tfKey}"]`];
  selectors.forEach((selector) => {
    const activeCard = document.querySelector(selector);
    if (!activeCard) return;
    const parent = activeCard.parentElement;
    [...parent.children].forEach((card) => {
      const isActive = card === activeCard;
      card.style.order = isActive ? "-1" : "";
      card.classList.toggle("url-focused-frame", isActive);
    });
  });
}

function resizeAll() {
  panels.forEach((panel) => panel.resize());
  rsiOnlyPanels.forEach((panel) => panel.resize());
  singlePanel?.resize();
}

function redrawAll() {
  panels.forEach((panel) => panel.draw(false));
  singlePanel?.draw(false);
}

function renderRsiRules() {
  const stateGrid = $("rsiStateGrid");
  const ruleRows = $("rsiRuleRows");
  if (!stateGrid || !ruleRows) return;

  stateGrid.innerHTML = RSI_STATES.map((state, index) => `
    <article class="rsi-state">
      <b>${index + 1}. ${state.name}</b>
      <span>${state.description}</span>
    </article>
  `).join("");

  ruleRows.innerHTML = RSI_RULES.map(([parentState, childState, score, action], index) => `
    <tr data-parent-state="${parentState}" data-child-state="${childState}">
      <td>${index + 1}</td>
      <td>${parentState}</td>
      <td>${childState}</td>
      <td><b class="score score-${score >= 85 ? "high" : score >= 70 ? "mid" : "low"}">${score}</b></td>
      <td>${action}</td>
    </tr>
  `).join("");
  updateCurrentRule();
}

function findRsiRule(parentState, childState) {
  const index = RSI_RULES.findIndex(([parent, child]) => parent === parentState && child === childState);
  if (index < 0) return null;

  const [parent, child, score, action] = RSI_RULES[index];
  return { index, parent, child, score, action };
}

function strategyFromRule(rule) {
  const action = rule.action;
  const isLong = action.includes("Long") || action.includes("Buy");
  const isShort = action.includes("Short") || action.includes("Sell");
  const isWait = action.includes("Quan sát") || action.includes("Chờ") || action.includes("tránh") || action.includes("hạn chế");
  const isManage = action.includes("Gồng") || action.includes("Giữ") || action.includes("Quản lý") || action.includes("chốt");
  const isEntry = action.includes("Vào") || action.includes("Canh") || action.includes("thuận") || action.includes("theo");

  if (isWait) {
    return {
      tone: "wait",
      label: "WAIT",
      title: "Chưa có điểm vào sạch",
      reason: "Rule đang ưu tiên quan sát hoặc chờ khung con hoàn tất nhịp điều chỉnh.",
      checks: ["Không vào đuổi.", "Đợi H4 có signal 2/3 rõ hơn.", "Chỉ xử lý khi giá về vùng có quản trị rủi ro tốt."]
    };
  }

  if (isLong && isEntry && !isManage) {
    return {
      tone: "buy",
      label: "BUY / LONG",
      title: rule.score >= 80 ? "Ưu tiên canh Long" : "Long có điều kiện",
      reason: "Khung bố và khung con đang ủng hộ hướng lên theo bảng RSI.",
      checks: ["Ưu tiên vào khi H4 có buy 2/3 hoặc vừa pullback xong.", "Stop dưới đáy gần nhất của H4.", "Score càng gần 100 thì được phép tự tin hơn."]
    };
  }

  if (isShort && isEntry && !isManage) {
    return {
      tone: "sell",
      label: "SELL / SHORT",
      title: rule.score >= 80 ? "Ưu tiên canh Short" : "Short có điều kiện",
      reason: "Khung bố và khung con đang ủng hộ hướng xuống theo bảng RSI.",
      checks: ["Ưu tiên vào khi H4 có sell 2/3 hoặc hồi lên xong.", "Stop trên đỉnh gần nhất của H4.", "Score càng gần 100 thì tín hiệu càng thuận."]
    };
  }

  if (isLong) {
    return {
      tone: "hold-buy",
      label: "HOLD LONG",
      title: "Quản lý lệnh Long",
      reason: "Rule còn nghiêng về Long nhưng không phải điểm mua mới đẹp.",
      checks: ["Không mua đuổi nếu H4 đã đi xa.", "Dời stop hoặc chốt bớt khi RSI H4 cuộn lại.", "Chờ nhịp hồi mới nếu muốn bồi."]
    };
  }

  if (isShort) {
    return {
      tone: "hold-sell",
      label: "HOLD SHORT",
      title: "Quản lý lệnh Short",
      reason: "Rule còn nghiêng về Short nhưng không phải điểm bán mới đẹp.",
      checks: ["Không sell đuổi nếu H4 đã rơi xa.", "Dời stop hoặc chốt bớt khi RSI H4 cạn lực.", "Chờ nhịp hồi mới nếu muốn bồi."]
    };
  }

  return {
    tone: "wait",
    label: "WAIT",
    title: "Chờ xác nhận",
    reason: "Rule hiện tại chưa đủ rõ để ưu tiên Buy hoặc Sell.",
    checks: ["Đợi H4 có signal 2/3.", "Không vào khi RSI đang nhiễu quanh EMA/WMA.", "Giữ risk nhỏ nếu bắt buộc phải đánh."]
  };
}

function updateStrategyPanel(strategy) {
  const panel = $("strategyPanel");
  const labelEl = document.querySelector('[data-role="strategy-label"]');
  const titleEl = document.querySelector('[data-role="strategy-title"]');
  const reasonEl = document.querySelector('[data-role="strategy-reason"]');
  const checksEl = document.querySelector('[data-role="strategy-checks"]');
  if (!panel || !labelEl || !titleEl || !reasonEl || !checksEl) return;

  panel.className = `strategy-panel ${strategy.tone}`;
  labelEl.textContent = strategy.label;
  titleEl.textContent = strategy.title;
  reasonEl.textContent = strategy.reason;
  checksEl.innerHTML = strategy.checks.map((item) => `<span>${item}</span>`).join("");
}

function loadManualRuleConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(MANUAL_RULE_STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.frames) || !Array.isArray(saved.states)) return;

    manualRuleConfig = {
      frames: [0, 1, 2].map((index) => MANUAL_TIMEFRAMES.includes(saved.frames[index]) ? saved.frames[index] : DEFAULT_MANUAL_RULE_CONFIG.frames[index]),
      states: [0, 1, 2].map((index) => RSI_STATES.some((state) => state.name === saved.states[index]) ? saved.states[index] : DEFAULT_MANUAL_RULE_CONFIG.states[index])
    };
  } catch (err) {
    manualRuleConfig = { ...DEFAULT_MANUAL_RULE_CONFIG, frames: DEFAULT_MANUAL_RULE_CONFIG.frames.slice(), states: DEFAULT_MANUAL_RULE_CONFIG.states.slice() };
  }
}

function saveManualRuleConfig() {
  localStorage.setItem(MANUAL_RULE_STORAGE_KEY, JSON.stringify(manualRuleConfig));
}

function loadTwoRuleConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(TWO_RULE_STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.frames) || !Array.isArray(saved.states)) return;

    twoRuleConfig = {
      frames: [0, 1].map((index) => MANUAL_TIMEFRAMES.includes(saved.frames[index]) ? saved.frames[index] : DEFAULT_TWO_RULE_CONFIG.frames[index]),
      states: [0, 1].map((index) => RSI_STATES.some((state) => state.name === saved.states[index]) ? saved.states[index] : DEFAULT_TWO_RULE_CONFIG.states[index])
    };
  } catch (err) {
    twoRuleConfig = { ...DEFAULT_TWO_RULE_CONFIG, frames: DEFAULT_TWO_RULE_CONFIG.frames.slice(), states: DEFAULT_TWO_RULE_CONFIG.states.slice() };
  }
}

function saveTwoRuleConfig() {
  localStorage.setItem(TWO_RULE_STORAGE_KEY, JSON.stringify(twoRuleConfig));
}

function optionHtml(values, selected) {
  return values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function renderTwoRuleControls() {
  loadTwoRuleConfig();
  document.querySelectorAll('[data-role="two-frame"]').forEach((select) => {
    const index = Number(select.dataset.index);
    select.innerHTML = optionHtml(MANUAL_TIMEFRAMES, twoRuleConfig.frames[index]);
    select.onchange = () => {
      twoRuleConfig.frames[index] = select.value;
      saveTwoRuleConfig();
      updateCurrentRule();
    };
  });

  document.querySelectorAll('[data-role="two-state"]').forEach((select) => {
    const index = Number(select.dataset.index);
    select.innerHTML = optionHtml(RSI_STATES.map((state) => state.name), twoRuleConfig.states[index]);
    select.onchange = () => {
      twoRuleConfig.states[index] = select.value;
      saveTwoRuleConfig();
      updateCurrentRule();
    };
  });

  const resetButton = $("resetTwoManualRules");
  if (resetButton) resetButton.onclick = () => {
    twoRuleConfig = { ...DEFAULT_TWO_RULE_CONFIG, frames: DEFAULT_TWO_RULE_CONFIG.frames.slice(), states: DEFAULT_TWO_RULE_CONFIG.states.slice() };
    saveTwoRuleConfig();
    renderTwoRuleControls();
    updateCurrentRule();
  };

  updateCurrentRule();
}

function renderManualRuleControls() {
  loadManualRuleConfig();
  document.querySelectorAll('[data-role="manual-frame"]').forEach((select) => {
    const index = Number(select.dataset.index);
    select.innerHTML = optionHtml(MANUAL_TIMEFRAMES, manualRuleConfig.frames[index]);
    select.onchange = () => {
      manualRuleConfig.frames[index] = select.value;
      saveManualRuleConfig();
      updateManualStrategy();
    };
  });

  document.querySelectorAll('[data-role="manual-state"]').forEach((select) => {
    const index = Number(select.dataset.index);
    select.innerHTML = optionHtml(RSI_STATES.map((state) => state.name), manualRuleConfig.states[index]);
    select.onchange = () => {
      manualRuleConfig.states[index] = select.value;
      saveManualRuleConfig();
      updateManualStrategy();
    };
  });

  const resetButton = $("resetManualRules");
  if (resetButton) resetButton.onclick = () => {
    manualRuleConfig = { ...DEFAULT_MANUAL_RULE_CONFIG, frames: DEFAULT_MANUAL_RULE_CONFIG.frames.slice(), states: DEFAULT_MANUAL_RULE_CONFIG.states.slice() };
    saveManualRuleConfig();
    renderManualRuleControls();
    updateManualStrategy();
  };

  updateManualStrategy();
}

function renderThreeFrameCases() {
  const rowsNode = $("threeFrameRows");
  if (!rowsNode) return;

  const stateNames = RSI_STATES.map((state) => state.name);
  const rows = [];
  stateNames.forEach((topState) => {
    stateNames.forEach((midState) => {
      stateNames.forEach((lowState) => {
        const topRule = findRsiRule(topState, midState);
        const triggerRule = findRsiRule(midState, lowState);
        const strategy = combineManualStrategies(topRule, triggerRule);
        rows.push({ topState, midState, lowState, topRule, triggerRule, strategy });
      });
    });
  });

  rowsNode.innerHTML = rows.map((row, index) => `
    <tr data-top-state="${row.topState}" data-mid-state="${row.midState}" data-low-state="${row.lowState}">
      <td>${index + 1}</td>
      <td>${row.topState}</td>
      <td>${row.midState}</td>
      <td>${row.lowState}</td>
      <td>#${row.topRule.index + 1} / ${row.topRule.score}</td>
      <td>#${row.triggerRule.index + 1} / ${row.triggerRule.score}</td>
      <td><b class="case-signal case-${row.strategy.tone}">${row.strategy.label}</b></td>
      <td>${row.strategy.title}</td>
    </tr>
  `).join("");
  highlightThreeFrameCase();
}

function strategySide(strategy) {
  if (["buy", "hold-buy"].includes(strategy.tone)) return "long";
  if (["sell", "hold-sell"].includes(strategy.tone)) return "short";
  return "wait";
}

function combineManualStrategies(topRule, triggerRule) {
  const topStrategy = strategyFromRule(topRule);
  const triggerStrategy = strategyFromRule(triggerRule);
  const topSide = strategySide(topStrategy);
  const triggerSide = strategySide(triggerStrategy);

  if (topSide === "wait" || triggerSide === "wait") {
    return {
      tone: "wait",
      label: "WAIT",
      title: "Chưa đủ đồng thuận 3 khung",
      reason: "Một trong hai lớp rule đang yêu cầu quan sát, nên chưa có điểm vào sạch."
    };
  }

  if (topSide !== triggerSide) {
    return {
      tone: "wait",
      label: "WAIT",
      title: "Hai lớp rule đang lệch pha",
      reason: "Khung lớn→giữa và giữa→nhỏ chưa cùng hướng, ưu tiên đứng ngoài."
    };
  }

  if (triggerStrategy.tone === "buy") {
    return {
      tone: "buy",
      label: "BUY / LONG",
      title: "Được phép canh Long",
      reason: "Khung lớn ủng hộ hướng Long và khung nhỏ đang cho điểm kích hoạt."
    };
  }

  if (triggerStrategy.tone === "sell") {
    return {
      tone: "sell",
      label: "SELL / SHORT",
      title: "Được phép canh Short",
      reason: "Khung lớn ủng hộ hướng Short và khung nhỏ đang cho điểm kích hoạt."
    };
  }

  return topSide === "long"
    ? {
        tone: "hold-buy",
        label: "HOLD LONG",
        title: "Nghiêng Long nhưng chờ điểm đẹp",
        reason: "Ba khung không xung đột, nhưng khung nhỏ chưa cho điểm Buy mới."
      }
    : {
        tone: "hold-sell",
        label: "HOLD SHORT",
        title: "Nghiêng Short nhưng chờ điểm đẹp",
        reason: "Ba khung không xung đột, nhưng khung nhỏ chưa cho điểm Sell mới."
      };
}

function updateManualStrategy() {
  const [topFrame, midFrame, lowFrame] = manualRuleConfig.frames;
  const [topState, midState, lowState] = manualRuleConfig.states;
  const topRule = findRsiRule(topState, midState);
  const triggerRule = findRsiRule(midState, lowState);
  if (!topRule || !triggerRule) return;

  const strategy = combineManualStrategies(topRule, triggerRule);
  const panel = $("manualResult");
  const labelEl = document.querySelector('[data-role="manual-strategy-label"]');
  const titleEl = document.querySelector('[data-role="manual-strategy-title"]');
  const reasonEl = document.querySelector('[data-role="manual-strategy-reason"]');
  const topPairEl = document.querySelector('[data-role="manual-top-pair"]');
  const triggerPairEl = document.querySelector('[data-role="manual-trigger-pair"]');
  if (!panel || !labelEl || !titleEl || !reasonEl || !topPairEl || !triggerPairEl) return;

  panel.className = `manual-result ${strategy.tone}`;
  labelEl.textContent = strategy.label;
  titleEl.textContent = strategy.title;
  reasonEl.textContent = strategy.reason;
  topPairEl.textContent = `${topFrame} → ${midFrame}: #${topRule.index + 1} / ${topRule.score} điểm`;
  triggerPairEl.textContent = `${midFrame} → ${lowFrame}: #${triggerRule.index + 1} / ${triggerRule.score} điểm`;
  highlightThreeFrameCase();
}

function highlightThreeFrameCase() {
  const [topState, midState, lowState] = manualRuleConfig.states;
  document.querySelectorAll("#threeFrameRows tr").forEach((row) => row.classList.remove("active-three-case"));
  const activeRow = document.querySelector(`#threeFrameRows tr[data-top-state="${topState}"][data-mid-state="${midState}"][data-low-state="${lowState}"]`);
  activeRow?.classList.add("active-three-case");
}

function setRuleMode(mode, persist = true) {
  const nextMode = mode === "three" ? "three" : "two";
  document.querySelector(".rules-shell")?.setAttribute("data-rule-mode", nextMode);
  document.querySelectorAll(".rule-mode-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.ruleMode === nextMode);
  });
  if (persist) localStorage.setItem("rsiRuleMode", nextMode);
}

function bindRuleModeTabs() {
  document.querySelectorAll(".rule-mode-tab").forEach((button) => {
    button.addEventListener("click", () => setRuleMode(button.dataset.ruleMode));
  });
  setRuleMode(localStorage.getItem("rsiRuleMode") || "two", false);
}

function updateCurrentRule() {
  const [parentFrame, childFrame] = twoRuleConfig.frames;
  const [parentState, childState] = twoRuleConfig.states;
  const parent = { state: parentState };
  const child = { state: childState };
  const parentEl = document.querySelector('[data-role="parent-state"]');
  const childEl = document.querySelector('[data-role="child-state"]');
  const parentLabelEl = document.querySelector('[data-role="two-parent-label"]');
  const childLabelEl = document.querySelector('[data-role="two-child-label"]');
  const numberEl = document.querySelector('[data-role="rule-number"]');
  const scoreEl = document.querySelector('[data-role="rule-score"]');
  const actionEl = document.querySelector('[data-role="rule-action"]');

  document.querySelectorAll("#rsiRuleRows tr").forEach((row) => row.classList.remove("active-rule"));
  if (!parentEl || !childEl || !numberEl || !scoreEl || !actionEl) return;

  if (parentLabelEl) parentLabelEl.textContent = `Khung bo ${parentFrame}`;
  if (childLabelEl) childLabelEl.textContent = `Khung con ${childFrame}`;
  parentEl.textContent = parent.state;
  childEl.textContent = child.state;

  if (!parent || !child) {
    numberEl.textContent = "--";
    scoreEl.textContent = "Điểm --";
    scoreEl.className = "";
    actionEl.textContent = "Chờ đủ dữ liệu RSI H12 và H4.";
    updateStrategyPanel({
      tone: "wait",
      label: "WAIT",
      title: "Chờ đủ dữ liệu",
      reason: "App sẽ dùng H12 làm khung bố và H4 làm khung con để lọc tín hiệu.",
      checks: ["Đợi H12 và H4 tải xong.", "Sau đó xem Strategy để biết Buy/Sell/Hold/Wait.", "Không dùng tín hiệu khi dữ liệu chưa đủ."]
    });
    return;
  }

  const rule = findRsiRule(parent.state, child.state);
  if (!rule) return;

  numberEl.textContent = `#${rule.index + 1}`;
  scoreEl.textContent = `Điểm ${rule.score}`;
  scoreEl.className = `score-tag score-${rule.score >= 85 ? "high" : rule.score >= 70 ? "mid" : "low"}`;
  actionEl.textContent = rule.action;
  updateStrategyPanel(strategyFromRule(rule));

  const activeRow = document.querySelector(`#rsiRuleRows tr[data-parent-state="${rule.parent}"][data-child-state="${rule.child}"]`);
  activeRow?.classList.add("active-rule");
}

function setActiveView(view, persist = true) {
  const nextView = ["chart", "single", "trades", "rsi", "rules"].includes(view) ? view : "chart";
  document.body.classList.toggle("rsi-view-active", nextView === "rsi");
  document.body.classList.toggle("single-view-active", nextView === "single");
  document.querySelectorAll(".view-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === nextView));
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${nextView}View`));
  if (persist) localStorage.setItem("marketMatrixView", nextView);
  requestAnimationFrame(resizeAll);
}

function initialView() {
  const params = queryParams();
  return params.get("view") || localStorage.getItem("marketMatrixView") || "chart";
}

function startClock() {
  setInterval(() => {
    const nowUtcSeconds = Math.floor(Date.now() / 1000);
    $("clock").textContent = `UTC+7 ${formatChartTime(nowUtcSeconds).split(" ")[1]}`;
  }, 1000);
}

function boot() {
  cleanStartupUrl();
  loadParams();
  currentSymbol = initialSymbol();
  updateSymbolTitle();
  applyInitialTimeframeFocus();

  FRAMES.forEach((config) => {
    rsiOnlyPanels.set(config.key, new RsiOnlyPanel(config));
    panels.set(config.key, new MarketPanel(config));
  });
  singlePanel = new SingleFramePanel();

  const resizeObserver = new ResizeObserver(resizeAll);
  document.querySelectorAll(".price-chart, .rsi-only-chart, .single-price-chart, .single-rsi-chart").forEach((node) => resizeObserver.observe(node));
  window.addEventListener("resize", resizeAll);

  $("symbolForm").addEventListener("submit", (event) => {
    event.preventDefault();
    currentSymbol = normalizeSymbol($("symbolInput").value);
    loadMarketMatrix();
  });

  $("reloadCharts").addEventListener("click", reloadCharts);
  $("toggleControls").addEventListener("click", () => {
    $("controlsPanel").classList.toggle("open");
    requestAnimationFrame(resizeAll);
  });

  syncParamInputs();
  bindControls();
  renderRsiRules();
  renderTwoRuleControls();
  renderManualRuleControls();
  renderThreeFrameCases();
  bindRuleModeTabs();
  renderTradeHistory();

  const clearTradeHistory = $("clearTradeHistory");
  if (clearTradeHistory) {
    clearTradeHistory.addEventListener("click", () => {
      saveTradeHistory([]);
      renderTradeHistory();
    });
  }

  document.querySelectorAll(".view-tab").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.view);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadMarketMatrix();
  });

  startClock();
  resizeAll();
  setActiveView(initialView(), false);
  loadMarketMatrix();
}

boot();

