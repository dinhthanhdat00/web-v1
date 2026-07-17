export function toChartCandle(kline) {
  return {
    time: Math.floor(kline[0] / 1000),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5])
  };
}

export function aggregateCandles(source, groupSize) {
  if (groupSize <= 1) return source.slice();

  const result = [];
  for (let i = 0; i < source.length; i += groupSize) {
    const group = source.slice(i, i + groupSize);
    if (!group.length) continue;
    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0)
    });
  }
  return result;
}

export function aggregateDailyCandles(source, dayCount) {
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
    high: Math.max(...group.map((candle) => candle.high)),
    low: Math.min(...group.map((candle) => candle.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((sum, candle) => sum + candle.volume, 0)
  }));
}
