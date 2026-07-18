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

export function klineUrl(symbol, interval, limit = 500, apiBase = "https://api.binance.com") {
  return `${apiBase}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
}

export async function fetchCandles(symbol, interval, limit = 500, apiBase) {
  const response = await fetch(klineUrl(symbol, interval, limit, apiBase));
  if (!response.ok) throw new Error(`${interval} HTTP ${response.status}`);
  return (await response.json()).map(toChartCandle);
}

export function closeStream(socket) {
  if (!socket) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  try { socket.close(); } catch {}
}

export function openBinanceStream(stream, wsBase = "wss://stream.binance.com:9443/ws") {
  return new WebSocket(`${wsBase}/${stream}`);
}

export class BinanceStream {
  constructor(stream, { wsBase, onMessage, onStatus } = {}) {
    this.stream = stream;
    this.wsBase = wsBase;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.socket = null;
    this.retry = 0;
    this.retryTimer = null;
    this.closed = false;
  }

  connect() {
    this.closed = false;
    this.onStatus?.("connecting");
    this.socket = openBinanceStream(this.stream, this.wsBase);
    this.socket.onopen = () => { this.retry = 0; this.onStatus?.("live"); };
    this.socket.onmessage = (event) => this.onMessage?.(event);
    this.socket.onclose = () => this.scheduleReconnect();
    this.socket.onerror = () => this.socket?.close();
  }

  scheduleReconnect() {
    if (this.closed) return;
    this.onStatus?.("reconnecting");
    const delay = Math.min(1000 * 2 ** this.retry, 15000);
    this.retry += 1;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    closeStream(this.socket);
    this.socket = null;
    this.onStatus?.("offline");
  }
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
