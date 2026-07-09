const API = "https://api.binance.com";
const WS_BASE = "wss://stream.binance.com:9443/ws";
const TIMEZONE_OFFSET_SECONDS = 7 * 60 * 60;
const STRATEGY_HISTORY_START_MS = Date.UTC(2021, 0, 1);
const BINANCE_KLINE_LIMIT = 1000;
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
  orders: true,
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
const TRADE_HISTORY_STORAGE_KEY = "singleTradeHistoryDraftV2";
const TRADE_HISTORY_LIMIT = 600;
const STRATEGY_PARITY_READY = false;
const SHOW_DRAFT_STRATEGY_ORDERS = true;
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

function strategyOrderDisplayMarkers(orders) {
  return orders.map((order) => {
    const isStop = order.text === "SL";
    const text = order.action === "entry"
      ? "IN"
      : isStop ? "SL" : "OUT";
    const isLongEntry = order.action === "entry" && order.position === "belowBar";
    const isShortEntry = order.action === "entry" && order.position === "aboveBar";
    const isExit = order.action === "exit";
    return {
      ...order,
      originalText: order.text,
      text,
      size: 4,
      color: isExit ? isStop ? "#ff3b4f" : "#ff4fd8" : isLongEntry ? "#2f5cff" : isShortEntry ? "#d600ff" : order.color
    };
  });
}

function snapMarkersToCandles(markers, candles) {
  if (!markers.length || !candles.length) return [];
  const exactTimes = new Set(candles.map((candle) => candle.time));
  const times = candles.map((candle) => candle.time);
  return markers.map((marker) => {
    if (exactTimes.has(marker.time)) return marker;
    let left = 0;
    let right = times.length - 1;
    let snapped = times[0];
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (times[mid] <= marker.time) {
        snapped = times[mid];
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return { ...marker, originalTime: marker.time, time: snapped };
  });
}

function buildClosedTradesFromOrders(orders) {
  const trades = [];
  let open = null;

  orders.forEach((order) => {
    const qty = Number(order.qty);
    const price = Number(order.price);
    const commission = Number(order.commission) || 0;
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) return;

    if (order.action === "entry") {
      const side = order.position === "belowBar" ? 1 : -1;
      if (!open || open.side !== side) {
        open = {
          side,
          qty: 0,
          avgEntryPrice: 0,
          entryTime: order.time,
          entryText: order.text || "",
          entryDetail: order.detail || "",
          entryCommission: 0,
          entryOrders: []
        };
      }

      const nextQty = open.qty + qty;
      open.avgEntryPrice = open.qty > 0 ? (open.avgEntryPrice * open.qty + price * qty) / nextQty : price;
      open.qty = nextQty;
      open.entryCommission += commission;
      open.entryOrders.push({
        time: order.time,
        text: order.text,
        price,
        qty,
        commission,
        detail: order.detail
      });
      return;
    }

    if (order.action === "exit" && open) {
      const grossPnl = open.side === 1 ? (price - open.avgEntryPrice) * open.qty : (open.avgEntryPrice - price) * open.qty;
      const totalCommission = open.entryCommission + commission;
      const netPnl = grossPnl - totalCommission;
      const entryNotional = open.avgEntryPrice * open.qty;
      trades.push({
        tradeNumber: trades.length + 1,
        side: open.side === 1 ? "long" : "short",
        entryTime: open.entryTime,
        exitTime: order.time,
        entryPrice: open.avgEntryPrice,
        exitPrice: price,
        qty: open.qty,
        entryText: open.entryText,
        exitText: order.text || "",
        entryDetail: open.entryDetail,
        exitDetail: order.detail || "",
        entryCommission: open.entryCommission,
        exitCommission: commission,
        totalCommission,
        grossPnl,
        netPnl,
        returnPct: entryNotional > 0 ? netPnl / entryNotional * 100 : null,
        equityAfterExit: order.equity,
        entryOrders: open.entryOrders
      });
      open = null;
    }
  });

  return {
    closed: trades,
    open
  };
}

function buildClosedTradeLegsFromOrders(orders) {
  const closed = [];
  const openLegs = [];

  orders.forEach((order) => {
    const qty = Number(order.qty);
    const price = Number(order.price);
    const commission = Number(order.commission) || 0;
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) return;

    if (order.action === "entry") {
      const side = order.position === "belowBar" ? 1 : -1;
      openLegs.push({
        side,
        qty,
        entryTime: order.time,
        entryPrice: price,
        entryText: order.text || "",
        entryDetail: order.detail || "",
        entryCommission: commission
      });
      return;
    }

    if (order.action !== "exit") return;
    const exitSide = order.position === "aboveBar" ? 1 : -1;
    let remainingExitQty = qty;

    for (let index = 0; index < openLegs.length && remainingExitQty > 1e-10; index += 1) {
      const leg = openLegs[index];
      if (!leg || leg.side !== exitSide || leg.qty <= 1e-10) continue;

      const closeQty = Math.min(leg.qty, remainingExitQty);
      const entryCommission = leg.entryCommission * (closeQty / leg.qty);
      const exitCommission = commission * (closeQty / qty);
      const grossPnl = leg.side === 1 ? (price - leg.entryPrice) * closeQty : (leg.entryPrice - price) * closeQty;
      const netPnl = grossPnl - entryCommission - exitCommission;
      const entryNotional = leg.entryPrice * closeQty;

      closed.push({
        tradeNumber: closed.length + 1,
        side: leg.side === 1 ? "long" : "short",
        entryTime: leg.entryTime,
        exitTime: order.time,
        entryPrice: leg.entryPrice,
        exitPrice: price,
        qty: closeQty,
        entryText: leg.entryText,
        exitText: order.text || "",
        entryDetail: leg.entryDetail,
        exitDetail: order.detail || "",
        entryCommission,
        exitCommission,
        totalCommission: entryCommission + exitCommission,
        grossPnl,
        netPnl,
        returnPct: entryNotional > 0 ? netPnl / entryNotional * 100 : null,
        equityAfterExit: order.equity
      });

      leg.qty -= closeQty;
      leg.entryCommission -= entryCommission;
      remainingExitQty -= closeQty;
    }

    for (let index = openLegs.length - 1; index >= 0; index -= 1) {
      if (openLegs[index].qty <= 1e-10) openLegs.splice(index, 1);
    }
  });

  return { closed, open: openLegs };
}

function withTemporaryStrategyOptions({ inputs = {}, config = {} }, callback) {
  const savedInputs = {};
  const savedConfig = {};
  Object.entries(inputs).forEach(([key, value]) => {
    savedInputs[key] = STRATEGY_INPUTS[key];
    STRATEGY_INPUTS[key] = value;
  });
  Object.entries(config).forEach(([key, value]) => {
    savedConfig[key] = STRATEGY_CONFIG[key];
    STRATEGY_CONFIG[key] = value;
  });

  try {
    return callback();
  } finally {
    Object.entries(savedInputs).forEach(([key, value]) => {
      STRATEGY_INPUTS[key] = value;
    });
    Object.entries(savedConfig).forEach(([key, value]) => {
      STRATEGY_CONFIG[key] = value;
    });
  }
}

function strategyExperimentSummary(label, orders) {
  const legs = buildClosedTradeLegsFromOrders(orders);
  const from = Date.UTC(2026, 4, 8) / 1000;
  const to = Date.UTC(2026, 5, 28) / 1000;
  return {
    label,
    orderCount: orders.length,
    legClosed: legs.closed.length,
    open: legs.open,
    tail: legs.closed.slice(-12),
    mayJuneOrders: orders.filter((order) => order.time >= from && order.time <= to)
  };
}

function buildStrategyDebugExperiments(parityCandles) {
  const shiftedD2 = aggregateCandlesByTime(
    parityCandles.d1.map((candle) => ({ ...candle, time: candle.time - 24 * 60 * 60 })),
    2,
    24 * 60 * 60
  ).map((candle) => ({ ...candle, time: candle.time + 24 * 60 * 60 }));
  const variants = [
    ["baseline", {}, parityCandles.d2],
    ["d2Shift1d", {}, shiftedD2],
    ["entrySwingOff", { inputs: { enableH4SwingTrail: false } }, parityCandles.d2],
    ["softProbeOff", { config: { allowSoftLowQualityProbe: false } }, parityCandles.d2],
    ["directIoff", { config: { allowDirectITriggers: false } }, parityCandles.d2],
    ["strictFormOn", { config: { requireStrictFormSequence: true } }, parityCandles.d2],
    ["earlyD2OverrideOff", { inputs: { allowH4EarlyD2Override: false } }, parityCandles.d2]
  ];

  return variants.map(([label, options, d2Candles]) => withTemporaryStrategyOptions(options, () => {
    const core = computeV17ParityEvents(parityCandles.h4, parityCandles.h12, parityCandles.d1, d2Candles);
    return strategyExperimentSummary(label, core.orders);
  }));
}

function displayD2Regime(value) {
  if (value === "D2_SUPPORT") return "SUPPORT";
  if (value === "D2_NEUTRAL") return "NEUTRAL";
  if (value === "D2_OPPOSE") return "OPPOSE";
  if (value === "D2_TRAP") return "TRAP";
  return value || "-";
}

function displayMtfState(value) {
  return String(value || "-").replace(/^MTF_/, "");
}

function displayActionText(value) {
  const map = {
    "NO-TRADE": "NO_ACTION",
    "PARTIAL ONLY": "ENTRY_PARTIAL",
    "FULL ENTRY": "ENTRY_FULL",
    ADD_OK: "ADD_BOI",
    TREND_HOLD: "HOLD_THESIS",
    PULLBACK: "HOLD_PULLBACK",
    H4_D2_GATE: "D2_GATE",
    LOCK_WAIT: "BLOCK_STOP_UNLOCKED",
    PYRAMID_WAIT: "BLOCK_PYRAMID",
    CAP_WAIT: "BLOCK_CAP_USAGE",
    ZERO_QTY: "BLOCK_ZERO_QTY",
    TRAP_WAIT: "BLOCK_TRAP",
    HTF_STRETCHED_WAIT: "BLOCK_H12_READY",
    H4_NOISE_WAIT: "BLOCK_H4_NOISE",
    WAIT_REENTRY: "BLOCK_REENTRY",
    HTF_DUPLICATE: "BLOCK_DUP_H12",
    THESIS_REBUILD_WAIT: "BLOCK_POST_BREAK",
    LOW_QUALITY: "BLOCK_LOW_QUALITY",
    SOFT_LOW_QUALITY: "ENTRY_SOFT",
    INVALID_SL: "BLOCK_INVALID_SL",
    INVALID_SL_FILL: "BLOCK_INVALID_SL",
    NON_CONSENSUS_EXIT: "EXIT_NON_CONS",
    NON_CONS_MONITOR: "THESIS_BREAK_WARN",
    H4_WARNING: "H4_COUNTER_WARN"
  };
  return map[value] || value || "-";
}

function displayTriggerText(value) {
  if (value === "none") return "NONE";
  if (value === "H4/H12 conflict") return "H4_H12_CONFLICT";
  return value || "-";
}

function parityTone(value) {
  const text = String(value || "");
  if (/BUY|LONG|SUPPORT|ENTRY|FULL|yes/.test(text)) return "buy";
  if (/SELL|SHORT|TRAP|CONFLICT|INVALID|EXIT|OPPOSE/.test(text)) return "bad";
  if (/WARN|WAIT|BLOCK|PARTIAL|PROBE|NEUTRAL|NO_ACTION|NO_TRIGGER|D2_GATE|LOCK/.test(text)) return "warn";
  return "muted";
}

function d2BackgroundData(statusHistory) {
  if (!STRATEGY_INPUTS.showBackground) return [];
  return statusHistory.map((status) => ({
    time: status.time,
    value: status.d2Bias === 1 || status.d2Bias === -1 ? 100 : 0,
    color: status.d2Bias === 1 ? "rgba(76,175,80,0.10)" : status.d2Bias === -1 ? "rgba(255,77,90,0.12)" : "rgba(0,0,0,0)"
  }));
}

function shouldShowStopPlots() {
  return STRATEGY_INPUTS.showStopPlots || queryParams().get("showStopPlots") === "1";
}

function stopPlotData(statusHistory, side) {
  if (!shouldShowStopPlots()) return [];
  return statusHistory
    .filter((status) => status.positionSide === side && Number.isFinite(status.positionActiveStop))
    .map((status) => ({ time: status.time, value: status.positionActiveStop }));
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
  const side = order.position === "belowBar" ? order.action === "entry" ? "Long" : "Short" : order.action === "entry" ? "Short" : "Long";
  const qty = Number.isFinite(order.qty) ? order.qty : null;
  return {
    key,
    time: order.time,
    timeLabel: formatChartTime(order.time),
    symbol,
    timeframe,
    side,
    type: tradeTypeLabel(order),
    tag: order.text || "--",
    price: Number.isFinite(order.price) ? order.price : null,
    priceLabel: formatTradePrice(order.price),
    qty,
    qtyLabel: qty == null ? "--" : qty.toFixed(4).replace(/0+$/, "").replace(/\.$/, ""),
    commission: Number.isFinite(order.commission) ? order.commission : null,
    equity: Number.isFinite(order.equity) ? order.equity : null,
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
          <td>${escapeHtml(item.side || "--")}</td>
          <td><span class="trade-type ${tone}">${escapeHtml(item.type)}</span></td>
          <td><b class="trade-tag">${escapeHtml(item.tag)}</b></td>
          <td>${escapeHtml(item.priceLabel)}</td>
          <td>${escapeHtml(item.qtyLabel || "--")}</td>
          <td>${escapeHtml(item.detail)}</td>
        </tr>
      `;
      }).join("")
    : `<tr><td class="trade-empty" colspan="10">No saved Single strategy orders yet.</td></tr>`;

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

  const existing = loadTradeHistory().filter((item) => item.symbol !== symbol || item.timeframe !== timeframe);
  const byKey = new Map(existing.map((item) => [item.key, item]));
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

function intervalToMs(interval) {
  const match = String(interval || "").match(/^(\d+)([mhdwM])$/);
  if (!match) return 4 * 60 * 60 * 1000;

  const value = Number(match[1]);
  const unit = match[2];
  const baseMs = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000
  }[unit];

  return value * baseMs;
}

async function fetchKlines(interval, { limit = BINANCE_KLINE_LIMIT, startTime = null, endTime = null } = {}) {
  const params = new URLSearchParams({
    symbol: currentSymbol,
    interval,
    limit: String(limit)
  });
  if (startTime != null) params.set("startTime", String(startTime));
  if (endTime != null) params.set("endTime", String(endTime));

  const response = await fetch(`${API}/api/v3/klines?${params.toString()}`);
  if (!response.ok) throw new Error(`${interval} klines HTTP ${response.status}`);
  return response.json();
}

async function fetchKlinesSince(interval, startTime, endTime = Date.now()) {
  const result = [];
  const stepMs = intervalToMs(interval);
  let nextStart = startTime;

  while (nextStart <= endTime) {
    const chunk = await fetchKlines(interval, {
      limit: BINANCE_KLINE_LIMIT,
      startTime: nextStart,
      endTime
    });
    if (!chunk.length) break;

    result.push(...chunk);
    const lastOpenTime = chunk[chunk.length - 1][0];
    const advancedStart = lastOpenTime + stepMs;
    if (advancedStart <= nextStart || chunk.length < BINANCE_KLINE_LIMIT) break;
    nextStart = advancedStart;
  }

  return result;
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

function aggregateCandlesByTime(source, groupSize, baseSeconds) {
  if (groupSize <= 1) return source.slice();
  const bucketSeconds = baseSeconds * groupSize;
  const buckets = new Map();

  source.forEach((candle) => {
    const bucketStart = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        time: bucketStart,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      });
      return;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  });

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
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

  values.forEach((point) => {
    if (previous === null) {
      previous = point.value;
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
  h4MidZoneLow: 40,
  h4MidZoneHigh: 60,
  h4MidNoiseLookback: 8,
  h4MidNoiseMinBars: 5,
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

const STRATEGY_INPUTS = {
  partialRiskPct: 1.0,
  fullRiskPct: 2.0,
  maxLeverage: 1.0,
  capitalUsageCapPct: 50.0,
  commissionPct: 0.02,
  slippageTicks: 2,
  priceTick: 0.01,
  enableH4SwingTrail: true,
  h4SwingPivotBars: 50,
  h4SwingTrailPivotBars: 5,
  h4FormTrailLookback: 11,
  h4SwingSlBuffer: 500,
  h4SwingTrailAfterOneR: true,
  enableBreakEvenAtTwoR: false,
  breakEvenRMultiple: 2.0,
  enableWeeklyVwapTrail: false,
  flatCooldownBars: 1,
  nonConsensusCooldownBars: 3,
  requireFreshTriggerAfterNonConsensus: true,
  htfReadinessLookback: 12,
  mtfMode: "context",
  allowH4EarlyD2Override: true,
  useStructureConfirmedH4SwingTrail: true,
  executeOnlyOnH4Close: true,
  allowRealtimeCurrentTfEntries: true,
  enableProgressiveHold: true,
  allowPromotionScaleIn: false,
  allowContinuationAddAfterBE: true,
  maxContinuationAddsPerThesis: 1,
  thesisBreakConfirmBars: 2,
  allowRiskRecycleAdd: true,
  showSignalLabels: true,
  showWmaWarnings: true,
  showSemanticDebug: false,
  showSemanticTransitionMarkers: false,
  showBackground: true,
  showStopPlots: false
};

const STRATEGY_URL_OVERRIDES = {
  partialRiskPct: { target: STRATEGY_INPUTS, type: "number", min: 0.1, max: 50 },
  fullRiskPct: { target: STRATEGY_INPUTS, type: "number", min: 0.1, max: 50 },
  maxLeverage: { target: STRATEGY_INPUTS, type: "number", min: 0.1, max: 5 },
  capitalUsageCapPct: { target: STRATEGY_INPUTS, type: "number", min: 10, max: 100 },
  enableH4SwingTrail: { target: STRATEGY_INPUTS, type: "bool" },
  h4SwingPivotBars: { target: STRATEGY_INPUTS, type: "int", min: 1, max: 100 },
  h4SwingTrailPivotBars: { target: STRATEGY_INPUTS, type: "int", min: 1, max: 100 },
  h4FormTrailLookback: { target: STRATEGY_INPUTS, type: "int", min: 1, max: 100 },
  h4SwingSlBuffer: { target: STRATEGY_INPUTS, type: "number", min: 0, max: 10000 },
  h4SwingTrailAfterOneR: { target: STRATEGY_INPUTS, type: "bool" },
  enableBreakEvenAtTwoR: { target: STRATEGY_INPUTS, type: "bool" },
  breakEvenRMultiple: { target: STRATEGY_INPUTS, type: "number", min: 0.5, max: 10 },
  flatCooldownBars: { target: STRATEGY_INPUTS, type: "int", min: 0, max: 200 },
  nonConsensusCooldownBars: { target: STRATEGY_INPUTS, type: "int", min: 0, max: 200 },
  requireFreshTriggerAfterNonConsensus: { target: STRATEGY_INPUTS, type: "bool" },
  allowH4EarlyD2Override: { target: STRATEGY_INPUTS, type: "bool" },
  allowContinuationAddAfterBE: { target: STRATEGY_INPUTS, type: "bool" },
  maxContinuationAddsPerThesis: { target: STRATEGY_INPUTS, type: "int", min: 0, max: 5 },
  thesisBreakConfirmBars: { target: STRATEGY_INPUTS, type: "int", min: 1, max: 5 },
  allowRiskRecycleAdd: { target: STRATEGY_INPUTS, type: "bool" },
  allowSoftLowQualityProbe: { target: STRATEGY_CONFIG, type: "bool" },
  softQualityBuffer: { target: STRATEGY_CONFIG, type: "int", min: 0, max: 2 },
  minQualityScore: { target: STRATEGY_CONFIG, type: "int", min: 1, max: 6 },
  minSlPct: { target: STRATEGY_CONFIG, type: "number", min: 0, max: 100 },
  maxSlPct: { target: STRATEGY_CONFIG, type: "number", min: 0, max: 100 },
  ignoreH4NoiseGate: { target: STRATEGY_CONFIG, type: "bool" },
  allowDirectITriggers: { target: STRATEGY_CONFIG, type: "bool" },
  requireStrictFormSequence: { target: STRATEGY_CONFIG, type: "bool" }
};

function parseStrategyBool(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return null;
}

function parseStrategyOverrideValue(rawValue, spec) {
  if (spec.type === "bool") return parseStrategyBool(rawValue);
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.min(spec.max ?? parsed, Math.max(spec.min ?? parsed, parsed));
  return spec.type === "int" ? Math.round(clamped) : clamped;
}

function applyStrategyUrlOverrides() {
  const params = queryParams();
  Object.entries(STRATEGY_URL_OVERRIDES).forEach(([key, spec]) => {
    const rawValue = params.get(`st.${key}`) ?? params.get(`strategy.${key}`);
    if (rawValue == null) return;
    const value = parseStrategyOverrideValue(rawValue, spec);
    if (value == null) return;
    spec.target[key] = value;
  });
}

function strategyConfigFingerprint() {
  return [
    `R${params.rsiLength}E${params.rsiEmaLength}W${params.rsiWmaLength}`,
    `M${STRATEGY_INPUTS.mtfMode === "context" ? "C" : STRATEGY_INPUTS.mtfMode === "strict" ? "S" : "O"}`,
    `I${STRATEGY_CONFIG.allowDirectITriggers ? "1" : "0"}`,
    `D2${STRATEGY_INPUTS.allowH4EarlyD2Override ? "1" : "0"}`,
    `FW${STRATEGY_CONFIG.filterPointsByEmaWmaTrend ? "1" : "0"}`,
    `RT${STRATEGY_INPUTS.allowRealtimeCurrentTfEntries ? "1" : "0"}`,
    `SQ${STRATEGY_CONFIG.allowSoftLowQualityProbe ? "1" : "0"}/${STRATEGY_CONFIG.softQualityBuffer}`,
    "RV1",
    `PH${STRATEGY_INPUTS.enableProgressiveHold ? "1" : "0"}/${STRATEGY_INPUTS.thesisBreakConfirmBars}/${STRATEGY_INPUTS.allowPromotionScaleIn ? "1" : "0"}/${STRATEGY_INPUTS.allowContinuationAddAfterBE ? "1" : "0"}/${STRATEGY_INPUTS.maxContinuationAddsPerThesis}`,
    `SW${STRATEGY_INPUTS.enableH4SwingTrail ? "1" : "0"}/${STRATEGY_INPUTS.h4SwingPivotBars}/${STRATEGY_INPUTS.h4SwingTrailPivotBars}/${STRATEGY_INPUTS.h4FormTrailLookback}/${STRATEGY_INPUTS.h4SwingSlBuffer}/${STRATEGY_INPUTS.h4SwingTrailAfterOneR ? "1" : "0"}/${STRATEGY_INPUTS.useStructureConfirmedH4SwingTrail ? "1" : "0"}`,
    `BE${STRATEGY_INPUTS.enableBreakEvenAtTwoR ? "1" : "0"}/${STRATEGY_INPUTS.breakEvenRMultiple}`,
    `N${STRATEGY_CONFIG.noiseLookback}/${STRATEGY_CONFIG.noiseCrossCount}/IG${STRATEGY_CONFIG.ignoreH4NoiseGate ? "1" : "0"}`,
    `Z${STRATEGY_CONFIG.h4MidZoneLow}-${STRATEGY_CONFIG.h4MidZoneHigh}`,
    `MZ${STRATEGY_CONFIG.h4MidNoiseLookback}/${STRATEGY_CONFIG.h4MidNoiseMinBars}`,
    `II${STRATEGY_CONFIG.iiTo3WindowBars}`,
    `SF${STRATEGY_CONFIG.stateFreshBars}`,
    `SS${STRATEGY_CONFIG.iiTo3WindowBars + STRATEGY_CONFIG.stateFreshBars + 2}`,
    `SL${STRATEGY_CONFIG.setupStopLookback}`,
    `T${STRATEGY_CONFIG.trapHighLevel}/${STRATEGY_CONFIG.trapLowLevel}`,
    `R${STRATEGY_INPUTS.htfReadinessLookback}`
  ].join("|");
}

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
  return null;
}

function pineGt(value, threshold) {
  return value != null && value > threshold;
}

function pineBetween(value, min, max) {
  return value != null && value >= min && value <= max;
}

function freshAt(flags, index) {
  return !!flags[index] && (index === 0 || !flags[index - 1]);
}

function trapCode(rsiValue, noiseState) {
  if (noiseState) return 2;
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
  const buy2ClassicCondition = [];
  const sell2ClassicCondition = [];
  const buy3ClassicCondition = [];
  const sell3ClassicCondition = [];
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

    const switchToBuyI = belowBoth && linesExpanding && pineGt(barsSinceWmaDown, 1) && (side !== 1 || point !== 1);
    const switchToSellI = aboveBoth && linesExpanding && pineGt(barsSinceWmaUp, 1) && (side !== -1 || point !== 1);
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
    buy2ClassicCondition[index] = buy2Candidate;
    sell2ClassicCondition[index] = sell2Candidate;
    buy2Condition[index] = buy2Candidate || buy2SemanticCandidate;
    sell2Condition[index] = sell2Candidate || sell2SemanticCandidate;
    const buy2Event = freshAt(buy2Condition, index) || buy2DirectFromI;
    const sell2Event = freshAt(sell2Condition, index) || sell2DirectFromI;
    const buy3DirectFromII = buyPointsAllowed && STRATEGY_CONFIG.allowDirectITriggers && side === 1 && point === 1 && buyIIEvent && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3DirectFromII = sellPointsAllowed && STRATEGY_CONFIG.allowDirectITriggers && side === -1 && point === 1 && sellIIEvent && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3WindowFromII = buyPointsAllowed && side === 1 && point === 2 && index > (stateBar ?? -1) && pineBetween(barsSinceWmaUp, 0, STRATEGY_CONFIG.iiTo3WindowBars) && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3WindowFromII = sellPointsAllowed && side === -1 && point === 2 && index > (stateBar ?? -1) && pineBetween(barsSinceWmaDown, 0, STRATEGY_CONFIG.iiTo3WindowBars) && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Impulse = buyPointsAllowed && side === 1 && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3Impulse = sellPointsAllowed && side === -1 && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Candidate = buyPointsAllowed && side === 1 && index > (stateBar ?? -1) && !noiseState && (point >= 3 && wmaCrossUp || buy3WindowFromII);
    const sell3Candidate = sellPointsAllowed && side === -1 && index > (stateBar ?? -1) && !noiseState && (point >= 3 && wmaCrossDown || sell3WindowFromII);
    const buy3SemanticCandidate = buyPointsAllowed && previewSemanticState === SEM.BUY_3 && semanticState !== SEM.BUY_3 && index > (stateBar ?? -1) && !noiseState;
    const sell3SemanticCandidate = sellPointsAllowed && previewSemanticState === SEM.SELL_3 && semanticState !== SEM.SELL_3 && index > (stateBar ?? -1) && !noiseState;
    buy3ClassicCondition[index] = buy3Candidate;
    sell3ClassicCondition[index] = sell3Candidate;
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

function barssince(flags, index) {
  for (let i = index; i >= 0; i -= 1) {
    if (flags[i]) return index - i;
  }
  return null;
}

function lowest(candles, index, lookback, field = "low") {
  const start = Math.max(0, index - lookback + 1);
  let value = Infinity;
  for (let i = start; i <= index; i += 1) value = Math.min(value, candles[i][field]);
  return value;
}

function highest(candles, index, lookback, field = "high") {
  const start = Math.max(0, index - lookback + 1);
  let value = -Infinity;
  for (let i = start; i <= index; i += 1) value = Math.max(value, candles[i][field]);
  return value;
}

function semanticFamilySide(stateCode) {
  if (stateCode >= SEM.BUY_I && stateCode <= SEM.BUY_TRAP_WAIT) return 1;
  if (stateCode >= SEM.SELL_I && stateCode <= SEM.SELL_TRAP_WAIT) return -1;
  return 0;
}

function semanticTriggerTier(stateCode) {
  if ([SEM.BUY_1, SEM.BUY_2, SEM.BUY_3, SEM.SELL_1, SEM.SELL_2, SEM.SELL_3].includes(stateCode)) return 2;
  if ([SEM.BUY_I, SEM.BUY_II, SEM.BUY_STALE, SEM.BUY_TRAP_WAIT, SEM.SELL_I, SEM.SELL_II, SEM.SELL_STALE, SEM.SELL_TRAP_WAIT].includes(stateCode)) return 1;
  return 0;
}

function semanticBiasCode(stateCode) {
  if (stateCode === SEM.BUY_I) return -1;
  if ([SEM.BUY_1, SEM.BUY_2, SEM.BUY_3, SEM.BUY_STALE].includes(stateCode)) return 1;
  if (stateCode === SEM.SELL_I) return 1;
  if ([SEM.SELL_1, SEM.SELL_2, SEM.SELL_3, SEM.SELL_STALE].includes(stateCode)) return -1;
  return 0;
}

function regimeState(side, d2Bias, d2Trap) {
  if (!side) return "D2_NEUTRAL";
  if ((side === 1 && d2Trap === -1) || (side === -1 && d2Trap === 1)) return "D2_TRAP";
  if (d2Bias === -side) return "D2_OPPOSE";
  if (d2Bias === side) return "D2_SUPPORT";
  return "D2_NEUTRAL";
}

function mtfStateLabel(hasTrigger, strongConflict, weakCounter, d2State) {
  if (!hasTrigger) return "MTF_NO_TRIGGER";
  if (strongConflict) return "MTF_STRONG_CONFLICT";
  if (d2State === "D2_TRAP") return "MTF_D2_TRAP";
  if (d2State === "D2_OPPOSE") return "MTF_D2_OPPOSE";
  if (weakCounter) return "MTF_WEAK_COUNTER";
  if (d2State === "D2_SUPPORT") return "MTF_D2_SUPPORT";
  return "MTF_D2_NEUTRAL";
}

function entryModeLabel(hasTrigger, mtfState, d2State) {
  if (!hasTrigger || mtfState === "MTF_STRONG_CONFLICT" || d2State === "D2_TRAP") return "NO-TRADE";
  if (d2State === "D2_SUPPORT" && mtfState !== "MTF_WEAK_COUNTER") return "FULL ENTRY";
  return "PARTIAL ONLY";
}

function triggerLabel(tfName, lane, side, code) {
  if (!code) return "none";
  return `${tfName}/${lane}/${side === 1 ? "B" : "S"}${Math.abs(code) === 4 ? "2" : "3"}`;
}

function thesisFrameLabel(level) {
  return level === 3 ? "D1" : level === 2 ? "H12" : level === 1 ? "H4" : "NONE";
}

function thesisPanelLabel(stage, level) {
  const stageText = stage === 2 ? "FULL" : stage === 1 ? "PROBE" : "NONE";
  const frameText = level === 3 ? "D1" : level === 2 ? "H12" : level === 1 ? "H4" : "-";
  return `${stageText} ${frameText}`;
}

function semanticStateShort(stateCode) {
  if (stateCode === SEM.INIT) return "INIT";
  if (stateCode === SEM.NEUTRAL_REARM) return "NTRM";
  if (stateCode === SEM.BUY_I) return "BI";
  if (stateCode === SEM.BUY_II) return "BII";
  if (stateCode === SEM.BUY_1) return "B1";
  if (stateCode === SEM.BUY_2) return "B2";
  if (stateCode === SEM.BUY_3) return "B3";
  if (stateCode === SEM.BUY_STALE) return "BSTL";
  if (stateCode === SEM.BUY_TRAP_WAIT) return "BTRP";
  if (stateCode === SEM.SELL_I) return "SI";
  if (stateCode === SEM.SELL_II) return "SII";
  if (stateCode === SEM.SELL_1) return "S1";
  if (stateCode === SEM.SELL_2) return "S2";
  if (stateCode === SEM.SELL_3) return "S3";
  if (stateCode === SEM.SELL_STALE) return "SSTL";
  if (stateCode === SEM.SELL_TRAP_WAIT) return "STRP";
  return "INIT";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function htfReadinessScore(rsiVal, emaVal, wmaVal, spreadVal, avgSpreadVal, betweenBothFlag) {
  const baseSpread = Math.max(avgSpreadVal || 0, 0.00000001);
  const relativeSpread = spreadVal / baseSpread;
  const nearestMaDist = Math.min(Math.abs(rsiVal - emaVal), Math.abs(rsiVal - wmaVal));
  const nearRatio = nearestMaDist / baseSpread;
  const spreadScore = clamp(100 - Math.max(relativeSpread - 0.85, 0) * 90, 0, 100);
  const bandScore = betweenBothFlag ? 100 : clamp(100 - nearRatio * 120, 0, 100);
  return Math.round(spreadScore * 0.55 + bandScore * 0.45);
}

function htfReadinessCodeFromScore(score) {
  return score >= 70 ? 1 : score >= 45 ? 2 : 3;
}

function thesisBreakBarsRequiredFromTime(time, targetSeconds, confirmBars) {
  const currentSeconds = 4 * 60 * 60;
  const barsPerTarget = Math.max(1, Math.ceil(targetSeconds / currentSeconds));
  const targetOpen = Math.floor(time / targetSeconds) * targetSeconds;
  const barsSinceTargetOpen = Math.floor((time - targetOpen) / currentSeconds);
  const firstWindowBars = Math.max(1, barsPerTarget - barsSinceTargetOpen);
  return confirmBars <= 1 ? firstWindowBars : firstWindowBars + (confirmBars - 1) * barsPerTarget;
}

function computeFramePacks(candles) {
  const rsiData = rsi(candles, params.rsiLength);
  const rsiEmaData = emaFromValues(rsiData, params.rsiEmaLength);
  const rsiWmaData = wmaFromValues(rsiData, params.rsiWmaLength);
  const rows = alignedRsiRows(rsiData, rsiEmaData, rsiWmaData);
  const rowByTime = new Map(rows.map((row) => [row.time, row]));
  const aligned = candles.map((candle) => rowByTime.get(candle.time) || null);
  const packs = [];
  const emaCrossFlags = [];
  const wmaCrossUpFlags = [];
  const wmaCrossDownFlags = [];
  const buy2Condition = [];
  const sell2Condition = [];
  const buy3Condition = [];
  const sell3Condition = [];
  const buy2ClassicCondition = [];
  const sell2ClassicCondition = [];
  const buy3ClassicCondition = [];
  const sell3ClassicCondition = [];
  const h4MidZoneFlags = [];
  const spreadEma = [];
  let side = 0;
  let point = 0;
  let stateBar = null;
  let semanticState = SEM.INIT;
  let prevSpreadEma = null;

  for (let index = 0; index < candles.length; index += 1) {
    const row = aligned[index];
    const prev = aligned[index - 1];
    const candle = candles[index];
    if (!row || !prev) {
      packs.push(null);
      emaCrossFlags[index] = false;
      wmaCrossUpFlags[index] = false;
      wmaCrossDownFlags[index] = false;
      continue;
    }

    const prevSpread = Math.max(Math.abs(prev.rsi - prev.ema), Math.abs(prev.rsi - prev.wma), Math.abs(prev.ema - prev.wma));
    const spread = Math.max(Math.abs(row.rsi - row.ema), Math.abs(row.rsi - row.wma), Math.abs(row.ema - row.wma));
    prevSpreadEma = prevSpreadEma == null ? spread : spread * (2 / (STRATEGY_INPUTS.htfReadinessLookback + 1)) + prevSpreadEma * (1 - (2 / (STRATEGY_INPUTS.htfReadinessLookback + 1)));
    spreadEma[index] = prevSpreadEma;
    const aboveBoth = row.rsi > row.ema && row.rsi > row.wma;
    const belowBoth = row.rsi < row.ema && row.rsi < row.wma;
    const betweenBoth = !aboveBoth && !belowBoth;
    const h4MidZoneFlag = row.rsi >= STRATEGY_CONFIG.h4MidZoneLow && row.rsi <= STRATEGY_CONFIG.h4MidZoneHigh
      && row.ema >= STRATEGY_CONFIG.h4MidZoneLow && row.ema <= STRATEGY_CONFIG.h4MidZoneHigh
      && row.wma >= STRATEGY_CONFIG.h4MidZoneLow && row.wma <= STRATEGY_CONFIG.h4MidZoneHigh;
    h4MidZoneFlags[index] = h4MidZoneFlag;
    const h4MidZoneBars = h4MidZoneFlags
      .slice(Math.max(0, index - STRATEGY_CONFIG.h4MidNoiseLookback + 1), index + 1)
      .filter(Boolean).length;
    const h4MidNoiseRequired = Math.min(STRATEGY_CONFIG.h4MidNoiseMinBars, STRATEGY_CONFIG.h4MidNoiseLookback);
    const h4MidNoiseState = betweenBoth && h4MidZoneBars >= h4MidNoiseRequired;
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
    emaCrossFlags[index] = emaCrossUp || emaCrossDown;
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
    const barsSinceWmaUp = barssince(wmaCrossUpFlags, index);
    const barsSinceWmaDown = barssince(wmaCrossDownFlags, index);
    const previewStateAgeBars = stateBar == null ? 0 : index - stateBar;
    const previewTrap = trapCode(row.rsi, noiseState);
    const previewSemanticState = resolveStrategySemanticState(semanticState, side, point, aboveBoth, belowBoth, linesExpanding, spreadShrinking, noiseState, previewTrap, buyConverging, sellConverging, row.rsi, row.ema, row.wma, previewStateAgeBars);
    const switchToBuyI = belowBoth && linesExpanding && pineGt(barsSinceWmaDown, 1) && (side !== 1 || point !== 1);
    const switchToSellI = aboveBoth && linesExpanding && pineGt(barsSinceWmaUp, 1) && (side !== -1 || point !== 1);
    const buyIIEvent = buyPointsAllowed && side === 1 && point === 1 && buyConverging && (rsiTroughVal != null || spreadShrinking);
    const sellIIEvent = sellPointsAllowed && side === -1 && point === 1 && sellConverging && (rsiPeakVal != null || spreadShrinking);
    const buy1Event = buyPointsAllowed && side === 1 && point === 2 && emaCrossUp && row.rsi < row.wma && !noiseState;
    const sell1Event = sellPointsAllowed && side === -1 && point === 2 && emaCrossDown && row.rsi > row.wma && !noiseState;
    const strictForm = STRATEGY_CONFIG.requireStrictFormSequence;
    const buy2DirectFromI = buyPointsAllowed && !strictForm && STRATEGY_CONFIG.allowDirectITriggers && side === 1 && point === 1 && index > (stateBar ?? -1) && row.rsi > row.ema && row.rsi < row.wma && !noiseState;
    const sell2DirectFromI = sellPointsAllowed && !strictForm && STRATEGY_CONFIG.allowDirectITriggers && side === -1 && point === 1 && index > (stateBar ?? -1) && row.rsi < row.ema && row.rsi > row.wma && !noiseState;
    const buy2Candidate = buyPointsAllowed && side === 1 && index > (stateBar ?? -1) && row.rsi > row.ema && row.rsi < row.wma && !noiseState && (strictForm ? point === 3 : point >= 3);
    const sell2Candidate = sellPointsAllowed && side === -1 && index > (stateBar ?? -1) && row.rsi < row.ema && row.rsi > row.wma && !noiseState && (strictForm ? point === 3 : point >= 3);
    const buy2SemanticCandidate = buyPointsAllowed && previewSemanticState === SEM.BUY_2 && semanticState !== SEM.BUY_2 && index > (stateBar ?? -1) && !noiseState;
    const sell2SemanticCandidate = sellPointsAllowed && previewSemanticState === SEM.SELL_2 && semanticState !== SEM.SELL_2 && index > (stateBar ?? -1) && !noiseState;
    buy2ClassicCondition[index] = buy2Candidate;
    sell2ClassicCondition[index] = sell2Candidate;
    buy2Condition[index] = buy2Candidate || buy2SemanticCandidate;
    sell2Condition[index] = sell2Candidate || sell2SemanticCandidate;
    const buy2Event = freshAt(buy2Condition, index) || buy2DirectFromI;
    const sell2Event = freshAt(sell2Condition, index) || sell2DirectFromI;
    const buy3DirectFromII = buyPointsAllowed && !strictForm && STRATEGY_CONFIG.allowDirectITriggers && side === 1 && point === 1 && buyIIEvent && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3DirectFromII = sellPointsAllowed && !strictForm && STRATEGY_CONFIG.allowDirectITriggers && side === -1 && point === 1 && sellIIEvent && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3WindowFromII = buyPointsAllowed && !strictForm && side === 1 && point === 2 && index > (stateBar ?? -1) && pineBetween(barsSinceWmaUp, 0, STRATEGY_CONFIG.iiTo3WindowBars) && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3WindowFromII = sellPointsAllowed && !strictForm && side === -1 && point === 2 && index > (stateBar ?? -1) && pineBetween(barsSinceWmaDown, 0, STRATEGY_CONFIG.iiTo3WindowBars) && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Impulse = buyPointsAllowed && !strictForm && side === 1 && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3Impulse = sellPointsAllowed && !strictForm && side === -1 && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Candidate = buyPointsAllowed && side === 1 && index > (stateBar ?? -1) && !noiseState && (((strictForm ? point === 4 : point >= 3) && wmaCrossUp) || buy3WindowFromII);
    const sell3Candidate = sellPointsAllowed && side === -1 && index > (stateBar ?? -1) && !noiseState && (((strictForm ? point === 4 : point >= 3) && wmaCrossDown) || sell3WindowFromII);
    const buy3SemanticCandidate = buyPointsAllowed && previewSemanticState === SEM.BUY_3 && semanticState !== SEM.BUY_3 && index > (stateBar ?? -1) && !noiseState;
    const sell3SemanticCandidate = sellPointsAllowed && previewSemanticState === SEM.SELL_3 && semanticState !== SEM.SELL_3 && index > (stateBar ?? -1) && !noiseState;
    buy3ClassicCondition[index] = buy3Candidate;
    sell3ClassicCondition[index] = sell3Candidate;
    buy3Condition[index] = buy3Candidate || buy3SemanticCandidate;
    sell3Condition[index] = sell3Candidate || sell3SemanticCandidate;
    const buy3Event = freshAt(buy3Condition, index) || buy3DirectFromII || buy3Impulse;
    const sell3Event = freshAt(sell3Condition, index) || sell3DirectFromII || sell3Impulse;
    const buy2ClassicEvent = freshAt(buy2ClassicCondition, index);
    const sell2ClassicEvent = freshAt(sell2ClassicCondition, index);
    const buy3ClassicEvent = freshAt(buy3ClassicCondition, index);
    const sell3ClassicEvent = freshAt(sell3ClassicCondition, index);
    const entrySwingLookback = Math.max(2, STRATEGY_INPUTS.h4SwingPivotBars * 2 + 1);
    const entryBufferedSwingLow = lowest(candles, index, entrySwingLookback) - STRATEGY_INPUTS.h4SwingSlBuffer;
    const entryBufferedSwingHigh = highest(candles, index, entrySwingLookback) + STRATEGY_INPUTS.h4SwingSlBuffer;

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

    const trap = trapCode(row.rsi, noiseState);
    const stateAgeBars = stateBar == null ? 0 : index - stateBar;
    semanticState = resolveStrategySemanticState(semanticState, side, point, aboveBoth, belowBoth, linesExpanding, spreadShrinking, noiseState, trap, buyConverging, sellConverging, row.rsi, row.ema, row.wma, stateAgeBars);
    const triggerCode = strictForm ? buy3Event ? 5 : sell3Event ? -5 : 0 : buy2Event ? 4 : buy3Event ? 5 : sell2Event ? -4 : sell3Event ? -5 : 0;
    const readinessScore = htfReadinessScore(row.rsi, row.ema, row.wma, spread, spreadEma[index], betweenBoth);
    packs.push({
      time: candle.time,
      index,
      side,
      point,
      bias: semanticBiasCode(semanticState),
      triggerCode,
      triggerTime: triggerCode ? candle.time : null,
      longStop: lowest(candles, index, STRATEGY_CONFIG.setupStopLookback),
      shortStop: highest(candles, index, STRATEGY_CONFIG.setupStopLookback),
      entryLongStop: STRATEGY_INPUTS.enableH4SwingTrail ? entryBufferedSwingLow : lowest(candles, index, STRATEGY_CONFIG.setupStopLookback),
      entryShortStop: STRATEGY_INPUTS.enableH4SwingTrail ? entryBufferedSwingHigh : highest(candles, index, STRATEGY_CONFIG.setupStopLookback),
      entryLongStopRef: STRATEGY_INPUTS.enableH4SwingTrail ? `H4SWING+${STRATEGY_INPUTS.h4SwingSlBuffer}` : "SETUP",
      entryShortStopRef: STRATEGY_INPUTS.enableH4SwingTrail ? `H4SWING+${STRATEGY_INPUTS.h4SwingSlBuffer}` : "SETUP",
      longTrailFormEvent: buy2ClassicEvent || buy3ClassicEvent,
      shortTrailFormEvent: sell2ClassicEvent || sell3ClassicEvent,
      buyIIEvent,
      sellIIEvent,
      buy2ClassicEvent,
      sell2ClassicEvent,
      buy3ClassicEvent,
      sell3ClassicEvent,
      noiseState,
      h4MidNoiseState,
      h4MidZoneBars,
      trap,
      semanticState,
      rsi: row.rsi,
      ema: row.ema,
      wma: row.wma,
      readinessScore,
      readinessCode: htfReadinessCodeFromScore(readinessScore)
    });
  }

  return packs;
}

function alignPackByTime(packs, time) {
  let result = null;
  for (const pack of packs) {
    if (!pack) continue;
    if (pack.time > time) break;
    result = pack;
  }
  return result;
}

function alignClosedPackByTime(packs, time, targetSeconds, chartSeconds = 4 * 60 * 60) {
  let result = null;
  const visibleOffset = Math.max(0, targetSeconds - chartSeconds);
  for (const pack of packs) {
    if (!pack) continue;
    if (pack.time + visibleOffset > time) break;
    result = pack;
  }
  return result;
}

function computeV17ParityEvents(h4Candles, h12Candles, d1Candles, d2Candles) {
  const h4Packs = computeFramePacks(h4Candles);
  const h12Packs = computeFramePacks(h12Candles);
  const d1Packs = computeFramePacks(d1Candles);
  const d2Packs = computeFramePacks(d2Candles);
  const weeklyVwapByTime = valueMap(anchoredVwap(h4Candles, "W"));
  const orders = [];
  const rsiMarkers = [];
  const statusHistory = [];
  const initialEquity = 100000;
  const partialRiskPct = STRATEGY_INPUTS.partialRiskPct;
  const fullRiskPct = STRATEGY_INPUTS.fullRiskPct;
  const maxLeverage = STRATEGY_INPUTS.maxLeverage;
  const capitalUsageCapPct = STRATEGY_INPUTS.capitalUsageCapPct;
  const commissionPct = STRATEGY_INPUTS.commissionPct;
  const maxOpenThesisLegs = 6;
  let equity = initialEquity;
  let positionSide = 0;
  let positionQty = 0;
  let positionAvgPrice = null;
  let positionStopAnchor = null;
  let positionActiveStop = null;
  let positionTrailRef = "-";
  let positionRiskPct = null;
  let pendingStopAnchor = null;
  let pendingTrailRef = "-";
  let pendingRiskPct = null;
  let thesisStage = 0;
  let thesisFrameLevel = 0;
  let thesisRequiredTier = 0;
  let thesisBrokenBars = 0;
  let lastPromotionAddLevel = 0;
  let continuationAddsH4 = 0;
  let continuationAddsH12 = 0;
  let continuationAddsD1 = 0;
  let openThesisLegs = 0;
  let postThesisBreakLockActive = false;
  let postThesisBreakBlockedSide = 0;
  let postThesisBreakFrameLevel = 0;
  let confirmedFormLongLow = null;
  let confirmedFormShortHigh = null;
  let lastPositionEntryIndex = null;
  let pendingReverseSide = 0;
  let pendingReverseIndex = null;
  let lastExitIndex = null;
  let lastNonConsensusExitIndex = null;
  let lastNonConsensusExitTime = null;
  let lastProcessedH12TriggerTime = null;
  let prevObservedH12TriggerTime = null;
  let sundayVwapRef = null;
  let lastSignalReasonCode = "NONE";
  let lastSignalReasonDetail = "-";
  let lastSignalActionText = "NONE";
  let lastSignalTriggerText = "none";
  let lastSignalIndex = null;
  let lastThesisBreakCode = "NONE";
  let lastThesisBreakDetail = "-";
  let lastThesisBreakIndex = null;
  let latestStatus = null;

  function resetPositionState({ keepPostBreakLock = true } = {}) {
    positionSide = 0;
    positionQty = 0;
    positionAvgPrice = null;
    positionStopAnchor = null;
    positionActiveStop = null;
    positionTrailRef = "-";
    positionRiskPct = null;
    pendingStopAnchor = null;
    pendingTrailRef = "-";
    pendingRiskPct = null;
    thesisStage = 0;
    thesisFrameLevel = 0;
    thesisRequiredTier = 0;
    thesisBrokenBars = 0;
    lastPromotionAddLevel = 0;
    continuationAddsH4 = 0;
    continuationAddsH12 = 0;
    continuationAddsD1 = 0;
    openThesisLegs = 0;
    confirmedFormLongLow = null;
    confirmedFormShortHigh = null;
    lastPositionEntryIndex = null;
    if (!keepPostBreakLock) {
      postThesisBreakLockActive = false;
      postThesisBreakBlockedSide = 0;
      postThesisBreakFrameLevel = 0;
    }
  }

  function closePosition(index, price, detail, markerText = "OUT") {
    const candle = h4Candles[index];
    const fillPrice = applyStrategySlippage(price, -positionSide);
    let commission = 0;
    if (positionSide !== 0 && positionQty > 0 && positionAvgPrice != null) {
      const gross = positionSide === 1 ? (fillPrice - positionAvgPrice) * positionQty : (positionAvgPrice - fillPrice) * positionQty;
      commission = fillCommission(fillPrice, positionQty);
      equity += gross;
      equity -= commission;
    }
    orders.push({
      time: candle.time,
      position: positionSide === 1 ? "aboveBar" : "belowBar",
      color: "#ff6b6b",
      shape: positionSide === 1 ? "arrowDown" : "arrowUp",
      text: markerText,
      action: "exit",
      price: fillPrice,
      triggerPrice: price,
      qty: positionQty,
      commission,
      equity,
      detail,
      size: 1
    });
    lastExitIndex = index;
    resetPositionState();
  }

  function addToPosition(qty, price) {
    if (positionQty <= 0 || positionAvgPrice == null) {
      positionQty = qty;
      positionAvgPrice = price;
      return;
    }
    const nextQty = positionQty + qty;
    positionAvgPrice = (positionAvgPrice * positionQty + price * qty) / nextQty;
    positionQty = nextQty;
  }

  function fillCommission(price, qty) {
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return 0;
    return price * qty * commissionPct / 100;
  }

  function applyEntryCommission(price, qty) {
    const commission = fillCommission(price, qty);
    equity -= commission;
    return commission;
  }

  function applyStrategySlippage(price, direction) {
    if (!Number.isFinite(price) || !direction) return price;
    const offset = STRATEGY_INPUTS.slippageTicks * STRATEGY_INPUTS.priceTick;
    return Number((price + direction * offset).toFixed(8));
  }

  function strategyEquityAt(price) {
    if (!Number.isFinite(price) || positionSide === 0 || positionQty <= 0 || positionAvgPrice == null) return equity;
    const unrealized = positionSide === 1
      ? (price - positionAvgPrice) * positionQty
      : (positionAvgPrice - price) * positionQty;
    return equity + unrealized;
  }

  function recordStatus(index, status) {
    const candle = h4Candles[index];
    latestStatus = {
      time: candle.time,
      index,
      positionSide,
      positionAvgPrice,
      positionActiveStop,
      positionTrailRef,
      thesisStage,
      thesisFrameLevel,
      thesisRequiredTier,
      thesisBrokenBars,
      ...status
    };
    statusHistory.push(latestStatus);
  }

  function addRsiMarker(time, text, color, position, shape = "circle", size = 1) {
    rsiMarkers.push({ time, text, color, position, shape, size });
  }

  for (let index = 0; index < h4Candles.length; index += 1) {
    const candle = h4Candles[index];
    const current = h4Packs[index];
    const h12 = alignClosedPackByTime(h12Packs, candle.time, 12 * 60 * 60);
    const d1 = alignClosedPackByTime(d1Packs, candle.time, 24 * 60 * 60);
    const d2 = alignClosedPackByTime(d2Packs, candle.time, 2 * 24 * 60 * 60);
    if (!current || !h12 || !d1 || !d2) continue;
    const prevCandle = h4Candles[index - 1];
    if (prevCandle) {
      const currentDay = getAnchorBucket(candle.time, "D");
      const prevDay = getAnchorBucket(prevCandle.time, "D");
      const prevDow = dateInUtcPlus7(prevCandle.time).getUTCDay();
      if (currentDay !== prevDay && prevDow === 0) {
        sundayVwapRef = weeklyVwapByTime.get(prevCandle.time) ?? sundayVwapRef;
      }
    }

    if (positionSide === 1 && positionActiveStop != null && candle.low <= positionActiveStop) {
      closePosition(index, positionActiveStop, positionTrailRef === "-" ? "Setup SL" : `${positionTrailRef} SL`, "SL");
    } else if (positionSide === -1 && positionActiveStop != null && candle.high >= positionActiveStop) {
      closePosition(index, positionActiveStop, positionTrailRef === "-" ? "Setup SL" : `${positionTrailRef} SL`, "SL");
    }

    if (positionSide !== 0 && positionStopAnchor != null && positionAvgPrice != null) {
      const invalidLongStopAfterFill = positionSide === 1 && positionStopAnchor >= positionAvgPrice;
      const invalidShortStopAfterFill = positionSide === -1 && positionStopAnchor <= positionAvgPrice;
      if (invalidLongStopAfterFill || invalidShortStopAfterFill) {
        closePosition(index, candle.close, "invalid_sl_fill", "INV SL");
        continue;
      }
    }

    const formTrailLookback = Math.max(STRATEGY_CONFIG.setupStopLookback, STRATEGY_INPUTS.h4FormTrailLookback);
    if (positionSide === 1 && lastPositionEntryIndex != null && index > lastPositionEntryIndex && current.longTrailFormEvent) {
      confirmedFormLongLow = lowest(h4Candles, index - 1, formTrailLookback);
    }
    if (positionSide === -1 && lastPositionEntryIndex != null && index > lastPositionEntryIndex && current.shortTrailFormEvent) {
      confirmedFormShortHigh = highest(h4Candles, index - 1, formTrailLookback);
    }
    const dayOfWeek = dateInUtcPlus7(candle.time).getUTCDay();
    const useSundayVwapRef = dayOfWeek === 1 || dayOfWeek === 2;
    const activeTrailVwap = useSundayVwapRef && sundayVwapRef != null ? sundayVwapRef : weeklyVwapByTime.get(candle.time);
    if (positionSide === 1 && positionActiveStop != null) {
      let nextLongStop = positionActiveStop;
      let nextLongRef = positionTrailRef;
      const activeLongSwingTrailStop = confirmedFormLongLow != null ? confirmedFormLongLow - STRATEGY_INPUTS.h4SwingSlBuffer : null;
      const longInitialRisk = positionStopAnchor != null && positionAvgPrice != null ? positionAvgPrice - positionStopAnchor : null;
      const longReachedOneR = longInitialRisk != null && longInitialRisk > 0 && candle.high >= positionAvgPrice + longInitialRisk;
      const longReachedBreakEvenR = longInitialRisk != null && longInitialRisk > 0 && candle.high >= positionAvgPrice + longInitialRisk * STRATEGY_INPUTS.breakEvenRMultiple;
      const longVwapTrailReady = STRATEGY_INPUTS.enableWeeklyVwapTrail && longReachedOneR && activeTrailVwap != null && activeTrailVwap < candle.close && longInitialRisk != null && candle.close - activeTrailVwap >= longInitialRisk;
      const longSwingTrailReady = STRATEGY_INPUTS.enableH4SwingTrail && (!STRATEGY_INPUTS.h4SwingTrailAfterOneR || longReachedOneR) && activeLongSwingTrailStop != null && activeLongSwingTrailStop < candle.close;
      if (STRATEGY_INPUTS.enableBreakEvenAtTwoR && longReachedBreakEvenR && positionAvgPrice > nextLongStop + STRATEGY_INPUTS.priceTick) {
        nextLongStop = positionAvgPrice;
        nextLongRef = `BE${STRATEGY_INPUTS.breakEvenRMultiple.toFixed(1).replace(/\.0$/, "")}R`;
      }
      if (longVwapTrailReady && activeTrailVwap > nextLongStop + STRATEGY_INPUTS.priceTick) {
        nextLongStop = activeTrailVwap;
        nextLongRef = useSundayVwapRef ? "SUNVWAP" : "VWAPW";
      }
      if (longSwingTrailReady && activeLongSwingTrailStop > nextLongStop + STRATEGY_INPUTS.priceTick) {
        nextLongStop = activeLongSwingTrailStop;
        nextLongRef = `H4FORM+${STRATEGY_INPUTS.h4SwingSlBuffer}`;
      }
      positionActiveStop = nextLongStop;
      positionTrailRef = nextLongRef;
    }
    if (positionSide === -1 && positionActiveStop != null) {
      let nextShortStop = positionActiveStop;
      let nextShortRef = positionTrailRef;
      const activeShortSwingTrailStop = confirmedFormShortHigh != null ? confirmedFormShortHigh + STRATEGY_INPUTS.h4SwingSlBuffer : null;
      const shortInitialRisk = positionStopAnchor != null && positionAvgPrice != null ? positionStopAnchor - positionAvgPrice : null;
      const shortReachedOneR = shortInitialRisk != null && shortInitialRisk > 0 && candle.low <= positionAvgPrice - shortInitialRisk;
      const shortReachedBreakEvenR = shortInitialRisk != null && shortInitialRisk > 0 && candle.low <= positionAvgPrice - shortInitialRisk * STRATEGY_INPUTS.breakEvenRMultiple;
      const shortVwapTrailReady = STRATEGY_INPUTS.enableWeeklyVwapTrail && shortReachedOneR && activeTrailVwap != null && activeTrailVwap > candle.close && shortInitialRisk != null && activeTrailVwap - candle.close >= shortInitialRisk;
      const shortSwingTrailReady = STRATEGY_INPUTS.enableH4SwingTrail && (!STRATEGY_INPUTS.h4SwingTrailAfterOneR || shortReachedOneR) && activeShortSwingTrailStop != null && activeShortSwingTrailStop > candle.close;
      if (STRATEGY_INPUTS.enableBreakEvenAtTwoR && shortReachedBreakEvenR && positionAvgPrice < nextShortStop - STRATEGY_INPUTS.priceTick) {
        nextShortStop = positionAvgPrice;
        nextShortRef = `BE${STRATEGY_INPUTS.breakEvenRMultiple.toFixed(1).replace(/\.0$/, "")}R`;
      }
      if (shortVwapTrailReady && activeTrailVwap < nextShortStop - STRATEGY_INPUTS.priceTick) {
        nextShortStop = activeTrailVwap;
        nextShortRef = useSundayVwapRef ? "SUNVWAP" : "VWAPW";
      }
      if (shortSwingTrailReady && activeShortSwingTrailStop < nextShortStop - STRATEGY_INPUTS.priceTick) {
        nextShortStop = activeShortSwingTrailStop;
        nextShortRef = `H4FORM+${STRATEGY_INPUTS.h4SwingSlBuffer}`;
      }
      positionActiveStop = nextShortStop;
      positionTrailRef = nextShortRef;
    }

    if (pendingReverseSide && pendingReverseIndex != null && index > pendingReverseIndex + 1) {
      pendingReverseSide = 0;
      pendingReverseIndex = null;
    }

    const h12TriggerFresh = h12.triggerTime != null && h12.triggerTime !== prevObservedH12TriggerTime;
    if (h12.triggerTime != null) prevObservedH12TriggerTime = h12.triggerTime;
    const h12TriggerSide = h12.triggerCode > 0 ? 1 : h12.triggerCode < 0 ? -1 : 0;
    const h12RawUsableTrigger = h12.triggerCode !== 0 && h12TriggerSide !== 0 && h12TriggerFresh;
    const h12DuplicateProcessed = h12.triggerTime != null && h12.triggerTime === lastProcessedH12TriggerTime;
    const h12UsableTrigger = h12RawUsableTrigger && !h12DuplicateProcessed;
    const currentTriggerSide = current.triggerCode > 0 ? 1 : current.triggerCode < 0 ? -1 : 0;
    const rawCurrentUsableTrigger = currentTriggerSide !== 0;
    const h4NoiseSuppressCurrent = rawCurrentUsableTrigger && current.h4MidNoiseState;
    const currentUsableTrigger = rawCurrentUsableTrigger && !(h4NoiseSuppressCurrent && !STRATEGY_CONFIG.ignoreH4NoiseGate);
    const bothTriggerConflict = h12UsableTrigger && currentUsableTrigger && h12TriggerSide === -currentTriggerSide;
    const preferH12 = h12UsableTrigger && !currentUsableTrigger;
    const triggerCode = bothTriggerConflict ? 0 : preferH12 ? h12.triggerCode : currentUsableTrigger ? current.triggerCode : h12UsableTrigger ? h12.triggerCode : 0;
    const triggerSide = triggerCode > 0 ? 1 : triggerCode < 0 ? -1 : 0;
    const triggerTf = triggerCode === 0 ? "none" : currentUsableTrigger ? "H4" : h12UsableTrigger ? "H12" : "none";
    const triggerLane = triggerTf === "H12" ? "swing" : "early";
    const triggerStop = triggerSide === 1 ? current.entryLongStop : triggerSide === -1 ? current.entryShortStop : null;
    const triggerStopRef = triggerSide === 1 ? current.entryLongStopRef : triggerSide === -1 ? current.entryShortStopRef : "-";
    const otherSemanticState = preferH12 ? current.semanticState : h12.semanticState;
    const otherSide = semanticFamilySide(otherSemanticState);
    const otherTriggerTier = semanticTriggerTier(otherSemanticState);
    const oppositeOther = triggerSide !== 0 && otherSide === -triggerSide;
    const readinessAllowsEarlyCounter = h12.readinessCode === 1 || h12.readinessCode === 2;
    const h12ReadinessSoftCounter = triggerTf === "H4" && oppositeOther && readinessAllowsEarlyCounter;
    const h12ReadinessBlocked = triggerTf === "H4" && oppositeOther && !readinessAllowsEarlyCounter;
    const weakCounter = oppositeOther && (otherTriggerTier === 1 || h12ReadinessSoftCounter);
    const strongConflict = bothTriggerConflict || (oppositeOther && otherTriggerTier >= 2 && !h12ReadinessSoftCounter);
    const d2Regime = regimeState(triggerSide, d2.bias, d2.trap);
    const h12TrapAgainstTrigger = triggerTf === "H12" && ((triggerSide === -1 && h12.trap === 1) || (triggerSide === 1 && h12.trap === -1));
    const currentTrapAgainstTrigger = triggerTf === "H4" && ((triggerSide === -1 && current.trap === 1) || (triggerSide === 1 && current.trap === -1));
    const triggerTrapWait = h12TrapAgainstTrigger || currentTrapAgainstTrigger;
    const h4NoiseWait = h4NoiseSuppressCurrent && !STRATEGY_CONFIG.ignoreH4NoiseGate && !h12UsableTrigger;
    const hasTrigger = h12UsableTrigger || currentUsableTrigger;
    const triggerText = bothTriggerConflict ? "H4/H12 conflict" : h12ReadinessBlocked ? "H12 stretched wait" : h4NoiseWait ? "H4 noise wait" : triggerLabel(triggerTf, triggerLane, triggerSide, triggerCode);
    const mtfMode = STRATEGY_INPUTS.mtfMode;
    const mtfState = strongConflict ? "MTF_STRONG_CONFLICT" : mtfMode === "off" ? hasTrigger ? "MTF_D2_NEUTRAL" : "MTF_NO_TRIGGER" : mtfStateLabel(hasTrigger, strongConflict, weakCounter, d2Regime);
    const baseEntryMode = strongConflict || triggerTrapWait ? "NO-TRADE" : mtfMode === "off" ? hasTrigger ? "PARTIAL ONLY" : "NO-TRADE" : entryModeLabel(hasTrigger, mtfState, d2Regime);
    const h4D2SoftProbe = triggerTf === "H4" && oppositeOther && d2Regime === "D2_OPPOSE" && readinessAllowsEarlyCounter && !strongConflict && !triggerTrapWait;
    const h4D2Override = STRATEGY_INPUTS.allowH4EarlyD2Override && triggerTf === "H4" && hasTrigger && d2Regime === "D2_OPPOSE" && readinessAllowsEarlyCounter && !strongConflict && !triggerTrapWait;
    const entryModePreQuality = h12ReadinessBlocked ? "NO-TRADE" : h4D2SoftProbe || h4D2Override ? "PARTIAL ONLY" : triggerTf === "H4" && baseEntryMode === "FULL ENTRY" ? "PARTIAL ONLY" : baseEntryMode;
    const preQualityActionable = entryModePreQuality === "PARTIAL ONLY" || entryModePreQuality === "FULL ENTRY";
    const riskPerUnit = triggerSide === 1 && triggerStop != null ? candle.close - triggerStop : triggerSide === -1 && triggerStop != null ? triggerStop - candle.close : null;
    const validTriggerStop = preQualityActionable && riskPerUnit != null && riskPerUnit > 0;
    const triggerSlPct = validTriggerStop ? riskPerUnit / candle.close * 100 : null;
    const slQualityOk = validTriggerStop && triggerSlPct >= STRATEGY_CONFIG.minSlPct && triggerSlPct <= STRATEGY_CONFIG.maxSlPct;
    const triggerTfScore = triggerTf === "H12" ? 2 : triggerTf === "H4" ? 1 : 0;
    const d2QualityScore = d2Regime === "D2_SUPPORT" ? 2 : d2Regime === "D2_NEUTRAL" || h4D2SoftProbe || h4D2Override ? 1 : 0;
    const mtfQualityScore = weakCounter ? 0 : 1;
    const slQualityScore = slQualityOk ? 1 : 0;
    const triggerQualityScore = triggerTfScore + d2QualityScore + mtfQualityScore + slQualityScore;
    const qualityOk = preQualityActionable && validTriggerStop && triggerQualityScore >= STRATEGY_CONFIG.minQualityScore;
    const qualityGap = STRATEGY_CONFIG.minQualityScore - triggerQualityScore;
    const softQualityStructureOk = Math.abs(triggerCode) === 5 || triggerTf === "H12" || (triggerTf === "H4" && readinessAllowsEarlyCounter && (STRATEGY_CONFIG.ignoreH4NoiseGate || !current.h4MidNoiseState));
    const softLowQualitySetup = preQualityActionable && validTriggerStop && STRATEGY_CONFIG.allowSoftLowQualityProbe && !qualityOk && qualityGap > 0 && qualityGap <= STRATEGY_CONFIG.softQualityBuffer && softQualityStructureOk && !strongConflict && !triggerTrapWait;
    const lowQualitySetup = preQualityActionable && validTriggerStop && !qualityOk && !softLowQualitySetup;
    const entryMode = qualityOk ? entryModePreQuality : softLowQualitySetup ? "PARTIAL ONLY" : "NO-TRADE";
    const actionableEntry = entryMode === "PARTIAL ONLY" || entryMode === "FULL ENTRY";
    const fullSignalColor = entryMode === "FULL ENTRY";
    if (current.buyIIEvent) addRsiMarker(candle.time, "II", "#40ff72", "belowBar", "circle");
    if (current.sellIIEvent) addRsiMarker(candle.time, "II", "#ff9800", "aboveBar", "circle");
    if (current.buy2ClassicEvent) addRsiMarker(candle.time, "2", fullSignalColor ? "#4caf50" : "rgba(76,175,80,0.55)", "belowBar", "square");
    if (current.sell2ClassicEvent) addRsiMarker(candle.time, "2", fullSignalColor ? "#ff4d5a" : "rgba(255,77,90,0.55)", "aboveBar", "square");
    if (current.buy3ClassicEvent) addRsiMarker(candle.time, "3", fullSignalColor ? "#4caf50" : "rgba(76,175,80,0.55)", "belowBar", "arrowUp");
    if (current.sell3ClassicEvent) addRsiMarker(candle.time, "3", fullSignalColor ? "#ff4d5a" : "rgba(255,77,90,0.55)", "aboveBar", "arrowDown");
    if (h12UsableTrigger && h12TriggerSide === 1) addRsiMarker(candle.time, "H12", "#304cff", "belowBar", "arrowUp");
    if (h12UsableTrigger && h12TriggerSide === -1) addRsiMarker(candle.time, "H12", "#304cff", "aboveBar", "arrowDown");
    if (strongConflict) addRsiMarker(candle.time, "MTF-X", "#ffe45c", current.rsi >= 50 ? "aboveBar" : "belowBar", "square");
    const d2GateWait = hasTrigger && (d2Regime === "D2_TRAP" || (d2Regime === "D2_OPPOSE" && h12ReadinessBlocked));
    if (d2GateWait) addRsiMarker(candle.time, "D2-G", "#ff9800", triggerSide === 1 ? "belowBar" : "aboveBar", "square");
    if (positionSide > 0 && current.bias === 1 && current.rsi < current.wma) addRsiMarker(candle.time, "W!", "#ff9800", "aboveBar", "square");
    if (positionSide < 0 && current.bias === -1 && current.rsi > current.wma) addRsiMarker(candle.time, "W!", "#ff9800", "belowBar", "square");

    let promotedToH12 = false;
    let promotedToD1 = false;
    const progressiveHoldEnabled = STRATEGY_INPUTS.enableProgressiveHold;
    if (progressiveHoldEnabled && positionSide !== 0 && thesisFrameLevel < 2 && semanticFamilySide(h12.semanticState) === positionSide && semanticTriggerTier(h12.semanticState) >= 2) {
      thesisFrameLevel = 2;
      thesisRequiredTier = Math.max(thesisRequiredTier, 2);
      promotedToH12 = true;
    }
    if (progressiveHoldEnabled && positionSide !== 0 && thesisFrameLevel === 2 && semanticFamilySide(d1.semanticState) === positionSide && semanticTriggerTier(d1.semanticState) >= 2) {
      thesisFrameLevel = 3;
      thesisRequiredTier = Math.max(thesisRequiredTier, 2);
      promotedToD1 = true;
    }
    const thesisState = thesisFrameLevel === 3 ? d1.semanticState : thesisFrameLevel === 2 ? h12.semanticState : thesisFrameLevel === 1 ? current.semanticState : SEM.INIT;
    const thesisSide = thesisFrameLevel === 3 ? semanticFamilySide(d1.semanticState) : thesisFrameLevel === 2 ? semanticFamilySide(h12.semanticState) : thesisFrameLevel === 1 ? semanticFamilySide(current.semanticState) : 0;
    const thesisTier = thesisFrameLevel === 3 ? semanticTriggerTier(d1.semanticState) : thesisFrameLevel === 2 ? semanticTriggerTier(h12.semanticState) : thesisFrameLevel === 1 ? semanticTriggerTier(current.semanticState) : 0;
    const thesisFamilyBroken = thesisFrameLevel <= 1
      ? positionSide === 1 ? [SEM.SELL_2, SEM.SELL_3].includes(thesisState) : positionSide === -1 ? [SEM.BUY_2, SEM.BUY_3].includes(thesisState) : false
      : positionSide === 1 ? [SEM.SELL_1, SEM.SELL_2, SEM.SELL_3].includes(thesisState) : positionSide === -1 ? [SEM.BUY_1, SEM.BUY_2, SEM.BUY_3].includes(thesisState) : false;
    const thesisStrengthBroken = positionSide !== 0 && thesisFrameLevel > 0 && thesisSide === positionSide && thesisRequiredTier > 0 && thesisTier < thesisRequiredTier;
    const thesisBrokenSignal = thesisFamilyBroken || thesisStrengthBroken;
    thesisBrokenBars = positionSide !== 0 && thesisBrokenSignal ? thesisBrokenBars + 1 : 0;
    const thesisBreakRequiredBars = thesisFrameLevel === 3
      ? thesisBreakBarsRequiredFromTime(candle.time, 24 * 60 * 60, STRATEGY_INPUTS.thesisBreakConfirmBars)
      : thesisFrameLevel === 2
        ? thesisBreakBarsRequiredFromTime(candle.time, 12 * 60 * 60, STRATEGY_INPUTS.thesisBreakConfirmBars)
        : STRATEGY_INPUTS.thesisBreakConfirmBars;
    const thesisBrokenConfirmed = progressiveHoldEnabled && thesisBrokenSignal && thesisBrokenBars >= thesisBreakRequiredBars;
    const thesisBrokenReason = thesisFamilyBroken ? (thesisFrameLevel === 3 ? "d1_thesis_broken" : thesisFrameLevel === 2 ? "h12_thesis_broken" : "h4_thesis_broken") : thesisStrengthBroken ? (thesisFrameLevel === 3 ? "d1_thesis_lost_tier" : thesisFrameLevel === 2 ? "h12_thesis_lost_tier" : "h4_thesis_lost_tier") : "-";
    const oppositePosition = positionSide !== 0 && triggerSide === -positionSide;
    const reverseAllowedByThesis = thesisFrameLevel <= 1 ? triggerTf === "H4" || triggerTf === "H12" : thesisFrameLevel === 2 ? triggerTf === "H12" : false;
    const reverseActionableSignal = progressiveHoldEnabled && actionableEntry && triggerSide !== 0 && oppositePosition && thesisBrokenConfirmed && reverseAllowedByThesis;
    const nonConsensusExit = progressiveHoldEnabled && positionSide !== 0 && thesisBrokenConfirmed && !reverseActionableSignal;

    if (reverseActionableSignal) {
      const entryReasonCode = `REVERSE_PREP_${triggerSide === 1 ? "BUY" : "SELL"}`;
      const entryReasonDetail = "close -> next bar";
      recordStatus(index, {
        currentPanelState: semanticStateShort(current.semanticState),
        currentBias: current.bias,
        h12PanelState: semanticStateShort(h12.semanticState),
        h12Bias: h12.bias,
        h12TriggerCode: h12.triggerCode,
        h12TriggerTime: h12.triggerTime,
        h12ReadinessScore: h12.readinessScore,
        h12ReadinessCode: h12.readinessCode,
        d1PanelState: semanticStateShort(d1.semanticState),
        d1Bias: d1.bias,
        d1TriggerCode: d1.triggerCode,
        d1TriggerTime: d1.triggerTime,
        d1ReadinessScore: d1.readinessScore,
        d1ReadinessCode: d1.readinessCode,
        d2PanelState: semanticStateShort(d2.semanticState),
        d2TriggerCode: d2.triggerCode,
        d2TriggerTime: d2.triggerTime,
        d2ReadinessScore: d2.readinessScore,
        d2ReadinessCode: d2.readinessCode,
        mtfState,
        d2Regime,
        d2Bias: d2.bias,
        triggerText,
        triggerTf,
        entryMode,
        entryActionText: "REVERSE_PREP",
        entryReasonCode,
        entryReasonDetail,
        panelReasonCode: entryReasonCode,
        panelReasonDetail: entryReasonDetail,
        thesisBrokenReason,
        thesisBrokenConfirmed
      });
      closePosition(index, candle.close, `reverse_prepare_${triggerText}`, `REV ${triggerSide === 1 ? "B" : "S"}${Math.abs(triggerCode) === 4 ? "2" : "3"}`);
      pendingReverseSide = triggerSide;
      pendingReverseIndex = index;
      continue;
    }

    if (nonConsensusExit) {
      const postThesisBreakFamilyLock = thesisFrameLevel >= 2 && thesisFamilyBroken;
      const exitSide = positionSide;
      const exitThesisFrameLevel = thesisFrameLevel;
      const entryReasonCode = `EXIT_THESIS_${thesisFrameLabel(exitThesisFrameLevel)}`;
      const entryReasonDetail = `${thesisFrameLabel(exitThesisFrameLevel)} broken | ${thesisBrokenReason}`;
      lastThesisBreakCode = entryReasonCode;
      lastThesisBreakDetail = entryReasonDetail;
      lastThesisBreakIndex = index;
      recordStatus(index, {
        currentPanelState: semanticStateShort(current.semanticState),
        currentBias: current.bias,
        h12PanelState: semanticStateShort(h12.semanticState),
        h12Bias: h12.bias,
        h12TriggerCode: h12.triggerCode,
        h12TriggerTime: h12.triggerTime,
        h12ReadinessScore: h12.readinessScore,
        h12ReadinessCode: h12.readinessCode,
        d1PanelState: semanticStateShort(d1.semanticState),
        d1Bias: d1.bias,
        d1TriggerCode: d1.triggerCode,
        d1TriggerTime: d1.triggerTime,
        d1ReadinessScore: d1.readinessScore,
        d1ReadinessCode: d1.readinessCode,
        d2PanelState: semanticStateShort(d2.semanticState),
        d2TriggerCode: d2.triggerCode,
        d2TriggerTime: d2.triggerTime,
        d2ReadinessScore: d2.readinessScore,
        d2ReadinessCode: d2.readinessCode,
        mtfState,
        d2Regime,
        d2Bias: d2.bias,
        triggerText,
        triggerTf,
        entryMode,
        entryActionText: "NON_CONSENSUS_EXIT",
        entryReasonCode,
        entryReasonDetail,
        panelReasonCode: entryReasonCode,
        panelReasonDetail: entryReasonDetail,
        thesisBrokenReason,
        thesisBrokenConfirmed
      });
      closePosition(index, candle.close, `non_consensus_${thesisBrokenReason}`, "OUT");
      lastNonConsensusExitIndex = index;
      lastNonConsensusExitTime = candle.time;
      if (postThesisBreakFamilyLock) {
        postThesisBreakLockActive = true;
        postThesisBreakBlockedSide = exitSide;
        postThesisBreakFrameLevel = exitThesisFrameLevel;
      }
      continue;
    }

    const entryCooldownOk = lastExitIndex == null || index > lastExitIndex + STRATEGY_INPUTS.flatCooldownBars;
    const nonConsensusCooldownOk = lastNonConsensusExitIndex == null || index > lastNonConsensusExitIndex + STRATEGY_INPUTS.nonConsensusCooldownBars;
    const freshAfterNonConsensus = lastNonConsensusExitTime == null || !STRATEGY_INPUTS.requireFreshTriggerAfterNonConsensus || (triggerTf === "H12" ? h12.triggerTime : candle.time) > lastNonConsensusExitTime;
    const reverseNextBarValid = pendingReverseSide !== 0 && pendingReverseIndex != null && index === pendingReverseIndex + 1 && actionableEntry && triggerSide === pendingReverseSide;
    const effectiveEntryCooldownOk = entryCooldownOk || reverseNextBarValid;
    const h12AlreadyProcessed = triggerTf === "H12" && h12DuplicateProcessed;
    const h12DuplicateBlocked = h12DuplicateProcessed && h12RawUsableTrigger && !currentUsableTrigger;
    const canUseTrigger = actionableEntry && validTriggerStop && effectiveEntryCooldownOk && nonConsensusCooldownOk && freshAfterNonConsensus && !h12AlreadyProcessed;
    const h4OppositeTrigger = positionSide !== 0 && currentUsableTrigger && currentTriggerSide === -positionSide;
    const h12OppositeTrigger = positionSide !== 0 && h12UsableTrigger && h12TriggerSide === -positionSide;
    const h4AgainstPosition = positionSide !== 0 && current.side === -positionSide && current.point >= 3;
    const d2RegimeForPosition = regimeState(positionSide, d2.bias, d2.trap);
    const d2AgainstPosition = positionSide !== 0 && (d2RegimeForPosition === "D2_OPPOSE" || d2RegimeForPosition === "D2_TRAP");
    const h12TrendAligned = positionSide !== 0 && semanticFamilySide(h12.semanticState) === positionSide && semanticTriggerTier(h12.semanticState) >= 2;
    const d2TrendAllowsHold = positionSide !== 0 && (d2RegimeForPosition === "D2_SUPPORT" || d2RegimeForPosition === "D2_NEUTRAL" || STRATEGY_INPUTS.allowH4EarlyD2Override);
    const trendHold = thesisFrameLevel >= 2 && d2TrendAllowsHold;
    const h4Pullback = trendHold && h4AgainstPosition;
    const h12AgainstPosition = positionSide !== 0 && h12.side === -positionSide && h12.point >= (trendHold ? 5 : 4);
    const h4WarningOnly = h4OppositeTrigger || h4AgainstPosition;
    const h4OriginFlowBlocked = positionSide === 0 && triggerTf === "H12" && actionableEntry;
    const postThesisBreakSameSideBlocked = positionSide === 0 && postThesisBreakLockActive && actionableEntry && triggerSide === postThesisBreakBlockedSide;
    const strategyEquity = strategyEquityAt(candle.close);
    const entryRiskPct = entryMode === "FULL ENTRY" ? fullRiskPct : entryMode === "PARTIAL ONLY" ? partialRiskPct : null;
    const maxNotional = strategyEquity * maxLeverage;
    const usableNotional = maxNotional * capitalUsageCapPct / 100;
    const maxQty = usableNotional / candle.close;
    const entryRiskAmount = entryRiskPct != null ? strategyEquity * entryRiskPct / 100 : null;
    const entryQtyRaw = validTriggerStop && entryRiskAmount != null ? entryRiskAmount / riskPerUnit : null;
    const entryQty = entryQtyRaw != null ? Math.min(entryQtyRaw, maxQty) : null;
    const promotionTargetLevel = promotedToD1 ? 3 : promotedToH12 ? 2 : 0;
    const promotionTopUpSide = STRATEGY_INPUTS.allowPromotionScaleIn && promotionTargetLevel > 0 ? positionSide : 0;
    const currentThesisAddLevel = thesisFrameLevel >= 3 ? 3 : thesisFrameLevel >= 2 ? 2 : 1;
    const continuationAddsUsed = currentThesisAddLevel === 3 ? continuationAddsD1 : currentThesisAddLevel === 2 ? continuationAddsH12 : continuationAddsH4;
    const continuationH4TriggerCode = positionSide === 1
      ? current.buy3ClassicEvent ? 5 : current.buy2ClassicEvent ? 4 : 0
      : positionSide === -1
        ? current.sell3ClassicEvent ? -5 : current.sell2ClassicEvent ? -4 : 0
        : 0;
    const continuationH4TriggerText = continuationH4TriggerCode === 5 ? "H4/cont/B3"
      : continuationH4TriggerCode === 4 ? "H4/cont/B2"
        : continuationH4TriggerCode === -5 ? "H4/cont/S3"
          : continuationH4TriggerCode === -4 ? "H4/cont/S2"
            : "none";
    const stopLockedBeyondEntry = positionSide === 1 && positionActiveStop != null && positionAvgPrice != null
      ? positionActiveStop >= positionAvgPrice - STRATEGY_INPUTS.priceTick
      : positionSide === -1 && positionActiveStop != null && positionAvgPrice != null
        ? positionActiveStop <= positionAvgPrice + STRATEGY_INPUTS.priceTick
        : false;
    const continuationNoiseBlocked = current.h4MidNoiseState && thesisFrameLevel <= 1 && !STRATEGY_CONFIG.ignoreH4NoiseGate;
    const continuationTopUpIntent = STRATEGY_INPUTS.allowContinuationAddAfterBE && positionSide !== 0 && continuationH4TriggerCode !== 0 && continuationAddsUsed < STRATEGY_INPUTS.maxContinuationAddsPerThesis && !continuationNoiseBlocked && !nonConsensusExit && mtfState !== "MTF_STRONG_CONFLICT";
    const continuationTopUpSignal = continuationTopUpIntent && stopLockedBeyondEntry;
    const topUpSignalSide = promotionTopUpSide !== 0 || continuationTopUpSignal ? positionSide : triggerSide;
    const sameSideTopUpContext = positionSide !== 0 && topUpSignalSide === positionSide;
    const currentPositionRiskPerUnit = sameSideTopUpContext && positionActiveStop != null ? (topUpSignalSide === 1 ? candle.close - positionActiveStop : positionActiveStop - candle.close) : null;
    const currentPositionRiskAmount = sameSideTopUpContext && currentPositionRiskPerUnit != null && currentPositionRiskPerUnit > 0 ? Math.abs(positionQty) * currentPositionRiskPerUnit : null;
    const fullRiskAmount = strategyEquity * fullRiskPct / 100;
    const promotionTopUpIntent = STRATEGY_INPUTS.allowPromotionScaleIn && sameSideTopUpContext && promotionTargetLevel > 0 && promotionTargetLevel > lastPromotionAddLevel && !nonConsensusExit && mtfState !== "MTF_STRONG_CONFLICT";
    const promotionTopUpSignal = promotionTopUpIntent && stopLockedBeyondEntry;
    const standardTopUpRiskAmount = sameSideTopUpContext && currentPositionRiskAmount != null ? Math.max(fullRiskAmount - currentPositionRiskAmount, 0) : null;
    const recycleTopUpRiskAmount = (continuationTopUpSignal || promotionTopUpSignal) && STRATEGY_INPUTS.allowRiskRecycleAdd ? fullRiskAmount : null;
    const topUpRiskAmount = recycleTopUpRiskAmount != null ? recycleTopUpRiskAmount : standardTopUpRiskAmount;
    const topUpRiskPct = topUpRiskAmount != null && strategyEquity > 0 ? topUpRiskAmount / strategyEquity * 100 : null;
    const topUpRiskPerUnit = sameSideTopUpContext && positionActiveStop != null ? (topUpSignalSide === 1 ? candle.close - positionActiveStop : positionActiveStop - candle.close) : null;
    const availableTopUpQty = Math.max(maxQty - Math.abs(positionQty), 0);
    const topUpQtyRaw = sameSideTopUpContext && topUpRiskPerUnit != null && topUpRiskPerUnit > 0 && topUpRiskAmount != null && topUpRiskAmount > 0 ? topUpRiskAmount / topUpRiskPerUnit : null;
    const topUpQty = topUpQtyRaw != null ? Math.min(topUpQtyRaw, availableTopUpQty) : null;
    const topUpPyramidOk = openThesisLegs < maxOpenThesisLegs;
    const topUpCapacityOk = availableTopUpQty > 0;
    const topUpHasQty = topUpQty != null && topUpQty > 0;
    const continuationTopUpReady = continuationTopUpSignal && topUpRiskPct != null && topUpRiskPct > 0 && topUpHasQty && topUpCapacityOk && topUpPyramidOk;
    const promotionTopUpReady = promotionTopUpSignal && topUpRiskPct != null && topUpRiskPct > 0 && topUpHasQty && topUpCapacityOk && topUpPyramidOk;
    const topUpReady = (promotionTopUpReady || continuationTopUpReady) && !nonConsensusExit && sameSideTopUpContext && topUpRiskPct != null && topUpRiskPct > 0 && topUpHasQty && topUpCapacityOk && topUpPyramidOk && mtfState !== "MTF_STRONG_CONFLICT";
    const topUpEntrySide = promotionTopUpReady ? positionSide : continuationTopUpReady ? positionSide : triggerSide;
    const topUpTriggerText = promotionTopUpReady ? `${thesisFrameLabel(promotionTargetLevel)}/promote` : continuationTopUpReady ? `${thesisFrameLabel(currentThesisAddLevel)}/${continuationH4TriggerText}` : triggerText;
    const topUpCommentPrefix = promotionTopUpReady ? "Promote " : continuationTopUpReady ? "Continue " : "ThesisFull ";
    const flatEntryReady = canUseTrigger && !h4OriginFlowBlocked && !postThesisBreakSameSideBlocked && !nonConsensusExit && positionSide === 0 && !topUpReady && entryQty != null && entryQty > 0;
    const rawHasTrigger = h12RawUsableTrigger || rawCurrentUsableTrigger;
    const sameSidePosition = positionSide !== 0 && triggerSide === positionSide;
    const reentryBlocked = actionableEntry && validTriggerStop && effectiveEntryCooldownOk && (!nonConsensusCooldownOk || !freshAfterNonConsensus);
    const nonConsensusWarning = thesisBrokenSignal && !thesisBrokenConfirmed;
    const invalidTriggerSetup = preQualityActionable && !validTriggerStop;
    const topUpBlockedStop = (promotionTopUpIntent || continuationTopUpIntent) && !stopLockedBeyondEntry;
    const topUpBlockedPyramid = (promotionTopUpIntent || continuationTopUpIntent) && stopLockedBeyondEntry && !topUpPyramidOk;
    const topUpBlockedCap = (promotionTopUpIntent || continuationTopUpIntent) && stopLockedBeyondEntry && topUpPyramidOk && !topUpCapacityOk;
    const topUpBlockedQty = (promotionTopUpIntent || continuationTopUpIntent) && stopLockedBeyondEntry && topUpPyramidOk && topUpCapacityOk && !topUpHasQty;
    let entryActionText = entryMode;
    if (nonConsensusWarning) entryActionText = "NON_CONS_MONITOR";
    else if (topUpReady) entryActionText = "ADD_OK";
    else if (topUpBlockedStop) entryActionText = "LOCK_WAIT";
    else if (topUpBlockedPyramid) entryActionText = "PYRAMID_WAIT";
    else if (topUpBlockedCap) entryActionText = "CAP_WAIT";
    else if (topUpBlockedQty) entryActionText = "ZERO_QTY";
    else if (triggerTrapWait && (hasTrigger || rawHasTrigger)) entryActionText = "TRAP_WAIT";
    else if (h12ReadinessBlocked) entryActionText = "HTF_STRETCHED_WAIT";
    else if (h4NoiseWait) entryActionText = "H4_NOISE_WAIT";
    else if (reentryBlocked) entryActionText = "WAIT_REENTRY";
    else if (h12DuplicateBlocked || h12AlreadyProcessed) entryActionText = "HTF_DUPLICATE";
    else if (h4OriginFlowBlocked) entryActionText = "H4_FIRST_WAIT";
    else if (postThesisBreakSameSideBlocked) entryActionText = "THESIS_REBUILD_WAIT";
    else if (invalidTriggerSetup) entryActionText = "INVALID_SL";
    else if (!qualityOk && preQualityActionable && validTriggerStop && !softLowQualitySetup) entryActionText = "LOW_QUALITY";
    else if (softLowQualitySetup) entryActionText = "SOFT_LOW_QUALITY";
    else if (flatEntryReady && (h4D2SoftProbe || h4D2Override)) entryActionText = "H4_D2_GATE";
    else if (flatEntryReady) entryActionText = entryMode;
    else if (h4Pullback) entryActionText = "PULLBACK";
    else if (trendHold) entryActionText = "TREND_HOLD";
    else if (h4WarningOnly && positionSide !== 0) entryActionText = "H4_WARNING";
    else if (h4D2SoftProbe || h4D2Override) entryActionText = "H4_D2_GATE";

    let entryReasonCode = entryMode;
    if (nonConsensusWarning) entryReasonCode = "WARN_THESIS_BREAK";
    else if (topUpReady) entryReasonCode = promotionTopUpReady ? `ENTER_TOPUP_PROMOTION_${thesisFrameLabel(promotionTargetLevel)}` : continuationTopUpReady ? `ENTER_TOPUP_CONT_${thesisFrameLabel(currentThesisAddLevel)}` : "ENTER_TOPUP_CONFIRMED";
    else if (topUpBlockedStop) entryReasonCode = "BLOCK_STOP_UNLOCKED";
    else if (topUpBlockedPyramid) entryReasonCode = "BLOCK_PYRAMID";
    else if (topUpBlockedCap) entryReasonCode = "BLOCK_CAP_USAGE";
    else if (topUpBlockedQty) entryReasonCode = "BLOCK_ZERO_QTY";
    else if (triggerTrapWait && (hasTrigger || rawHasTrigger)) entryReasonCode = "BLOCK_TRAP_WAIT";
    else if (h12ReadinessBlocked) entryReasonCode = "BLOCK_H12_STRETCHED";
    else if (h4NoiseWait) entryReasonCode = "BLOCK_H4_NOISE";
    else if (reentryBlocked) entryReasonCode = "BLOCK_REENTRY_COOLDOWN";
    else if (h12DuplicateBlocked || h12AlreadyProcessed) entryReasonCode = "BLOCK_DUP_H12";
    else if (h4OriginFlowBlocked) entryReasonCode = "BLOCK_H4_FIRST_FLOW";
    else if (postThesisBreakSameSideBlocked) entryReasonCode = "BLOCK_POST_THESIS_BREAK_SAME_SIDE";
    else if (invalidTriggerSetup) entryReasonCode = "BLOCK_INVALID_SL";
    else if (!qualityOk && preQualityActionable && validTriggerStop && !softLowQualitySetup) entryReasonCode = "BLOCK_LOW_QUALITY";
    else if (softLowQualitySetup) entryReasonCode = `ENTER_SOFT_${triggerTf}_${triggerSide === 1 ? "BUY" : "SELL"}`;
    else if (flatEntryReady) entryReasonCode = `ENTER_${triggerTf}_${triggerSide === 1 ? "BUY" : "SELL"}`;
    else if (h4Pullback) entryReasonCode = "HOLD_PULLBACK";
    else if (trendHold) entryReasonCode = "HOLD_TREND";
    else if (h4WarningOnly && positionSide !== 0) entryReasonCode = "WARN_H4_COUNTER";
    else if (!rawHasTrigger) entryReasonCode = "NO_TRIGGER";
    else if (positionSide !== 0 && oppositePosition) entryReasonCode = "BLOCK_OPPOSITE_POSITION";
    else if (positionSide !== 0 && sameSidePosition) entryReasonCode = "HOLD_SAME_SIDE";
    else if (actionableEntry && !effectiveEntryCooldownOk) entryReasonCode = "BLOCK_FLAT_COOLDOWN";
    else if (actionableEntry && !freshAfterNonConsensus) entryReasonCode = "BLOCK_NEEDS_FRESH_TRIGGER";
    else if (actionableEntry && (entryQty == null || entryQty <= 0)) entryReasonCode = "BLOCK_ZERO_QTY";
    else if (actionableEntry) entryReasonCode = "BLOCK_TRIGGER_NOT_READY";

    let entryReasonDetail = triggerText;
    if (flatEntryReady) entryReasonDetail = `${triggerText} | SL ${formatTradePrice(triggerStop)} ${triggerStopRef}`;
    else if (topUpReady && promotionTopUpReady) entryReasonDetail = `${topUpTriggerText} | SL ${formatTradePrice(positionActiveStop)} ${positionTrailRef}`;
    else if (topUpReady && continuationTopUpReady) entryReasonDetail = `continue -> ${thesisFrameLabel(currentThesisAddLevel)} | ${continuationH4TriggerText} | risk ${topUpRiskPct.toFixed(1)}%`;
    else if (nonConsensusWarning) entryReasonDetail = `${thesisFrameLabel(thesisFrameLevel)} break ${thesisBrokenBars}/${thesisBreakRequiredBars} | ${thesisBrokenReason}`;
    else if (topUpBlockedStop) entryReasonDetail = "SL not locked beyond entry";
    else if (topUpBlockedPyramid) entryReasonDetail = `open legs ${openThesisLegs}/${maxOpenThesisLegs}`;
    else if (topUpBlockedCap) entryReasonDetail = "capital usage cap reached";
    else if (topUpBlockedQty) entryReasonDetail = "top-up qty 0";
    else if (h12DuplicateBlocked || h12AlreadyProcessed) entryReasonDetail = `H12@${h12.triggerTime ?? "-"}`;
    else if (h4OriginFlowBlocked) entryReasonDetail = "flat account waits H4 origin first";
    else if (postThesisBreakSameSideBlocked) entryReasonDetail = `wait opposite after ${thesisFrameLabel(postThesisBreakFrameLevel)} thesis break`;
    else if (!qualityOk && preQualityActionable && validTriggerStop) entryReasonDetail = `Q ${triggerQualityScore}/${STRATEGY_CONFIG.minQualityScore} gap ${qualityGap}`;
    else if (invalidTriggerSetup) entryReasonDetail = "SL -";
    else if (actionableEntry && !effectiveEntryCooldownOk) entryReasonDetail = `exit@${lastExitIndex ?? "-"}`;
    else if (actionableEntry && !freshAfterNonConsensus) entryReasonDetail = "need_fresh_after_non_cons";
    else if (positionSide !== 0) entryReasonDetail = `pos ${positionSide === 1 ? "LONG" : "SHORT"} ${thesisFrameLabel(thesisFrameLevel)}`;

    if (rawHasTrigger && lastSignalIndex !== index) {
      lastSignalReasonCode = entryReasonCode;
      lastSignalReasonDetail = entryReasonDetail;
      lastSignalActionText = entryActionText;
      lastSignalTriggerText = triggerText;
      lastSignalIndex = index;
    }
    const useLastThesisBreak = positionSide === 0 && lastThesisBreakIndex != null && (lastSignalIndex == null || lastThesisBreakIndex >= lastSignalIndex);
    const panelReasonCode = nonConsensusWarning ? entryReasonCode : rawHasTrigger ? entryReasonCode : useLastThesisBreak ? `LAST_${lastThesisBreakCode}` : lastSignalIndex != null ? `LAST_${lastSignalReasonCode}` : entryReasonCode;
    const panelReasonDetail = nonConsensusWarning ? entryReasonDetail : rawHasTrigger ? entryReasonDetail : useLastThesisBreak ? `bar ${lastThesisBreakIndex} | ${lastThesisBreakDetail}` : lastSignalIndex != null ? `bar ${lastSignalIndex} | ${lastSignalTriggerText} | ${lastSignalActionText}` : entryReasonDetail;
    const panelStopPrice = positionSide !== 0 ? positionActiveStop : triggerStop;
    const panelStopRef = positionSide !== 0 ? positionTrailRef : triggerStopRef;
    recordStatus(index, {
      currentPanelState: semanticStateShort(current.semanticState),
      currentBias: current.bias,
      currentRsi: current.rsi,
      currentEma: current.ema,
      currentWma: current.wma,
      currentPoint: current.point,
      currentSide: current.side,
      currentTrap: current.trap,
      currentNoiseState: current.noiseState,
      currentH4MidNoiseState: current.h4MidNoiseState,
      currentBuy2ClassicEvent: current.buy2ClassicEvent,
      currentBuy3ClassicEvent: current.buy3ClassicEvent,
      currentSell2ClassicEvent: current.sell2ClassicEvent,
      currentSell3ClassicEvent: current.sell3ClassicEvent,
      h12PanelState: semanticStateShort(h12.semanticState),
      h12Bias: h12.bias,
      h12Rsi: h12.rsi,
      h12Ema: h12.ema,
      h12Wma: h12.wma,
      h12Point: h12.point,
      h12Side: h12.side,
      h12TriggerCode: h12.triggerCode,
      h12TriggerTime: h12.triggerTime,
      h12ReadinessScore: h12.readinessScore,
      h12ReadinessCode: h12.readinessCode,
      d1PanelState: semanticStateShort(d1.semanticState),
      d1Bias: d1.bias,
      d1Rsi: d1.rsi,
      d1Ema: d1.ema,
      d1Wma: d1.wma,
      d1Point: d1.point,
      d1Side: d1.side,
      d1TriggerCode: d1.triggerCode,
      d1TriggerTime: d1.triggerTime,
      d1ReadinessScore: d1.readinessScore,
      d1ReadinessCode: d1.readinessCode,
      d2PanelState: semanticStateShort(d2.semanticState),
      d2Rsi: d2.rsi,
      d2Ema: d2.ema,
      d2Wma: d2.wma,
      d2Point: d2.point,
      d2Side: d2.side,
      d2TriggerCode: d2.triggerCode,
      d2TriggerTime: d2.triggerTime,
      d2ReadinessScore: d2.readinessScore,
      d2ReadinessCode: d2.readinessCode,
      mtfState,
      d2Regime,
      d2Bias: d2.bias,
      triggerText,
      triggerTf,
      triggerSide,
      triggerCode,
      triggerStop,
      triggerStopRef,
      triggerSlPct,
      triggerQualityScore,
      qualityOk,
      qualityGap,
      softLowQualitySetup,
      lowQualitySetup,
      h12ReadinessBlocked,
      h12DuplicateBlocked,
      h4D2SoftProbe,
      h4D2Override,
      h4OppositeTrigger,
      h12OppositeTrigger,
      h4AgainstPosition,
      h12AgainstPosition,
      d2RegimeForPosition,
      d2AgainstPosition,
      h12TrendAligned,
      trendHold,
      h4Pullback,
      h4WarningOnly,
      entryMode,
      entryActionText,
      entryReasonCode,
      entryReasonDetail,
      panelReasonCode,
      panelReasonDetail,
      panelStopText: panelStopPrice == null ? "-" : `${formatTradePrice(panelStopPrice)}${panelStopRef !== "-" ? ` ${panelStopRef}` : ""}`,
      thesisBrokenReason,
      thesisFrameState: semanticStateShort(thesisState),
      thesisFrameSide: thesisSide,
      thesisFrameTier: thesisTier,
      thesisFamilyBroken,
      thesisStrengthBroken,
      thesisBrokenSignal,
      thesisBreakRequiredBars,
      thesisBrokenConfirmed,
      rawHasTrigger,
      actionableEntry,
      flatEntryReady,
      topUpReady
    });

    if (topUpReady && topUpEntrySide !== 0 && topUpQty != null && topUpQty > 0) {
      const code = `${topUpEntrySide === 1 ? "B" : "S"}${Math.abs(continuationH4TriggerCode || triggerCode) === 4 ? "2" : "3"}`;
      const topUpFillPrice = applyStrategySlippage(candle.close, topUpEntrySide);
      const topUpCommission = applyEntryCommission(topUpFillPrice, topUpQty);
      orders.push({
        time: candle.time,
        position: topUpEntrySide === 1 ? "belowBar" : "aboveBar",
        color: topUpEntrySide === 1 ? "#57d16b" : "#ff7a7a",
        shape: topUpEntrySide === 1 ? "arrowUp" : "arrowDown",
        text: `ADD ${code}`,
        action: "entry",
        price: topUpFillPrice,
        triggerPrice: candle.close,
        qty: topUpQty,
        commission: topUpCommission,
        equity,
        detail: `${topUpCommentPrefix}${topUpTriggerText} ${topUpRiskPct.toFixed(1)}%`,
        size: 1
      });
      addToPosition(topUpQty, topUpFillPrice);
      openThesisLegs = Math.min(openThesisLegs + 1, maxOpenThesisLegs);
      positionRiskPct = fullRiskPct;
      thesisStage = 2;
      thesisFrameLevel = Math.max(thesisFrameLevel, promotionTopUpReady ? promotionTargetLevel : currentThesisAddLevel);
      thesisRequiredTier = Math.max(thesisRequiredTier, 2);
      thesisBrokenBars = 0;
      lastPositionEntryIndex = index;
      if (promotionTopUpReady) lastPromotionAddLevel = Math.max(lastPromotionAddLevel, promotionTargetLevel);
      if (continuationTopUpReady) {
        if (currentThesisAddLevel === 3) continuationAddsD1 += 1;
        else if (currentThesisAddLevel === 2) continuationAddsH12 += 1;
        else continuationAddsH4 += 1;
      }
      if (triggerTf === "H12") lastProcessedH12TriggerTime = h12.triggerTime;
    }

    if (flatEntryReady) {
      const code = `${triggerSide === 1 ? "B" : "S"}${Math.abs(triggerCode) === 4 ? "2" : "3"}`;
      const entryFillPrice = applyStrategySlippage(candle.close, triggerSide);
      const entryCommission = applyEntryCommission(entryFillPrice, entryQty);
      orders.push({ time: candle.time, position: triggerSide === 1 ? "belowBar" : "aboveBar", color: triggerSide === 1 ? "#304cff" : "#d000ff", shape: triggerSide === 1 ? "arrowUp" : "arrowDown", text: `${triggerSide === 1 ? "L" : "S"} ${code}`, action: "entry", price: entryFillPrice, triggerPrice: candle.close, qty: entryQty, commission: entryCommission, equity, detail: `${entryMode} ${triggerText}`, size: 1 });
      positionSide = triggerSide;
      positionQty = entryQty;
      positionAvgPrice = entryFillPrice;
      pendingStopAnchor = triggerStop;
      pendingTrailRef = triggerStopRef;
      pendingRiskPct = entryRiskPct;
      positionStopAnchor = pendingStopAnchor;
      positionActiveStop = pendingStopAnchor;
      positionTrailRef = pendingTrailRef;
      positionRiskPct = pendingRiskPct == null ? fullRiskPct : pendingRiskPct;
      pendingStopAnchor = null;
      pendingTrailRef = "-";
      pendingRiskPct = null;
      thesisStage = entryMode === "FULL ENTRY" ? 2 : 1;
      thesisFrameLevel = 1;
      thesisRequiredTier = 2;
      thesisBrokenBars = 0;
      lastPromotionAddLevel = 0;
      continuationAddsH4 = 0;
      continuationAddsH12 = 0;
      continuationAddsD1 = 0;
      openThesisLegs = 1;
      lastPositionEntryIndex = index;
      pendingReverseSide = 0;
      pendingReverseIndex = null;
      if (postThesisBreakLockActive && postThesisBreakBlockedSide !== triggerSide) {
        postThesisBreakLockActive = false;
        postThesisBreakBlockedSide = 0;
        postThesisBreakFrameLevel = 0;
      }
      if (triggerTf === "H12") lastProcessedH12TriggerTime = h12.triggerTime;
    }
  }

  return { orders, rsiMarkers, status: { ready: true, latest: latestStatus, history: statusHistory } };
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
  if (candles.length <= length) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / length;
  let avgLoss = losses / length;
  const firstRs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  result.push({
    time: candles[length].time,
    value: avgLoss === 0 ? avgGain === 0 ? 50 : 100 : 100 - 100 / (1 + firstRs)
  });

  for (let i = length + 1; i < candles.length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result.push({ time: candles[i].time, value: avgLoss === 0 ? avgGain === 0 ? 50 : 100 : 100 - (100 / (1 + rs)) });
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
    this.parityCandles = { h4: [], h12: [], d1: [], d2: [] };
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
    const requestedTf = normalizeSingleTfKey(queryParams().get("singleTf")) || localStorage.getItem("singleFrameTf") || "h12";
    this.config = SINGLE_FRAMES.find((frame) => frame.key === requestedTf) || SINGLE_FRAMES[3];
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
    this.parityPanelEl = document.querySelector('[data-role="single-parity-panel"]');
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
    this.rsiD2BgSeries = this.rsiChart.addHistogramSeries({
      base: 0,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.longStopSeries = this.rsiChart.addLineSeries({
      color: "rgba(255,77,90,0.70)",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Solid,
      priceScaleId: "stop",
      title: "Long Stop",
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.shortStopSeries = this.rsiChart.addLineSeries({
      color: "rgba(255,77,90,0.70)",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Solid,
      priceScaleId: "stop",
      title: "Short Stop",
      lastValueVisible: false,
      priceLineVisible: false
    });
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

  parityKlineUrl(interval, limit = 900) {
    return `${API}/api/v3/klines?symbol=${currentSymbol}&interval=${interval}&limit=${limit}`;
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

    const historyStart = STRATEGY_HISTORY_START_MS;
    const historyEnd = Date.now();
    const [raw, h4Raw, h12Raw, d1Raw] = await Promise.all([
      response.json(),
      fetchKlinesSince("4h", historyStart, historyEnd),
      fetchKlinesSince("12h", historyStart, historyEnd),
      fetchKlinesSince("1d", historyStart, historyEnd)
    ]);
    if (session !== singleSessionId) return;

    this.rawCandles = raw.map(toChartCandle);
    const d1Candles = d1Raw.map(toChartCandle);
    this.parityCandles = {
      h4: h4Raw.map(toChartCandle),
      h12: h12Raw.map(toChartCandle),
      d1: d1Candles,
      d2: aggregateCandlesByTime(d1Candles, 2, 24 * 60 * 60)
    };
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

  updateParityPanel(status) {
    if (!this.parityPanelEl) return;
    if (!status) {
      this.parityPanelEl.innerHTML = "";
      return;
    }
    const posText = status.positionSide === 1 ? "LONG" : status.positionSide === -1 ? "SHORT" : "FLAT";
    const lockText = status.positionSide === 0 ? "no" : status.positionSide === 1 && status.positionActiveStop != null && status.positionAvgPrice != null && status.positionActiveStop >= status.positionAvgPrice ? "yes" : status.positionSide === -1 && status.positionActiveStop != null && status.positionAvgPrice != null && status.positionActiveStop <= status.positionAvgPrice ? "yes" : "no";
    const rows = [
      ["STATE", status.currentPanelState || "-", "BIAS", status.currentBias === 1 ? "buy_bias" : status.currentBias === -1 ? "sell_bias" : "neutral"],
      ["H12", status.h12PanelState || "-", "D2", displayD2Regime(status.d2Regime)],
      ["ACTION", displayActionText(status.entryActionText), "THESIS", thesisPanelLabel(status.thesisStage, status.thesisFrameLevel)],
      ["TRIGGER", displayTriggerText(status.triggerText), "SL", status.panelStopText || "-"],
      ["LOCK", lockText, "POS", posText],
      ["REASON", status.panelReasonCode || status.entryReasonCode || "-", "MTF", displayMtfState(status.mtfState)]
    ];
    this.parityPanelEl.innerHTML = rows.flatMap(([a, b, c, d]) => [
      `<span class="single-parity-cell single-parity-key">${escapeHtml(a)}</span>`,
      `<span class="single-parity-cell single-parity-value ${parityTone(b)}" title="${escapeHtml(b)}">${escapeHtml(b)}</span>`,
      `<span class="single-parity-cell single-parity-key">${escapeHtml(c)}</span>`,
      `<span class="single-parity-cell single-parity-value ${parityTone(d)}" title="${escapeHtml(d)}">${escapeHtml(d)}</span>`
    ]).join("");
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
    const parityCore = this.config.key === "h4" && this.parityCandles.h4.length && this.parityCandles.h12.length && this.parityCandles.d1.length && this.parityCandles.d2.length
      ? computeV17ParityEvents(this.parityCandles.h4, this.parityCandles.h12, this.parityCandles.d1, this.parityCandles.d2)
      : null;
    const orderSource = parityCore ? parityCore.orders : strategyCore.orders;
    const signalMarkers = parityCore?.rsiMarkers || strategyCore.markers;
    const orderDisplayMarkers = strategyOrderDisplayMarkers(orderSource);
    const tradeSummary = buildClosedTradesFromOrders(orderSource);
    const tradeLegSummary = buildClosedTradeLegsFromOrders(orderSource);
    const chartStartTime = candles[0]?.time ?? 0;
    const chartEndTime = candles.at(-1)?.time ?? Number.POSITIVE_INFINITY;
    const visibleOrderDisplayMarkers = snapMarkersToCandles(orderDisplayMarkers.filter((order) => order.time >= chartStartTime && order.time <= chartEndTime), candles);
    const visibleSignalMarkers = signalMarkers.filter((marker) => marker.time >= chartStartTime && marker.time <= chartEndTime);
    const visibleStatusHistory = (parityCore?.status?.history || []).filter((status) => status.time >= chartStartTime && status.time <= chartEndTime);
    if (queryParams().has("debugStrategy")) {
      window.__singleStrategyDebug = {
        timeframe: this.config.label,
        candles,
        parityCandles: this.parityCandles,
        parityCore,
        strategyCore,
        orderSource,
        tradeSummary,
        tradeLegSummary,
        visibleOrderDisplayMarkers,
        visibleSignalMarkers,
        visibleStatusHistory
      };
      document.body.dataset.singleOrdersDebug = JSON.stringify(orderSource.map((order) => ({
        time: order.time,
        text: order.text,
        action: order.action,
        price: order.price,
        triggerPrice: order.triggerPrice,
        qty: order.qty,
        commission: order.commission,
        equity: order.equity,
        detail: order.detail,
        position: order.position
      })));
      document.body.dataset.singleOrderDisplayDebug = JSON.stringify(orderDisplayMarkers.map((order) => ({
        time: order.time,
        text: order.text,
        action: order.action,
        color: order.color,
        shape: order.shape,
        position: order.position,
        size: order.size
      })));
      document.body.dataset.singleParityHistoryDebug = JSON.stringify({
        start: STRATEGY_HISTORY_START_MS / 1000,
        h4: this.parityCandles.h4.length,
        h12: this.parityCandles.h12.length,
        d1: this.parityCandles.d1.length,
        d2: this.parityCandles.d2.length,
        visibleOrders: visibleOrderDisplayMarkers.length,
        visibleSignals: visibleSignalMarkers.length,
        visibleFrom: chartStartTime,
        visibleTo: chartEndTime,
        totalOrders: orderSource.length
      });
      document.body.dataset.singleClosedTradesDebug = JSON.stringify({
        closedCount: tradeSummary.closed.length,
        open: tradeSummary.open,
        closed: tradeSummary.closed
      });
      document.body.dataset.singleClosedTradeLegsDebug = JSON.stringify({
        closedCount: tradeLegSummary.closed.length,
        openCount: tradeLegSummary.open.length,
        open: tradeLegSummary.open,
        closed: tradeLegSummary.closed
      });
      document.body.dataset.singleStatusDebug = JSON.stringify(parityCore?.status?.history || []);
      document.body.dataset.singleStrategyConfigFingerprint = strategyConfigFingerprint();
      document.body.dataset.singleRsiMarkersDebug = JSON.stringify((parityCore?.rsiMarkers || signalMarkers).map((item) => ({
        time: item.time,
        text: item.text,
        color: item.color,
        position: item.position,
        shape: item.shape
      })));
      document.body.dataset.singleStopPlotsDebug = JSON.stringify({
        long: stopPlotData(parityCore?.status?.history || [], 1),
        short: stopPlotData(parityCore?.status?.history || [], -1)
      });
      if (parityCore && queryParams().has("debugExperiments")) {
        document.body.dataset.singleStrategyExperimentsDebug = JSON.stringify(buildStrategyDebugExperiments(this.parityCandles));
      }
    }
    if (SHOW_DRAFT_STRATEGY_ORDERS) mergeTradeHistory(currentSymbol, this.config.label, orderSource);
    const latestEntry = SHOW_DRAFT_STRATEGY_ORDERS ? orderSource.filter((order) => order.action === "entry").at(-1) : null;
    const rsiState = detectRsiState(rsiData, rsiEmaData, rsiWmaData, signalMarkers);
    const strategy = parityCore
      ? {
          tone: latestEntry ? latestEntry.position === "belowBar" ? "buy" : "sell" : "wait",
          label: "V17 WIP",
          detail: latestEntry ? `Parity port: ${latestEntry.detail || latestEntry.text}` : strategyConfigFingerprint()
        }
      : !STRATEGY_PARITY_READY && SHOW_DRAFT_STRATEGY_ORDERS
      ? {
          tone: latestEntry ? latestEntry.position === "belowBar" ? "buy" : "sell" : "wait",
          label: "APPROX",
          detail: latestEntry ? `Draft orders: ${latestEntry.detail || latestEntry.text}` : "Draft JS orders, not v17 parity"
        }
      : !STRATEGY_PARITY_READY
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
    this.candleSeries.setMarkers(SHOW_DRAFT_STRATEGY_ORDERS && layerState.orders ? visibleOrderDisplayMarkers : []);
    this.currentPriceSeries.setData(currentPriceLineData(candles, this.config));
    this.baselineSeries.setData(layerState.baseline ? baseline : []);
    this.slowBaselineSeries.setData(layerState.slowBaseline ? slowBaseline : []);
    this.vwapSeries.setData(layerState.vwap ? vwapData : []);
    this.rsiD2BgSeries.setData(parityCore ? d2BackgroundData(visibleStatusHistory) : []);
    this.longStopSeries.setData(parityCore ? stopPlotData(visibleStatusHistory, 1) : []);
    this.shortStopSeries.setData(parityCore ? stopPlotData(visibleStatusHistory, -1) : []);
    this.rsiSeries.setData(layerState.rsi ? rsiColorData(rsiData) : []);
    this.rsiEmaSeries.setData(layerState.rsiEma ? rsiEmaData : []);
    this.rsiWmaSeries.setData(layerState.rsiWma ? rsiWmaData : []);
    this.rsiSeries.setMarkers(layerState.signals ? visibleSignalMarkers : []);
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
    this.updateParityPanel(parityCore?.status?.latest || null);

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

function normalizeSingleTfKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const aliases = {
    "1h": "h1",
    h1: "h1",
    "2h": "h2",
    h2: "h2",
    "4h": "h4",
    h4: "h4",
    "12h": "h12",
    h12: "h12",
    "1d": "d1",
    d1: "d1",
    daily: "d1",
    "2d": "d2",
    d2: "d2",
    "3d": "d3",
    d3: "d3",
    w: "w1",
    "1w": "w1",
    w1: "w1",
    "2w": "w2",
    w2: "w2",
    m: "m1",
    "1m": "m1",
    m1: "m1"
  };
  return aliases[normalized] || "";
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
  applyStrategyUrlOverrides();
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

