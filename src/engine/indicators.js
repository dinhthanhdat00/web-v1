function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateInUtcPlus7(time) {
  return new Date((Number(time) + 7 * 60 * 60) * 1000);
}

export function emaFromValues(values, length) {
  const result = [];
  const k = 2 / (length + 1);
  let previous = null;
  values.forEach((point) => {
    previous = previous === null ? point.value : point.value * k + previous * (1 - k);
    result.push({ time: point.time, value: previous });
  });
  return result;
}

export function emaFromClose(candles, length) {
  return emaFromValues(candles.map((candle) => ({ time: candle.time, value: candle.close })), length);
}

export function wmaFromValues(values, length) {
  const result = [];
  const weightSum = length * (length + 1) / 2;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < length; j += 1) sum += values[i - j].value * (length - j);
    result.push({ time: values[i].time, value: sum / weightSum });
  }
  return result;
}

export function wmaFromClose(candles, length) {
  const result = [];
  const weightSum = length * (length + 1) / 2;
  for (let i = length - 1; i < candles.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < length; j += 1) sum += candles[i - j].close * (length - j);
    result.push({ time: candles[i].time, value: sum / weightSum });
  }
  return result;
}

export function jmaFromClose(candles, length, power, phase) {
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

function anchorBucket(time, anchorTf) {
  const date = dateInUtcPlus7(time);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (anchorTf === "W") {
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(year, date.getUTCMonth(), day - daysFromMonday));
    return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
  }
  if (anchorTf === "M") return `${year}-${pad2(month)}`;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function anchoredVwap(candles, anchorTf = "D") {
  const result = [];
  let currentBucket = null;
  let cumulativeVolume = 0;
  let cumulativeSrcVolume = 0;
  candles.forEach((candle) => {
    const bucket = anchorBucket(candle.time, anchorTf);
    const volume = Number.isFinite(candle.volume) ? candle.volume : 0;
    const source = (candle.high + candle.low + candle.close) / 3;
    if (bucket !== currentBucket) {
      currentBucket = bucket;
      cumulativeVolume = volume;
      cumulativeSrcVolume = source * volume;
    } else {
      cumulativeVolume += volume;
      cumulativeSrcVolume += source * volume;
    }
    result.push({ time: candle.time, value: cumulativeVolume === 0 ? source : cumulativeSrcVolume / cumulativeVolume });
  });
  return result;
}

export function crossSignals(candles, fastBaseline, slowBaseline) {
  const byTimeFast = new Map(fastBaseline.map((point) => [point.time, point.value]));
  const byTimeSlow = new Map(slowBaseline.map((point) => [point.time, point.value]));
  const result = new Map();
  for (let i = 1; i < candles.length; i += 1) {
    const previous = candles[i - 1];
    const current = candles[i];
    const previousFast = byTimeFast.get(previous.time);
    const currentFast = byTimeFast.get(current.time);
    const previousSlow = byTimeSlow.get(previous.time);
    const currentSlow = byTimeSlow.get(current.time);
    if (previousFast !== undefined && currentFast !== undefined) {
      if (previous.close <= previousFast && current.close > currentFast) result.set(current.time, "#4caf50");
      if (previous.close >= previousFast && current.close < currentFast) result.set(current.time, "#ff4d5a");
    }
    if (previousSlow !== undefined && currentSlow !== undefined) {
      if (previous.close <= previousSlow && current.close > currentSlow) result.set(current.time, "#2f5cff");
      if (previous.close >= previousSlow && current.close < currentSlow) result.set(current.time, "#9c27b0");
    }
  }
  return result;
}

export function rsi(candles, length = 14) {
  const result = [];
  if (candles.length <= length) return result;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= length; i += 1) {
    const difference = candles[i].close - candles[i - 1].close;
    if (difference >= 0) gains += difference;
    else losses -= difference;
  }
  let avgGain = gains / length;
  let avgLoss = losses / length;
  const pushValue = (time) => {
    const relativeStrength = avgLoss === 0 ? null : avgGain / avgLoss;
    result.push({ time, value: avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - (100 / (1 + relativeStrength)) });
  };
  pushValue(candles[length].time);
  for (let i = length + 1; i < candles.length; i += 1) {
    const difference = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (length - 1) + Math.max(difference, 0)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(-difference, 0)) / length;
    pushValue(candles[i].time);
  }
  return result;
}
