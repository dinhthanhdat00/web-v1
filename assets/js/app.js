const API = "https://api.binance.com";
const WS_BASE = "wss://stream.binance.com:9443/ws";
const TIMEZONE_OFFSET_SECONDS = 7 * 60 * 60;
const VISIBLE_BARS = 40;
const RSI_LENGTH = 14;
const RSI_EMA_LENGTH = 9;
const RSI_WMA_LENGTH = 45;
const RSI_LOW_LEVEL = 20;
const RSI_HIGH_LEVEL = 80;
const RSI_LOW_COLOR = "#8b0000";
const RSI_HIGH_COLOR = "#ff2bd6";
const TV_BG = "#131722";
const TV_BG_DARK = "#10141f";
const TV_BORDER = "#2a2e39";
const TV_GRID = "rgba(42,46,57,0.65)";
const TV_TEXT = "#787b86";
const TV_GREEN = "#26a69a";
const TV_RED = "#ef5350";
const SINGLE_BG = "#0f0f10";
const SINGLE_PANEL_BG = "#101010";
const SINGLE_GRID = "rgba(255,255,255,0.055)";
const SINGLE_TEXT = "#b8b8b8";
const SINGLE_UP = "#58d15f";
const SINGLE_DOWN = "#d9d9d9";
const SINGLE_RSI_HEIGHT_KEY = "singleChartRsiHeight";
const SINGLE_RSI_DEFAULT_HEIGHT = 170;
const SINGLE_RSI_MIN_HEIGHT = 90;
const SINGLE_RSI_MAX_RATIO = 0.72;
const SINGLE_TRENDLINES_KEY = "singleChartTrendlinesV1";
const SEMANTIC = {
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
const PINE_RULES = {
  noiseLookback: 7,
  noiseCrossCount: 3,
  iiTo3WindowBars: 2,
  stateFreshBars: 1,
  staleStateBars: 5,
  trapHighLevel: 80,
  trapLowLevel: 20,
  allowDirectITriggers: false,
  requireStrictFormSequence: false,
  filterPointsByEmaWmaTrend: false
};

const FRAMES = [
  { key: "h4", label: "4h", apiTf: "4h", wsTf: "4h", aggregate: 1, limit: 360 },
  { key: "h12", label: "12h", apiTf: "12h", wsTf: "12h", aggregate: 1, limit: 360 },
  { key: "d1", label: "1D", apiTf: "1d", wsTf: "1d", aggregate: 1, limit: 360 },
  { key: "d2", label: "2D", apiTf: "1d", wsTf: "1d", aggregate: 2, limit: 720 }
];

const SINGLE_FRAMES = [
  { key: "h1", label: "H1", apiTf: "1h", wsTf: "1h", aggregate: 1, limit: 500 },
  { key: "h4", label: "H4", apiTf: "4h", wsTf: "4h", aggregate: 1, limit: 500 },
  { key: "h12", label: "H12", apiTf: "12h", wsTf: "12h", aggregate: 1, limit: 500 },
  { key: "d1", label: "D1", apiTf: "1d", wsTf: "1d", aggregate: 1, limit: 500 },
  { key: "d2", label: "D2", apiTf: "1d", wsTf: "1d", aggregate: 2, limit: 900 },
  { key: "d3", label: "D3", apiTf: "1d", wsTf: "1d", aggregate: 3, limit: 900 },
  { key: "w", label: "W", apiTf: "1w", wsTf: "1w", aggregate: 1, limit: 500 }
];

let currentSymbol = "BTCUSDT";
let sessionId = 0;
let tickerWs = null;
let singlePanel = null;
let sharedD2State = [];
let activeViewKey = "chart";
let resizeFrame = null;
const panels = new Map();
const rsiOnlyPanels = new Map();
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const layerState = {
  baseline: true,
  slowBaseline: true,
  vwap: true,
  vwapMonth: true,
  rsi: true,
  rsiEma: true,
  rsiWma: true
};

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

function timeframeSeconds(config) {
  const raw = config.wsTf || config.apiTf || "";
  const match = raw.match(/^(\d+)([mhdw])$/i);
  if (!match) return 0;

  const value = Number(match[1]) || 1;
  const unit = match[2].toLowerCase();
  const base = unit === "m" ? 60 : unit === "h" ? 3600 : unit === "d" ? 86400 : unit === "w" ? 604800 : 0;
  return base * value * (config.aggregate || 1);
}

function formatCountdown(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (days > 0) return `${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`;
  if (hours > 0) return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`;
  return `${pad2(minutes)}:${pad2(secs)}`;
}

function secondsUntilCandleClose(config, nowSeconds = Date.now() / 1000) {
  const tfSeconds = timeframeSeconds(config);
  if (!tfSeconds) return 0;
  const elapsed = Math.floor(nowSeconds) % tfSeconds;
  return elapsed === 0 ? tfSeconds : tfSeconds - elapsed;
}

function createCountdownNode(parent, compact = false) {
  const node = document.createElement("span");
  node.className = compact ? "candle-countdown compact" : "candle-countdown";
  node.textContent = "--:--";
  parent?.appendChild(node);
  return node;
}

function updateCountdownNode(node, config) {
  if (!node) return;
  const remaining = secondsUntilCandleClose(config);
  node.textContent = formatCountdown(remaining);
  node.classList.toggle("soon", remaining <= 5 * 60);
}

function chartOptions(background = TV_BG) {
  return {
    layout: {
      background: { color: background },
      textColor: TV_TEXT,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif'
    },
    grid: {
      vertLines: { color: TV_GRID },
      horzLines: { color: TV_GRID }
    },
    rightPriceScale: {
      borderColor: TV_BORDER,
      scaleMargins: {
        top: 0.12,
        bottom: 0.08
      }
    },
    timeScale: {
      borderColor: TV_BORDER,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 4,
      barSpacing: 8,
      fixLeftEdge: false,
      lockVisibleTimeRangeOnResize: true,
      tickMarkFormatter: formatTickTime
    },
    localization: {
      locale: "vi-VN",
      timeFormatter: formatChartTime
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: "rgba(120,123,134,0.75)", style: 3, width: 1 },
      horzLine: { color: "rgba(120,123,134,0.75)", style: 3, width: 1 }
    }
  };
}

function singleChartOptions(background = SINGLE_BG) {
  const options = chartOptions(background);
  options.layout.textColor = SINGLE_TEXT;
  options.grid.vertLines.color = SINGLE_GRID;
  options.grid.horzLines.color = SINGLE_GRID;
  options.rightPriceScale.borderColor = "rgba(255,255,255,0.12)";
  options.rightPriceScale.scaleMargins = {
    top: 0.08,
    bottom: 0.18
  };
  options.timeScale.borderColor = "rgba(255,255,255,0.12)";
  options.timeScale.rightOffset = 52;
  options.timeScale.barSpacing = 6;
  options.crosshair.vertLine.color = "rgba(210,210,210,0.45)";
  options.crosshair.horzLine.color = "rgba(210,210,210,0.45)";
  return options;
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
    borderColor: TV_BORDER,
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

function klineUrlFor(interval, limit = 500) {
  return `${API}/api/v3/klines?symbol=${currentSymbol}&interval=${interval}&limit=${limit}`;
}

async function loadSharedD2State() {
  const response = await fetch(klineUrlFor("1d", 1000));
  if (!response.ok) throw new Error(`D2 background HTTP ${response.status}`);

  const raw = await response.json();
  return pineRsiFrameState(aggregateDailyCandles(raw.map(toChartCandle), 2));
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

function aggregateDailyCandles(source, dayCount) {
  if (dayCount <= 1) return source.slice();

  const secondsPerDay = 24 * 60 * 60;
  const buckets = new Map();
  source.forEach((candle) => {
    const bucket = Math.floor(candle.time / (secondsPerDay * dayCount));
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(candle);
  });

  return Array.from(buckets.values()).map((group) => ({
    time: group[0].time,
    open: group[0].open,
    high: Math.max(...group.map((c) => c.high)),
    low: Math.min(...group.map((c) => c.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((sum, c) => sum + c.volume, 0)
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

function previousValue(points, index, key = "value") {
  return index > 0 && Number.isFinite(points[index - 1]?.[key]) ? points[index - 1][key] : points[index]?.[key];
}

function crossedUp(values, signal, index) {
  if (index <= 0) return false;
  const prevValue = values[index - 1]?.value;
  const currValue = values[index]?.value;
  const prevSignal = signal[index - 1]?.value;
  const currSignal = signal[index]?.value;
  return [prevValue, currValue, prevSignal, currSignal].every(Number.isFinite) && prevValue <= prevSignal && currValue > currSignal;
}

function crossedDown(values, signal, index) {
  if (index <= 0) return false;
  const prevValue = values[index - 1]?.value;
  const currValue = values[index]?.value;
  const prevSignal = signal[index - 1]?.value;
  const currSignal = signal[index]?.value;
  return [prevValue, currValue, prevSignal, currSignal].every(Number.isFinite) && prevValue >= prevSignal && currValue < currSignal;
}

function pivotHigh(points, index) {
  if (index < 2) return null;
  const left = points[index - 2]?.value;
  const mid = points[index - 1]?.value;
  const right = points[index]?.value;
  return [left, mid, right].every(Number.isFinite) && mid > left && mid > right ? mid : null;
}

function pivotLow(points, index) {
  if (index < 2) return null;
  const left = points[index - 2]?.value;
  const mid = points[index - 1]?.value;
  const right = points[index]?.value;
  return [left, mid, right].every(Number.isFinite) && mid < left && mid < right ? mid : null;
}

function trapCode(rsiValue, noiseState) {
  if (noiseState) return 2;
  if (rsiValue >= PINE_RULES.trapHighLevel) return 1;
  if (rsiValue <= PINE_RULES.trapLowLevel) return -1;
  return 0;
}

function semanticBiasCode(stateCode) {
  if (stateCode === SEMANTIC.BUY_I) return -1;
  if (stateCode === SEMANTIC.BUY_1 || stateCode === SEMANTIC.BUY_2 || stateCode === SEMANTIC.BUY_3 || stateCode === SEMANTIC.BUY_STALE) return 1;
  if (stateCode === SEMANTIC.SELL_I) return 1;
  if (stateCode === SEMANTIC.SELL_1 || stateCode === SEMANTIC.SELL_2 || stateCode === SEMANTIC.SELL_3 || stateCode === SEMANTIC.SELL_STALE) return -1;
  return 0;
}

function resolveSemanticState(prevState, familySide, pointHint, aboveBothFlag, belowBothFlag, linesExpandingFlag, spreadShrinkingFlag, noiseFlag, trapFlag, buyConvergingFlag, sellConvergingFlag, rsiVal, emaVal, wmaVal, stateAgeBars) {
  if (familySide === 0) return prevState === SEMANTIC.INIT ? SEMANTIC.INIT : SEMANTIC.NEUTRAL_REARM;

  if (noiseFlag) {
    if (familySide === 1) {
      return [SEMANTIC.BUY_1, SEMANTIC.BUY_2, SEMANTIC.BUY_3, SEMANTIC.BUY_STALE].includes(prevState) ? SEMANTIC.BUY_STALE : SEMANTIC.NEUTRAL_REARM;
    }
    return [SEMANTIC.SELL_1, SEMANTIC.SELL_2, SEMANTIC.SELL_3, SEMANTIC.SELL_STALE].includes(prevState) ? SEMANTIC.SELL_STALE : SEMANTIC.NEUTRAL_REARM;
  }

  if (familySide === 1) {
    if (trapFlag === -1 && pointHint <= 2) return SEMANTIC.BUY_TRAP_WAIT;
    if (belowBothFlag && linesExpandingFlag) return SEMANTIC.BUY_I;
    if (belowBothFlag && buyConvergingFlag) return SEMANTIC.BUY_II;
    if (aboveBothFlag) return stateAgeBars > PINE_RULES.staleStateBars && !linesExpandingFlag ? SEMANTIC.BUY_STALE : SEMANTIC.BUY_3;
    if (rsiVal > emaVal && rsiVal < wmaVal) {
      return prevState === SEMANTIC.BUY_3 || prevState === SEMANTIC.BUY_2 || prevState === SEMANTIC.BUY_STALE || pointHint >= 4 || (prevState === SEMANTIC.BUY_1 && stateAgeBars > 0) ? SEMANTIC.BUY_2 : SEMANTIC.BUY_1;
    }
    if (stateAgeBars > PINE_RULES.staleStateBars && (spreadShrinkingFlag || !linesExpandingFlag)) return SEMANTIC.BUY_STALE;
    return SEMANTIC.BUY_II;
  }

  if (trapFlag === 1 && pointHint <= 2) return SEMANTIC.SELL_TRAP_WAIT;
  if (aboveBothFlag && linesExpandingFlag) return SEMANTIC.SELL_I;
  if (aboveBothFlag && sellConvergingFlag) return SEMANTIC.SELL_II;
  if (belowBothFlag) return stateAgeBars > PINE_RULES.staleStateBars && !linesExpandingFlag ? SEMANTIC.SELL_STALE : SEMANTIC.SELL_3;
  if (rsiVal < emaVal && rsiVal > wmaVal) {
    return prevState === SEMANTIC.SELL_3 || prevState === SEMANTIC.SELL_2 || prevState === SEMANTIC.SELL_STALE || pointHint >= 4 || (prevState === SEMANTIC.SELL_1 && stateAgeBars > 0) ? SEMANTIC.SELL_2 : SEMANTIC.SELL_1;
  }
  if (stateAgeBars > PINE_RULES.staleStateBars && (spreadShrinkingFlag || !linesExpandingFlag)) return SEMANTIC.SELL_STALE;
  return SEMANTIC.SELL_II;
}

function pineRsiFrameState(candles) {
  const rsiData = rsi(candles, RSI_LENGTH);
  const emaData = emaFromValues(rsiData, RSI_EMA_LENGTH);
  const wmaData = wmaFromValues(rsiData, RSI_WMA_LENGTH);
  const emaByTime = valueMap(emaData);
  const wmaByTime = valueMap(wmaData);
  const rows = rsiData
    .map((point) => ({
      time: point.time,
      rsi: point.value,
      ema: emaByTime.get(point.time),
      wma: wmaByTime.get(point.time)
    }))
    .filter((row) => Number.isFinite(row.ema) && Number.isFinite(row.wma));

  let side = 0;
  let point = 0;
  let stateBar = null;
  let semanticState = SEMANTIC.INIT;
  let emaCrossCum = 0;
  let lastWmaUp = null;
  let lastWmaDown = null;
  const crossCumHistory = [];
  const rsiPoints = rows.map((item) => ({ value: item.rsi }));
  const emaPoints = rows.map((item) => ({ value: item.ema }));
  const wmaPoints = rows.map((item) => ({ value: item.wma }));

  return rows.map((row, index) => {
    const aboveBoth = row.rsi > row.ema && row.rsi > row.wma;
    const belowBoth = row.rsi < row.ema && row.rsi < row.wma;
    const betweenBoth = !aboveBoth && !belowBoth;
    const prevRsi = previousValue(rsiPoints, index);
    const prevEma = previousValue(emaPoints, index);
    const prevWma = previousValue(wmaPoints, index);
    const lineSpread = Math.max(Math.abs(row.rsi - row.ema), Math.abs(row.rsi - row.wma), Math.abs(row.ema - row.wma));
    const prevLineSpread = index > 0 ? Math.max(Math.abs(rows[index - 1].rsi - rows[index - 1].ema), Math.abs(rows[index - 1].rsi - rows[index - 1].wma), Math.abs(rows[index - 1].ema - rows[index - 1].wma)) : lineSpread;
    const spreadShrinking = lineSpread <= prevLineSpread;
    const linesExpanding = lineSpread > prevLineSpread;
    const rsiRising = row.rsi >= prevRsi;
    const rsiFalling = row.rsi <= prevRsi;
    const emaFlatUp = row.ema >= prevEma;
    const emaFlatDown = row.ema <= prevEma;
    const emaCrossUp = crossedUp(rsiPoints, emaPoints, index);
    const emaCrossDown = crossedDown(rsiPoints, emaPoints, index);
    const wmaCrossUp = crossedUp(rsiPoints, wmaPoints, index);
    const wmaCrossDown = crossedDown(rsiPoints, wmaPoints, index);

    if (wmaCrossUp) lastWmaUp = index;
    if (wmaCrossDown) lastWmaDown = index;
    if (emaCrossUp || emaCrossDown) emaCrossCum += 1;
    crossCumHistory[index] = emaCrossCum;

    const priorCrossCum = index - PINE_RULES.noiseLookback >= 0 ? crossCumHistory[index - PINE_RULES.noiseLookback] : 0;
    const emaCrossScore = emaCrossCum - priorCrossCum;
    const noiseState = emaCrossScore >= PINE_RULES.noiseCrossCount && betweenBoth;
    const peakVal = pivotHigh(rsiPoints, index);
    const troughVal = pivotLow(rsiPoints, index);
    const barsSinceWmaUp = lastWmaUp === null ? null : index - lastWmaUp;
    const barsSinceWmaDown = lastWmaDown === null ? null : index - lastWmaDown;
    const buyConverging = belowBoth && !linesExpanding && (spreadShrinking || rsiRising || emaFlatUp);
    const sellConverging = aboveBoth && !linesExpanding && (spreadShrinking || rsiFalling || emaFlatDown);
    const buyPointsAllowed = !PINE_RULES.filterPointsByEmaWmaTrend || row.ema < row.wma;
    const sellPointsAllowed = !PINE_RULES.filterPointsByEmaWmaTrend || row.ema > row.wma;
    const stateAgeBars = stateBar === null ? 0 : index - stateBar;
    const previewTrap = trapCode(row.rsi, noiseState);
    const previewSemanticState = resolveSemanticState(semanticState, side, point, aboveBoth, belowBoth, linesExpanding, spreadShrinking, noiseState, previewTrap, buyConverging, sellConverging, row.rsi, row.ema, row.wma, stateAgeBars);

    const switchToBuyI = belowBoth && linesExpanding && barsSinceWmaDown !== null && barsSinceWmaDown > 1 && (side !== 1 || point !== 1);
    const switchToSellI = aboveBoth && linesExpanding && barsSinceWmaUp !== null && barsSinceWmaUp > 1 && (side !== -1 || point !== 1);
    const buyIIEvent = buyPointsAllowed && side === 1 && point === 1 && buyConverging && (troughVal !== null || spreadShrinking);
    const sellIIEvent = sellPointsAllowed && side === -1 && point === 1 && sellConverging && (peakVal !== null || spreadShrinking);
    const buy1Event = buyPointsAllowed && side === 1 && point === 2 && emaCrossUp && row.rsi < row.wma && !noiseState;
    const sell1Event = sellPointsAllowed && side === -1 && point === 2 && emaCrossDown && row.rsi > row.wma && !noiseState;
    const buy2Candidate = buyPointsAllowed && side === 1 && point >= 3 && index > (stateBar ?? -1) && row.rsi > row.ema && row.rsi < row.wma && !noiseState;
    const sell2Candidate = sellPointsAllowed && side === -1 && point >= 3 && index > (stateBar ?? -1) && row.rsi < row.ema && row.rsi > row.wma && !noiseState;
    const buy2SemanticCandidate = buyPointsAllowed && previewSemanticState === SEMANTIC.BUY_2 && semanticState !== SEMANTIC.BUY_2 && index > (stateBar ?? -1) && !noiseState;
    const sell2SemanticCandidate = sellPointsAllowed && previewSemanticState === SEMANTIC.SELL_2 && semanticState !== SEMANTIC.SELL_2 && index > (stateBar ?? -1) && !noiseState;
    const prevBuy2 = index > 0 && rows[index - 1]._buy2;
    const prevSell2 = index > 0 && rows[index - 1]._sell2;
    const buy2Event = ((buy2Candidate || buy2SemanticCandidate) && !prevBuy2);
    const sell2Event = ((sell2Candidate || sell2SemanticCandidate) && !prevSell2);
    row._buy2 = buy2Candidate || buy2SemanticCandidate;
    row._sell2 = sell2Candidate || sell2SemanticCandidate;
    const buy3WindowFromII = side === 1 && point === 2 && index > (stateBar ?? -1) && barsSinceWmaUp !== null && barsSinceWmaUp >= 0 && barsSinceWmaUp <= PINE_RULES.iiTo3WindowBars && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3WindowFromII = side === -1 && point === 2 && index > (stateBar ?? -1) && barsSinceWmaDown !== null && barsSinceWmaDown >= 0 && barsSinceWmaDown <= PINE_RULES.iiTo3WindowBars && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Impulse = buyPointsAllowed && side === 1 && wmaCrossUp && row.rsi > row.ema && row.rsi > row.wma && !noiseState;
    const sell3Impulse = sellPointsAllowed && side === -1 && wmaCrossDown && row.rsi < row.ema && row.rsi < row.wma && !noiseState;
    const buy3Candidate = buyPointsAllowed && side === 1 && index > (stateBar ?? -1) && !noiseState && (point >= 3 && wmaCrossUp || buy3WindowFromII);
    const sell3Candidate = sellPointsAllowed && side === -1 && index > (stateBar ?? -1) && !noiseState && (point >= 3 && wmaCrossDown || sell3WindowFromII);
    const prevBuy3 = index > 0 && rows[index - 1]._buy3;
    const prevSell3 = index > 0 && rows[index - 1]._sell3;
    const buy3Event = (buy3Candidate && !prevBuy3) || buy3Impulse;
    const sell3Event = (sell3Candidate && !prevSell3) || sell3Impulse;
    row._buy3 = buy3Candidate;
    row._sell3 = sell3Candidate;

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
    } else if (buyIIEvent || sellIIEvent) {
      point = 2; stateBar = index;
    } else if (buy1Event || sell1Event) {
      point = 3; stateBar = index;
    } else if (buy2Event || sell2Event) {
      point = 4; stateBar = index;
    } else if (buy3Event || sell3Event) {
      point = 5; stateBar = index;
    }

    const currentTrap = trapCode(row.rsi, noiseState);
    const currentStateAgeBars = stateBar === null ? 0 : index - stateBar;
    semanticState = resolveSemanticState(semanticState, side, point, aboveBoth, belowBoth, linesExpanding, spreadShrinking, noiseState, currentTrap, buyConverging, sellConverging, row.rsi, row.ema, row.wma, currentStateAgeBars);

    return {
      time: row.time,
      rsi: row.rsi,
      bias: semanticBiasCode(semanticState),
      state: semanticState,
      buyII: buyIIEvent,
      sellII: sellIIEvent,
      buy2: buy2Event,
      sell2: sell2Event,
      buy3: buy3Event,
      sell3: sell3Event
    };
  });
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

function lookupConfirmedD2Bias(d2State, time) {
  let activeBias = 0;
  for (let index = 0; index < d2State.length; index += 1) {
    const state = d2State[index];
    const nextState = d2State[index + 1];
    const effectiveTime = nextState?.time ?? state.time + (2 * 24 * 60 * 60);
    if (effectiveTime > time) break;
    activeBias = state.bias;
  }
  return activeBias;
}

function rsiRegimeData(candles, d2State = sharedD2State) {
  return candles.map((candle) => {
    const d2Bias = lookupConfirmedD2Bias(d2State, candle.time);
    return {
      time: candle.time,
      value: 100,
      color: d2Bias === 1 ? "rgba(46,125,50,0.16)" : d2Bias === -1 ? "rgba(183,28,28,0.17)" : "rgba(0,0,0,0)"
    };
  });
}

function rsiSignalMarkers(frameState) {
  const markers = [];

  frameState.forEach((state) => {
    if (state.buy2) {
      markers.push({
        time: state.time,
        position: "belowBar",
        color: "rgba(46,125,50,0.86)",
        shape: "square",
        text: "2"
      });
    }
    if (state.sell2) {
      markers.push({
        time: state.time,
        position: "aboveBar",
        color: "rgba(183,28,28,0.9)",
        shape: "square",
        text: "2"
      });
    }
    if (state.buy3) {
      markers.push({
        time: state.time,
        position: "belowBar",
        color: "rgba(67,160,71,0.92)",
        shape: "arrowUp",
        text: "3"
      });
    }
    if (state.sell3) {
      markers.push({
        time: state.time,
        position: "aboveBar",
        color: "rgba(198,40,40,0.92)",
        shape: "arrowDown",
        text: "3"
      });
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

  const firstRs = avgLoss === 0 ? null : avgGain / avgLoss;
  result.push({
    time: candles[length].time,
    value: avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - (100 / (1 + firstRs))
  });

  for (let i = length + 1; i < candles.length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    const rs = avgLoss === 0 ? null : avgGain / avgLoss;
    result.push({
      time: candles[i].time,
      value: avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - (100 / (1 + rs))
    });
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

function setLiveStatus(isOnline, text) {
  $("liveDot").classList.toggle("online", isOnline);
  $("liveStatus").textContent = text;
}

function updateRsiValue(el, value) {
  el.textContent = value === null ? "--" : fmt.format(value);
  el.classList.toggle("rsi-low", value !== null && value <= 20);
  el.classList.toggle("rsi-high", value !== null && value >= 80);
}

function updateMetricValue(el, value, prefix = "") {
  if (!el) return;
  const nextText = value === null ? `${prefix}--` : `${prefix}${fmt.format(value)}`;
  if (el.textContent !== nextText) el.textContent = nextText;
}

function setTextIfChanged(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
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
    this.drawFrame = null;
    this.lastPriceSize = { width: 0, height: 0 };
    this.lastRsiSize = { width: 0, height: 0 };
    this.hasRenderedPrice = false;
    this.closeEl = this.el.querySelector('[data-role="close"]');
    this.rsiEl = this.el.querySelector('[data-role="rsi"]');
    this.rsiEmaEl = this.el.querySelector('[data-role="rsi-ema"]');
    this.rsiWmaEl = this.el.querySelector('[data-role="rsi-wma"]');
    this.countdownEl = createCountdownNode(this.el.querySelector(".frame-metrics"));
    this.priceNode = this.el.querySelector('[data-role="price-chart"]');
    this.rsiNode = this.el.querySelector('[data-role="rsi-chart"]');

    this.priceChart = LightweightCharts.createChart(this.priceNode, singleChartOptions(SINGLE_BG));
    this.rsiChart = LightweightCharts.createChart(this.rsiNode, singleChartOptions("rgba(0,0,0,0)"));
    applyRsiChartScale(this.rsiChart);

    this.candleSeries = this.priceChart.addCandlestickSeries({
      upColor: SINGLE_UP,
      downColor: SINGLE_DOWN,
      borderUpColor: SINGLE_UP,
      borderDownColor: SINGLE_DOWN,
      wickUpColor: SINGLE_UP,
      wickDownColor: SINGLE_DOWN,
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.baselineSeries = this.priceChart.addLineSeries({
      color: "#fdd835",
      lineWidth: 2,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.slowBaselineSeries = this.priceChart.addLineSeries({
      color: "#ab47bc",
      lineWidth: 2,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.vwapSeries = this.priceChart.addLineSeries({
      color: "#f0f3fa",
      lineWidth: 2,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.vwapMonthSeries = this.priceChart.addLineSeries({
      color: "rgba(45,212,191,0.9)",
      lineWidth: 2,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.rsiSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: "#f0f3fa",
      lineWidth: 2
    }));
    this.rsiLowSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: RSI_LOW_COLOR,
      lineWidth: 3
    }));
    this.rsiHighSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: RSI_HIGH_COLOR,
      lineWidth: 4
    }));
    this.rsiEmaSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: "#ffb74d",
      lineWidth: 2
    }));
    this.rsiWmaSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: "#ef5350",
      lineWidth: 2
    }));
    this.rsi70 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(239,83,80,0.42)", lineWidth: 1, lineStyle: 2 }));
    this.rsi80 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(239,83,80,0.72)", lineWidth: 1, lineStyle: 2 }));
    this.rsi50 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(210,210,210,0.22)", lineWidth: 1, lineStyle: 2 }));
    this.rsi20 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.72)", lineWidth: 1, lineStyle: 2 }));
    this.rsi30 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.42)", lineWidth: 1, lineStyle: 2 }));

    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) this.rsiChart.timeScale().setVisibleLogicalRange(range);
    });
  }

  resize() {
    const priceWidth = this.priceNode.clientWidth;
    const priceHeight = this.priceNode.clientHeight;
    const rsiWidth = this.rsiNode.clientWidth;
    const rsiHeight = this.rsiNode.clientHeight;
    if (
      priceWidth === this.lastPriceSize.width &&
      priceHeight === this.lastPriceSize.height &&
      rsiWidth === this.lastRsiSize.width &&
      rsiHeight === this.lastRsiSize.height
    ) return;
    this.lastPriceSize = { width: priceWidth, height: priceHeight };
    this.lastRsiSize = { width: rsiWidth, height: rsiHeight };
    this.priceChart.applyOptions({
      width: priceWidth,
      height: priceHeight
    });
    this.rsiChart.applyOptions({
      width: rsiWidth,
      height: rsiHeight
    });
  }

  klineUrl() {
    return klineUrlFor(this.config.apiTf, this.config.limit);
  }

  refreshCandles() {
    this.candles = this.config.apiTf === "1d" && this.config.aggregate > 1
      ? aggregateDailyCandles(this.rawCandles, this.config.aggregate)
      : aggregateCandles(this.rawCandles, this.config.aggregate);
  }

  focusLatest(bars = VISIBLE_BARS) {
    const total = this.candles.length;
    if (!total) return;

    const from = Math.max(total - bars, 0);
    const to = total + 1;
    this.priceChart.timeScale().setVisibleLogicalRange({ from, to });
    this.rsiChart.timeScale().setVisibleLogicalRange({ from, to });
  }

  async load(session) {
    closeSocket(this.ws);
    this.closeEl.textContent = "--";
    updateRsiValue(this.rsiEl, null);
    updateMetricValue(this.rsiEmaEl, null);
    updateMetricValue(this.rsiWmaEl, null);
    updateCountdownNode(this.countdownEl, this.config);

    const response = await fetch(this.klineUrl());
    if (!response.ok) throw new Error(`${this.config.label} HTTP ${response.status}`);

    const raw = await response.json();
    if (session !== sessionId) return;

    this.rawCandles = raw.map(toChartCandle);
    this.refreshCandles();
    this.hasRenderedPrice = false;
    this.draw(true);
    this.startWebSocket(session);
  }

  draw(fit = false) {
    const candles = this.candles;
    if (!candles.length) return;

    if (activeViewKey === "chart") {
      const baseline = jmaFromClose(candles, 70, 2, 5);
      const slowBaseline = jmaFromClose(candles, 150, 2, 0);
      const vwapData = anchoredVwap(candles, "W");
      const vwapMonthData = anchoredVwap(candles, "M");
      const barColors = crossSignals(candles, baseline, slowBaseline);

      this.candleSeries.setData(candles.map((c) => {
        const signalColor = barColors.get(c.time);
        const bodyColor = signalColor || (c.close >= c.open ? SINGLE_UP : SINGLE_DOWN);
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
      this.baselineSeries.setData(layerState.baseline ? baseline : []);
      this.slowBaselineSeries.setData(layerState.slowBaseline ? slowBaseline : []);
      this.vwapSeries.setData(layerState.vwap ? vwapData : []);
      this.vwapMonthSeries.setData(layerState.vwapMonth ? vwapMonthData : []);
      this.hasRenderedPrice = true;
    }

    const rsiData = rsi(candles, RSI_LENGTH);
    const rsiEmaData = emaFromValues(rsiData, RSI_EMA_LENGTH);
    const rsiWmaData = wmaFromValues(rsiData, RSI_WMA_LENGTH);

    const last = candles[candles.length - 1];
    const lastRsi = rsiData.length ? rsiData[rsiData.length - 1].value : null;
    const lastEma = rsiEmaData.length ? rsiEmaData[rsiEmaData.length - 1].value : null;
    const lastWma = rsiWmaData.length ? rsiWmaData[rsiWmaData.length - 1].value : null;
    setTextIfChanged(this.closeEl, fmt.format(last.close));
    updateRsiValue(this.rsiEl, lastRsi);
    updateMetricValue(this.rsiEmaEl, lastEma);
    updateMetricValue(this.rsiWmaEl, lastWma);
    rsiOnlyPanels.get(this.config.key)?.updateFromSource(candles, rsiData, rsiEmaData, rsiWmaData, fit);

    if (this.config.key === "h4") updateOhlc(last);

    if (fit && activeViewKey === "chart") this.focusLatest();
  }

  scheduleDraw(fit = false) {
    if (this.drawFrame) return;
    this.drawFrame = requestAnimationFrame(() => {
      this.drawFrame = null;
      this.draw(fit);
    });
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
      this.scheduleDraw(false);
    };
  }
}

class RsiOnlyPanel {
  constructor(config) {
    this.config = config;
    this.el = document.querySelector(`[data-rsi-frame="${config.key}"]`);
    this.valueEl = this.el.querySelector('[data-role="rsi-only-value"]');
    this.emaEl = this.el.querySelector('[data-role="rsi-only-ema"]');
    this.wmaEl = this.el.querySelector('[data-role="rsi-only-wma"]');
    this.countdownEl = createCountdownNode(this.el.querySelector(".frame-metrics"));
    this.chartNode = this.el.querySelector('[data-role="rsi-only-chart"]');
    this.lastCandles = [];
    this.lastPayload = null;
    this.lastSize = { width: 0, height: 0 };
    this.levelsKey = "";

    this.chart = LightweightCharts.createChart(this.chartNode, chartOptions(TV_BG_DARK));
    applyRsiChartScale(this.chart);

    this.rsiRegimeSeries = this.chart.addHistogramSeries({
      color: "rgba(0,0,0,0)",
      base: 0,
      priceFormat: {
        type: "volume"
      },
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.rsiSeries = this.chart.addLineSeries(rsiLineOptions({
      color: "#ffffff",
      lineWidth: 2,
      lastValueVisible: true
    }));
    this.rsiEmaSeries = this.chart.addLineSeries(rsiLineOptions({
      color: "#ffb000",
      lineWidth: 2,
      lastValueVisible: true
    }));
    this.rsiWmaSeries = this.chart.addLineSeries(rsiLineOptions({
      color: "#ff3347",
      lineWidth: 2,
      lastValueVisible: true
    }));
    this.rsi70 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(239,83,80,0.42)", lineWidth: 1, lineStyle: 2 }));
    this.rsi80 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(239,83,80,0.72)", lineWidth: 1, lineStyle: 2 }));
    this.rsi50 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(210,210,210,0.22)", lineWidth: 1, lineStyle: 2 }));
    this.rsi20 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.72)", lineWidth: 1, lineStyle: 2 }));
    this.rsi30 = this.chart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.42)", lineWidth: 1, lineStyle: 2 }));
  }

  resize() {
    const width = this.chartNode.clientWidth;
    const height = this.chartNode.clientHeight;
    if (width === this.lastSize.width && height === this.lastSize.height) return;
    this.lastSize = { width, height };
    this.chart.applyOptions({
      width,
      height
    });
  }

  setLevels(candles) {
    const first = candles[0]?.time || 0;
    const last = candles[candles.length - 1]?.time || 0;
    const key = `${candles.length}:${first}:${last}`;
    if (key === this.levelsKey) return;
    this.levelsKey = key;
    this.rsi70.setData(candles.map((c) => ({ time: c.time, value: 70 })));
    this.rsi80.setData(candles.map((c) => ({ time: c.time, value: RSI_HIGH_LEVEL })));
    this.rsi50.setData(candles.map((c) => ({ time: c.time, value: 50 })));
    this.rsi20.setData(candles.map((c) => ({ time: c.time, value: RSI_LOW_LEVEL })));
    this.rsi30.setData(candles.map((c) => ({ time: c.time, value: 30 })));
  }

  updateFromSource(candles, rsiData, rsiEmaData, rsiWmaData, fit = false) {
    this.lastPayload = { candles, rsiData, rsiEmaData, rsiWmaData, fit };
    if (activeViewKey === "rsi") this.draw(candles, rsiData, rsiEmaData, rsiWmaData, fit);
  }

  drawCached(fit = false) {
    if (!this.lastPayload) return;
    const payload = this.lastPayload;
    this.draw(payload.candles, payload.rsiData, payload.rsiEmaData, payload.rsiWmaData, fit || payload.fit);
  }

  focusLatest(bars = VISIBLE_BARS) {
    const total = this.lastCandles.length;
    if (!total) return;

    const from = Math.max(total - bars, 0);
    const to = total + 1;
    this.chart.timeScale().setVisibleLogicalRange({ from, to });
  }

  draw(candles, rsiData, rsiEmaData, rsiWmaData, fit = false) {
    this.lastCandles = candles;
    const rsiFrameState = pineRsiFrameState(candles);
    this.rsiRegimeSeries.setData(rsiRegimeData(candles));
    this.rsiSeries.setData(layerState.rsi ? rsiData : []);
    this.rsiEmaSeries.setData(layerState.rsiEma ? rsiEmaData : []);
    this.rsiWmaSeries.setData(layerState.rsiWma ? rsiWmaData : []);
    this.rsiSeries.setMarkers(rsiSignalMarkers(rsiFrameState));
    this.setLevels(candles);

    const lastRsi = rsiData.length ? rsiData[rsiData.length - 1].value : null;
    const lastEma = rsiEmaData.length ? rsiEmaData[rsiEmaData.length - 1].value : null;
    const lastWma = rsiWmaData.length ? rsiWmaData[rsiWmaData.length - 1].value : null;
    updateRsiValue(this.valueEl, lastRsi);
    updateMetricValue(this.emaEl, lastEma);
    updateMetricValue(this.wmaEl, lastWma);
    updateCountdownNode(this.countdownEl, this.config);
    if (fit) this.focusLatest();
  }
}

class SingleChartPanel {
  constructor(configs) {
    this.configs = configs;
    this.config = configs.find((item) => item.key === "h4") || configs[0];
    this.rawCandles = [];
    this.candles = [];
    this.ws = null;
    this.drawFrame = null;
    this.lastPriceSize = { width: 0, height: 0 };
    this.lastRsiSize = { width: 0, height: 0 };
    this.levelsKey = "";
    this.hasRendered = false;
    this.el = $("singleView");
    this.symbolEl = this.el.querySelector('[data-role="single-symbol"]');
    this.frameEl = this.el.querySelector('[data-role="single-frame"]');
    this.closeEl = this.el.querySelector('[data-role="single-close"]');
    this.rsiEl = this.el.querySelector('[data-role="single-rsi"]');
    this.emaEl = this.el.querySelector('[data-role="single-ema"]');
    this.wmaEl = this.el.querySelector('[data-role="single-wma"]');
    this.countdownEl = createCountdownNode(this.el.querySelector(".single-title"), true);
    this.cardNode = this.el.querySelector(".single-card");
    this.priceNode = this.el.querySelector('[data-role="single-price-chart"]');
    this.chartCountdownEl = createCountdownNode(this.priceNode, true);
    this.chartCountdownEl.classList.add("single-chart-countdown");
    this.rsiNode = this.el.querySelector('[data-role="single-rsi-chart"]');
    this.resizerNode = this.el.querySelector('[data-role="single-rsi-resizer"]');
    this.buttonsNode = $("singleTimeframes");
    this.trendlineToolButton = this.el.querySelector('[data-role="trendline-tool"]');
    this.trendlineDeleteButton = this.el.querySelector('[data-role="trendline-delete"]');
    this.trendlineUndoButton = this.el.querySelector('[data-role="trendline-undo"]');
    this.trendlineClearButton = this.el.querySelector('[data-role="trendline-clear"]');
    this.rsiHeight = this.loadRsiHeight();
    this.dragState = null;
    this.isTrendlineDrawing = false;
    this.pendingTrendPoint = null;
    this.pendingPreviewPoint = null;
    this.previewFrame = null;
    this.selectedTrendlineIndex = null;
    this.trendlineSeries = [];
    this.tempTrendlineSeries = null;
    this.trendlineStore = this.loadTrendlineStore();

    this.priceChart = LightweightCharts.createChart(this.priceNode, singleChartOptions(SINGLE_BG));
    this.rsiChart = LightweightCharts.createChart(this.rsiNode, singleChartOptions("rgba(0,0,0,0)"));
    applyRsiChartScale(this.rsiChart);

    this.candleSeries = this.priceChart.addCandlestickSeries({
      upColor: SINGLE_UP,
      downColor: SINGLE_DOWN,
      borderUpColor: SINGLE_UP,
      borderDownColor: SINGLE_DOWN,
      wickUpColor: SINGLE_UP,
      wickDownColor: SINGLE_DOWN,
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.volumeSeries = this.priceChart.addHistogramSeries({
      color: "rgba(120,123,134,0.18)",
      priceFormat: {
        type: "volume"
      },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.priceChart.priceScale("").applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0
      }
    });
    this.baselineSeries = this.priceChart.addLineSeries({
      color: "rgba(255,193,7,0.86)",
      lineWidth: 1,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.slowBaselineSeries = this.priceChart.addLineSeries({
      color: "rgba(255,64,129,0.78)",
      lineWidth: 1,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.vwapSeries = this.priceChart.addLineSeries({
      color: "rgba(240,243,250,0.78)",
      lineWidth: 1,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.vwapMonthSeries = this.priceChart.addLineSeries({
      color: "rgba(45,212,191,0.82)",
      lineWidth: 1,
      title: "",
      lastValueVisible: true,
      priceLineVisible: false
    });
    this.rsiRegimeSeries = this.rsiChart.addHistogramSeries({
      color: "rgba(0,0,0,0)",
      base: 0,
      priceFormat: {
        type: "volume"
      },
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.rsiSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: "#ffffff",
      lineWidth: 2,
      lastValueVisible: true
    }));
    this.rsiEmaSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: "#ffb000",
      lineWidth: 2,
      lastValueVisible: true
    }));
    this.rsiWmaSeries = this.rsiChart.addLineSeries(rsiLineOptions({
      color: "#ff3347",
      lineWidth: 2,
      lastValueVisible: true
    }));
    this.rsi70 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(239,83,80,0.42)", lineWidth: 1, lineStyle: 2 }));
    this.rsi80 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(239,83,80,0.72)", lineWidth: 1, lineStyle: 2 }));
    this.rsi50 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(210,210,210,0.22)", lineWidth: 1, lineStyle: 2 }));
    this.rsi20 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.72)", lineWidth: 1, lineStyle: 2 }));
    this.rsi30 = this.rsiChart.addLineSeries(rsiLineOptions({ color: "rgba(76,175,80,0.42)", lineWidth: 1, lineStyle: 2 }));

    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) this.rsiChart.timeScale().setVisibleLogicalRange(range);
    });

    this.renderButtons();
    this.applyRsiHeight();
    this.bindRsiResizer();
    this.bindDrawingTools();
    this.renderTrendlines();
  }

  loadRsiHeight() {
    const saved = Number(localStorage.getItem(SINGLE_RSI_HEIGHT_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : SINGLE_RSI_DEFAULT_HEIGHT;
  }

  renderButtons() {
    this.buttonsNode.innerHTML = "";
    this.configs.forEach((config) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "single-timeframe";
      button.dataset.tf = config.key;
      button.textContent = config.label;
      button.addEventListener("click", () => this.setFrame(config.key, true));
      this.buttonsNode.appendChild(button);
    });
    this.syncHeader();
  }

  syncHeader() {
    this.symbolEl.textContent = currentSymbol;
    this.frameEl.textContent = this.config.label;
    this.selectedTrendlineIndex = null;
    updateCountdownNode(this.countdownEl, this.config);
    updateCountdownNode(this.chartCountdownEl, this.config);
    this.buttonsNode.querySelectorAll(".single-timeframe").forEach((button) => {
      button.classList.toggle("active", button.dataset.tf === this.config.key);
    });
    this.setTrendlineDrawing(false);
    this.renderTrendlines();
  }

  resize() {
    this.applyRsiHeight();
    const priceWidth = this.priceNode.clientWidth;
    const priceHeight = this.priceNode.clientHeight;
    const rsiWidth = this.rsiNode.clientWidth;
    const rsiHeight = this.rsiNode.clientHeight;
    if (
      priceWidth === this.lastPriceSize.width &&
      priceHeight === this.lastPriceSize.height &&
      rsiWidth === this.lastRsiSize.width &&
      rsiHeight === this.lastRsiSize.height
    ) return;
    this.lastPriceSize = { width: priceWidth, height: priceHeight };
    this.lastRsiSize = { width: rsiWidth, height: rsiHeight };
    this.priceChart.applyOptions({
      width: priceWidth,
      height: priceHeight
    });
    this.rsiChart.applyOptions({
      width: rsiWidth,
      height: rsiHeight
    });
  }

  maxRsiHeight() {
    if (!this.cardNode.clientHeight) return Math.max(this.rsiHeight, SINGLE_RSI_MIN_HEIGHT);
    const headerHeight = this.el.querySelector(".single-head")?.offsetHeight || 32;
    const handleHeight = this.resizerNode?.offsetHeight || 7;
    const availableHeight = Math.max(this.cardNode.clientHeight - headerHeight - handleHeight, SINGLE_RSI_MIN_HEIGHT);
    return Math.max(SINGLE_RSI_MIN_HEIGHT, Math.floor(availableHeight * SINGLE_RSI_MAX_RATIO));
  }

  clampRsiHeight(value) {
    return Math.min(Math.max(value, SINGLE_RSI_MIN_HEIGHT), this.maxRsiHeight());
  }

  applyRsiHeight() {
    if (!this.cardNode) return;
    const headerHeight = this.el.querySelector(".single-head")?.offsetHeight || 32;
    if (this.cardNode.clientHeight) this.rsiHeight = this.clampRsiHeight(this.rsiHeight);
    this.cardNode.style.gridTemplateRows = `${headerHeight}px minmax(140px, 1fr) 7px ${this.rsiHeight}px`;
  }

  bindRsiResizer() {
    if (!this.resizerNode) return;

    this.resizerNode.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.dragState = {
        startY: event.clientY,
        startHeight: this.rsiHeight
      };
      this.resizerNode.setPointerCapture(event.pointerId);
      document.body.classList.add("single-rsi-resizing");
    });

    this.resizerNode.addEventListener("pointermove", (event) => {
      if (!this.dragState) return;
      const delta = this.dragState.startY - event.clientY;
      this.rsiHeight = this.clampRsiHeight(this.dragState.startHeight + delta);
      this.applyRsiHeight();
      this.resize();
    });

    const stopResize = (event) => {
      if (!this.dragState) return;
      this.dragState = null;
      localStorage.setItem(SINGLE_RSI_HEIGHT_KEY, String(Math.round(this.rsiHeight)));
      document.body.classList.remove("single-rsi-resizing");
      if (event.pointerId !== undefined && this.resizerNode.hasPointerCapture(event.pointerId)) {
        this.resizerNode.releasePointerCapture(event.pointerId);
      }
      requestAnimationFrame(() => this.resize());
    };

    this.resizerNode.addEventListener("pointerup", stopResize);
    this.resizerNode.addEventListener("pointercancel", stopResize);
  }

  loadTrendlineStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SINGLE_TRENDLINES_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  saveTrendlineStore() {
    localStorage.setItem(SINGLE_TRENDLINES_KEY, JSON.stringify(this.trendlineStore));
  }

  trendlineKey() {
    return `${currentSymbol}:${this.config.key}`;
  }

  currentTrendlines() {
    const key = this.trendlineKey();
    if (!Array.isArray(this.trendlineStore[key])) this.trendlineStore[key] = [];
    return this.trendlineStore[key];
  }

  makeTrendlineSeries(isPreview = false, isSelected = false) {
    return this.priceChart.addLineSeries({
      color: isSelected ? "rgba(246,184,75,0.98)" : isPreview ? "rgba(240,243,250,0.52)" : "rgba(240,243,250,0.88)",
      lineWidth: isSelected ? 2 : 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });
  }

  clearTrendlineSeries() {
    this.trendlineSeries.forEach((series) => this.priceChart.removeSeries(series));
    this.trendlineSeries = [];
    if (this.tempTrendlineSeries) {
      this.priceChart.removeSeries(this.tempTrendlineSeries);
      this.tempTrendlineSeries = null;
    }
  }

  normalizeTrendlineData(start, end) {
    return [start, end]
      .map((point) => ({ time: Number(point.time), value: Number(point.value) }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
      .sort((a, b) => a.time - b.time);
  }

  renderTrendlines() {
    if (!this.priceChart) return;
    this.clearTrendlineSeries();
    this.currentTrendlines().forEach((line, index) => {
      const data = this.normalizeTrendlineData(line.start, line.end);
      if (data.length !== 2 || data[0].time === data[1].time) return;
      const series = this.makeTrendlineSeries(false, index === this.selectedTrendlineIndex);
      series.setData(data);
      this.trendlineSeries.push(series);
    });
  }

  setTrendlineDrawing(enabled) {
    this.isTrendlineDrawing = enabled;
    this.pendingTrendPoint = null;
    this.pendingPreviewPoint = null;
    this.trendlineToolButton?.classList.toggle("active", enabled);
    this.el.classList.toggle("trendline-drawing", enabled);
    if (this.previewFrame) {
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = null;
    }
    if (this.tempTrendlineSeries) {
      this.priceChart.removeSeries(this.tempTrendlineSeries);
      this.tempTrendlineSeries = null;
    }
  }

  pointFromClick(param) {
    if (!param?.point) return null;
    const rawTime = param.time ?? this.priceChart.timeScale().coordinateToTime(param.point.x);
    const price = this.candleSeries.coordinateToPrice(param.point.y);
    const time = typeof rawTime === "number" ? rawTime : null;
    if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
    return { time, value: price };
  }

  handleTrendlineClick(param) {
    if (!this.isTrendlineDrawing) return;
    const point = this.pointFromClick(param);
    if (!point) return;

    if (!this.pendingTrendPoint) {
      this.selectedTrendlineIndex = null;
      this.renderTrendlines();
      this.pendingTrendPoint = point;
      if (!this.tempTrendlineSeries) this.tempTrendlineSeries = this.makeTrendlineSeries(true);
      this.tempTrendlineSeries.setData([]);
      return;
    }

    const data = this.normalizeTrendlineData(this.pendingTrendPoint, point);
    if (data.length === 2 && data[0].time !== data[1].time) {
      this.currentTrendlines().push({ start: data[0], end: data[1] });
      this.saveTrendlineStore();
      this.pendingTrendPoint = null;
      this.pendingPreviewPoint = null;
      this.selectedTrendlineIndex = this.currentTrendlines().length - 1;
      this.renderTrendlines();
    }
  }

  handleTrendlinePreview(param) {
    if (!this.isTrendlineDrawing || !this.pendingTrendPoint) return;
    if (!this.tempTrendlineSeries) this.tempTrendlineSeries = this.makeTrendlineSeries(true);
    const point = this.pointFromClick(param);
    if (!point || point.time === this.pendingTrendPoint.time) return;
    this.pendingPreviewPoint = point;
    if (this.previewFrame) return;
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = null;
      if (!this.pendingPreviewPoint || !this.pendingTrendPoint || !this.tempTrendlineSeries) return;
      const data = this.normalizeTrendlineData(this.pendingTrendPoint, this.pendingPreviewPoint);
      if (data.length === 2) this.tempTrendlineSeries.setData(data);
    });
  }

  distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
    const x = start.x + t * dx;
    const y = start.y + t * dy;
    return Math.hypot(point.x - x, point.y - y);
  }

  trendlineScreenPoints(line) {
    const data = this.normalizeTrendlineData(line.start, line.end);
    if (data.length !== 2) return null;
    const startX = this.priceChart.timeScale().timeToCoordinate(data[0].time);
    const endX = this.priceChart.timeScale().timeToCoordinate(data[1].time);
    const startY = this.candleSeries.priceToCoordinate(data[0].value);
    const endY = this.candleSeries.priceToCoordinate(data[1].value);
    if (![startX, endX, startY, endY].every(Number.isFinite)) return null;
    return {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY }
    };
  }

  selectTrendlineAt(param) {
    if (this.isTrendlineDrawing || !param?.point) return;
    const hitRadius = 8;
    let nearest = null;
    this.currentTrendlines().forEach((line, index) => {
      const screen = this.trendlineScreenPoints(line);
      if (!screen) return;
      const distance = this.distanceToSegment(param.point, screen.start, screen.end);
      if (distance <= hitRadius && (!nearest || distance < nearest.distance)) nearest = { index, distance };
    });
    this.selectedTrendlineIndex = nearest ? nearest.index : null;
    this.renderTrendlines();
  }

  deleteSelectedTrendline() {
    if (this.selectedTrendlineIndex === null) return;
    const lines = this.currentTrendlines();
    lines.splice(this.selectedTrendlineIndex, 1);
    this.selectedTrendlineIndex = null;
    this.saveTrendlineStore();
    this.renderTrendlines();
  }

  undoTrendline() {
    const lines = this.currentTrendlines();
    lines.pop();
    this.selectedTrendlineIndex = null;
    this.saveTrendlineStore();
    this.renderTrendlines();
  }

  clearTrendlines() {
    this.trendlineStore[this.trendlineKey()] = [];
    this.saveTrendlineStore();
    this.pendingTrendPoint = null;
    this.pendingPreviewPoint = null;
    this.selectedTrendlineIndex = null;
    this.renderTrendlines();
  }

  bindDrawingTools() {
    this.trendlineToolButton?.addEventListener("click", () => {
      this.setTrendlineDrawing(!this.isTrendlineDrawing);
    });
    this.trendlineDeleteButton?.addEventListener("click", () => this.deleteSelectedTrendline());
    this.trendlineUndoButton?.addEventListener("click", () => this.undoTrendline());
    this.trendlineClearButton?.addEventListener("click", () => this.clearTrendlines());
    this.priceChart.subscribeClick((param) => {
      if (this.isTrendlineDrawing) {
        this.handleTrendlineClick(param);
      } else {
        this.selectTrendlineAt(param);
      }
    });
    this.priceChart.subscribeCrosshairMove((param) => this.handleTrendlinePreview(param));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isTrendlineDrawing) this.setTrendlineDrawing(false);
    });
  }

  klineUrl() {
    return klineUrlFor(this.config.apiTf, this.config.limit);
  }

  refreshCandles() {
    this.candles = this.config.apiTf === "1d" && this.config.aggregate > 1
      ? aggregateDailyCandles(this.rawCandles, this.config.aggregate)
      : aggregateCandles(this.rawCandles, this.config.aggregate);
  }

  focusLatest(bars = 220) {
    const total = this.candles.length;
    if (!total) return;

    const from = Math.max(total - bars, 0);
    const to = total + 1;
    this.priceChart.timeScale().setVisibleLogicalRange({ from, to });
    this.rsiChart.timeScale().setVisibleLogicalRange({ from, to });
  }

  setRsiLevels(candles) {
    const first = candles[0]?.time || 0;
    const last = candles[candles.length - 1]?.time || 0;
    const key = `${candles.length}:${first}:${last}`;
    if (key === this.levelsKey) return;
    this.levelsKey = key;
    this.rsi70.setData(candles.map((c) => ({ time: c.time, value: 70 })));
    this.rsi80.setData(candles.map((c) => ({ time: c.time, value: RSI_HIGH_LEVEL })));
    this.rsi50.setData(candles.map((c) => ({ time: c.time, value: 50 })));
    this.rsi20.setData(candles.map((c) => ({ time: c.time, value: RSI_LOW_LEVEL })));
    this.rsi30.setData(candles.map((c) => ({ time: c.time, value: 30 })));
  }

  scheduleDraw(fit = false) {
    if (this.drawFrame) return;
    this.drawFrame = requestAnimationFrame(() => {
      this.drawFrame = null;
      this.draw(fit);
    });
  }

  async setFrame(key, reload = false) {
    const nextConfig = this.configs.find((item) => item.key === key);
    if (!nextConfig || nextConfig.key === this.config.key) return;

    this.config = nextConfig;
    this.syncHeader();
    localStorage.setItem("singleChartTimeframe", key);
    if (reload) await this.load(sessionId, true);
  }

  async load(session, fit = true) {
    closeSocket(this.ws);
    this.syncHeader();
    this.closeEl.textContent = "--";
    this.rsiEl.textContent = "RSI --";
    updateMetricValue(this.emaEl, null, "E ");
    updateMetricValue(this.wmaEl, null, "W ");
    updateCountdownNode(this.countdownEl, this.config);
    updateCountdownNode(this.chartCountdownEl, this.config);

    const response = await fetch(this.klineUrl());
    if (!response.ok) throw new Error(`${this.config.label} single HTTP ${response.status}`);

    const raw = await response.json();
    if (session !== sessionId) return;

    this.rawCandles = raw.map(toChartCandle);
    this.refreshCandles();
    this.hasRendered = false;
    if (activeViewKey === "single") this.draw(fit);
    this.startWebSocket(session);
  }

  draw(fit = false) {
    const candles = this.candles;
    if (!candles.length) return;

    const baseline = jmaFromClose(candles, 70, 2, 5);
    const slowBaseline = jmaFromClose(candles, 150, 2, 0);
    const vwapData = anchoredVwap(candles, "W");
    const vwapMonthData = anchoredVwap(candles, "M");
    const barColors = crossSignals(candles, baseline, slowBaseline);

    this.candleSeries.setData(candles.map((c) => {
      const signalColor = barColors.get(c.time);
      const bodyColor = signalColor || (c.close >= c.open ? SINGLE_UP : SINGLE_DOWN);
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
    this.volumeSeries.setData(candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(88,209,95,0.16)" : "rgba(217,217,217,0.12)"
    })));
    this.baselineSeries.setData(layerState.baseline ? baseline : []);
    this.slowBaselineSeries.setData(layerState.slowBaseline ? slowBaseline : []);
    this.vwapSeries.setData(layerState.vwap ? vwapData : []);
    this.vwapMonthSeries.setData(layerState.vwapMonth ? vwapMonthData : []);

    const rsiData = rsi(candles, RSI_LENGTH);
    const rsiEmaData = emaFromValues(rsiData, RSI_EMA_LENGTH);
    const rsiWmaData = wmaFromValues(rsiData, RSI_WMA_LENGTH);
    const rsiFrameState = pineRsiFrameState(candles);
    this.rsiRegimeSeries.setData(rsiRegimeData(candles));
    this.rsiSeries.setData(layerState.rsi ? rsiData : []);
    this.rsiEmaSeries.setData(layerState.rsiEma ? rsiEmaData : []);
    this.rsiWmaSeries.setData(layerState.rsiWma ? rsiWmaData : []);
    this.rsiSeries.setMarkers(rsiSignalMarkers(rsiFrameState));
    this.rsi70.setData(candles.map((c) => ({ time: c.time, value: 70 })));
    this.rsi80.setData(candles.map((c) => ({ time: c.time, value: RSI_HIGH_LEVEL })));
    this.rsi50.setData(candles.map((c) => ({ time: c.time, value: 50 })));
    this.rsi20.setData(candles.map((c) => ({ time: c.time, value: RSI_LOW_LEVEL })));
    this.rsi30.setData(candles.map((c) => ({ time: c.time, value: 30 })));

    const last = candles[candles.length - 1];
    const lastRsi = rsiData.length ? rsiData[rsiData.length - 1].value : null;
    const lastEma = rsiEmaData.length ? rsiEmaData[rsiEmaData.length - 1].value : null;
    const lastWma = rsiWmaData.length ? rsiWmaData[rsiWmaData.length - 1].value : null;
    setTextIfChanged(this.closeEl, `Close ${fmt.format(last.close)}`);
    setTextIfChanged(this.rsiEl, lastRsi === null ? "RSI --" : `RSI ${fmt.format(lastRsi)}`);
    updateMetricValue(this.emaEl, lastEma, "E ");
    updateMetricValue(this.wmaEl, lastWma, "W ");
    this.rsiEl.classList.toggle("rsi-low", lastRsi !== null && lastRsi <= RSI_LOW_LEVEL);
    this.rsiEl.classList.toggle("rsi-high", lastRsi !== null && lastRsi >= RSI_HIGH_LEVEL);
    this.hasRendered = true;

    if (fit) this.focusLatest();
  }

  startWebSocket(session) {
    const stream = `${currentSymbol.toLowerCase()}@kline_${this.config.wsTf}`;
    this.ws = new WebSocket(`${WS_BASE}/${stream}`);

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
      if (activeViewKey === "single") this.scheduleDraw(false);
    };

    this.ws.onclose = () => {
      if (session !== sessionId) return;
      setTimeout(() => {
        if (session === sessionId) this.startWebSocket(session);
      }, 1500);
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
  document.title = currentSymbol;
}

function startTickerWebSocket(session) {
  closeSocket(tickerWs);
  tickerWs = new WebSocket(`${WS_BASE}/${currentSymbol.toLowerCase()}@miniTicker`);

  tickerWs.onmessage = (event) => {
    if (session !== sessionId) return;
    const ticker = JSON.parse(event.data);
    const price = Number(ticker.c);
    const base = currentSymbol.replace("USDT", "");
    document.title = `${base} ${fmt.format(price)}`;
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
  closeSocket(singlePanel?.ws);

  updateSymbolTitle();
  updateOhlc(null);
  setLiveStatus(false, "Loading matrix...");

  try {
    const nextD2State = await loadSharedD2State();
    if (session !== sessionId) return;
    sharedD2State = nextD2State;

    await Promise.all([
      ...Array.from(panels.values()).map((panel) => panel.load(session)),
      singlePanel?.load(session)
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
  if (["1h", "h1"].includes(normalized)) return "h1";
  if (["3d", "d3"].includes(normalized)) return "d3";
  if (["1w", "w", "weekly"].includes(normalized)) return "w";
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

function scheduleResizeAll() {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    resizeAll();
  });
}

function redrawAll() {
  panels.forEach((panel) => panel.draw(false));
  if (activeViewKey === "rsi") rsiOnlyPanels.forEach((panel) => panel.drawCached(false));
  if (activeViewKey === "single") singlePanel?.draw(false);
}

function updateAllCountdowns() {
  panels.forEach((panel) => updateCountdownNode(panel.countdownEl, panel.config));
  rsiOnlyPanels.forEach((panel) => updateCountdownNode(panel.countdownEl, panel.config));
  if (singlePanel) {
    updateCountdownNode(singlePanel.countdownEl, singlePanel.config);
    updateCountdownNode(singlePanel.chartCountdownEl, singlePanel.config);
  }
}

function setActiveView(view, persist = true) {
  const nextView = ["chart", "single", "rsi"].includes(view) ? view : "chart";
  document.body.classList.toggle("rsi-view-active", nextView === "rsi");
  document.querySelectorAll(".view-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === nextView));
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${nextView}View`));
  if (persist) localStorage.setItem("marketMatrixView", nextView);
  activeViewKey = nextView;
  if (nextView === "chart") panels.forEach((panel) => panel.draw(!panel.hasRenderedPrice));
  if (nextView === "rsi") rsiOnlyPanels.forEach((panel) => panel.drawCached(false));
  if (nextView === "single") singlePanel?.draw(!singlePanel.hasRendered);
  scheduleResizeAll();
}

function initialView() {
  const params = queryParams();
  return params.get("view") || localStorage.getItem("marketMatrixView") || "chart";
}

function startClock() {
  setInterval(() => {
    const nowUtcSeconds = Math.floor(Date.now() / 1000);
    $("clock").textContent = `UTC+7 ${formatChartTime(nowUtcSeconds).split(" ")[1]}`;
    updateAllCountdowns();
  }, 1000);
}

function boot() {
  currentSymbol = initialSymbol();
  updateSymbolTitle();
  applyInitialTimeframeFocus();

  FRAMES.forEach((config) => {
    rsiOnlyPanels.set(config.key, new RsiOnlyPanel(config));
    panels.set(config.key, new MarketPanel(config));
  });
  singlePanel = new SingleChartPanel(SINGLE_FRAMES);
  const initialTf = normalizeTfKey(queryParams().get("tf")) || localStorage.getItem("singleChartTimeframe");
  if (initialTf) singlePanel.setFrame(initialTf, false);

  const resizeObserver = new ResizeObserver(scheduleResizeAll);
  document.querySelectorAll(".price-chart, .rsi-chart, .rsi-only-chart, .single-price-chart, .single-rsi-chart").forEach((node) => resizeObserver.observe(node));
  window.addEventListener("resize", scheduleResizeAll);

  $("symbolForm").addEventListener("submit", (event) => {
    event.preventDefault();
    currentSymbol = normalizeSymbol($("symbolInput").value);
    loadMarketMatrix();
  });

  $("reloadCharts").addEventListener("click", reloadCharts);
  $("toggleControls").addEventListener("click", () => {
    $("controlsPanel").classList.toggle("open");
    scheduleResizeAll();
  });

  document.querySelectorAll(".layer-toggle").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      layerState[checkbox.dataset.layer] = checkbox.checked;
      redrawAll();
    });
  });

  document.querySelectorAll(".view-tab").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.view);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadMarketMatrix();
  });

  startClock();
  updateAllCountdowns();
  scheduleResizeAll();
  setActiveView(initialView(), false);
  loadMarketMatrix();
}

boot();
