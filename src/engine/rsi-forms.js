import { describeRsiForm } from "./rsi-form-config.js";
import { emaFromValues, rsi, wmaFromValues } from "./indicators.js";
import { PINE_RULES, RSI_LEVELS, SEMANTIC } from "./rsi-form-config.js";

const RSI_LENGTH = 14;
const RSI_EMA_LENGTH = 9;
const RSI_WMA_LENGTH = 45;
const RSI_LOW_LEVEL = RSI_LEVELS.low;
const RSI_HIGH_LEVEL = RSI_LEVELS.high;
const RSI_LOW_COLOR = RSI_LEVELS.lowColor;
const RSI_HIGH_COLOR = RSI_LEVELS.highColor;

export function moduleRsiRegimeData(candles, d2State = []) {
  return candles.map((candle) => {
    let bias = 0;
    for (let index = 0; index < d2State.length; index += 1) {
      const next = d2State[index + 1];
      if ((next?.time ?? d2State[index].time + 172800) > candle.time) break;
      bias = d2State[index].bias;
    }
    return { time: candle.time, value: 100, color: bias === 1 ? "rgba(46,125,50,0.16)" : bias === -1 ? "rgba(183,28,28,0.17)" : "rgba(0,0,0,0)" };
  });
}

export function moduleRsiSignalMarkers(frameState) {
  return frameState.flatMap((state) => {
    const markers = [];
    if (state.buy2) markers.push({ time: state.time, position: "belowBar", color: "rgba(46,125,50,0.86)", shape: "square", text: "2" });
    if (state.sell2) markers.push({ time: state.time, position: "aboveBar", color: "rgba(183,28,28,0.9)", shape: "square", text: "2" });
    if (state.buy3) markers.push({ time: state.time, position: "belowBar", color: "rgba(67,160,71,0.92)", shape: "arrowUp", text: "3" });
    if (state.sell3) markers.push({ time: state.time, position: "aboveBar", color: "rgba(198,40,40,0.92)", shape: "arrowDown", text: "3" });
    return markers;
  });
}

// Stable engine boundary for the React analysis views. The existing state
// machine remains untouched while its implementation is migrated in stages.
export function analyzeRsiForm(candles, d2State = []) {
  const states = pineRsiFrameState(candles);
  const latest = states.at(-1) ?? null;
  return {
    states,
    latest,
    form: latest ? describeRsiForm(latest.state) : describeRsiForm(0),
    markers: moduleRsiSignalMarkers(states),
    regime: moduleRsiRegimeData(candles, d2State)
  };
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

export function pineRsiFrameState(candles) {
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

export function rsiExtremeLineData(rsiData, predicate) {
  return rsiData.map((point, index) => {
    const prev = rsiData[index - 1];
    const next = rsiData[index + 1];
    const shouldHighlight = predicate(point.value) || (prev && predicate(prev.value)) || (next && predicate(next.value));
    return shouldHighlight ? { time: point.time, value: point.value } : { time: point.time };
  });
}

export function rsiColorData(rsiData) {
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

function legacyRsiRegimeData(candles, d2State = sharedD2State) {
  return candles.map((candle) => {
    const d2Bias = lookupConfirmedD2Bias(d2State, candle.time);
    return {
      time: candle.time,
      value: 100,
      color: d2Bias === 1 ? "rgba(46,125,50,0.16)" : d2Bias === -1 ? "rgba(183,28,28,0.17)" : "rgba(0,0,0,0)"
    };
  });
}

function legacyRsiSignalMarkers(frameState) {
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


export { moduleRsiRegimeData as rsiRegimeData, moduleRsiSignalMarkers as rsiSignalMarkers };
