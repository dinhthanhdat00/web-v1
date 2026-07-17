import { mkdir, writeFile } from "node:fs/promises";
import { analyzeRsiForm } from "../src/engine/rsi-forms.js";

const toCandle = (row) => ({ time: Math.floor(row[0] / 1000), open: +row[1], high: +row[2], low: +row[3], close: +row[4], volume: +row[5] });
const snapshot = {};
for (const [name, interval] of [["h1", "1h"], ["h4", "4h"]]) {
  const rows = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=101`).then((response) => response.json());
  const candles = rows.slice(0, -1).map(toCandle);
  const result = analyzeRsiForm(candles);
  snapshot[name] = {
    candles,
    expectedMarkers: result.markers.map(({ time, text, position }) => [time, text, position]),
    expectedLastState: result.states.at(-1)?.state ?? null
  };
}
await mkdir("fixtures", { recursive: true });
await writeFile("fixtures/btc-confirmed-h1-h4.json", `${JSON.stringify(snapshot)}\n`);
console.log("Recorded BTC H1/H4 fixture snapshot");
