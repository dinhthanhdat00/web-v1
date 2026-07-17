import assert from "node:assert/strict";
import confirmedFixtures from "../fixtures/btc-confirmed-h1-h4.json" with { type: "json" };
import { analyzeRsiForm } from "../src/engine/rsi-forms.js";
import { SEMANTIC, describeRsiForm } from "../src/engine/rsi-form-config.js";
import { rsiFormRegressionFixture } from "../fixtures/rsi-form-regression.mjs";

const candles = Array.from({ length: 120 }, (_, index) => {
  const close = 63000 + Math.sin(index / 5) * 700 + index * 4;
  return {
    time: 1700000000 + index * 4 * 60 * 60,
    open: close - 20,
    high: close + 60,
    low: close - 70,
    close,
    volume: 100 + index
  };
});

const result = analyzeRsiForm(candles);
assert.ok(result.states.length > 0, "RSI form engine must return states");
assert.equal(result.regime.length, candles.length, "Regime must cover every candle");
assert.ok(result.form.side === "buy" || result.form.side === "sell" || result.form.side === "neutral");
assert.deepEqual(describeRsiForm(SEMANTIC.BUY_3), { code: SEMANTIC.BUY_3, side: "buy", phase: "P3", actionable: true });
assert.deepEqual(describeRsiForm(SEMANTIC.SELL_STALE), { code: SEMANTIC.SELL_STALE, side: "sell", phase: "stale", actionable: false });

const regression = analyzeRsiForm(rsiFormRegressionFixture.candles);
assert.deepEqual(
  regression.markers.map((marker) => [marker.time, marker.text, marker.position]),
  rsiFormRegressionFixture.expectedMarkers,
  "P2/P3 marker sequence changed"
);
assert.equal(regression.states.at(-1)?.state, rsiFormRegressionFixture.expectedLastState, "Final Pine state changed");

for (const [timeframe, fixture] of Object.entries(confirmedFixtures)) {
  const confirmed = analyzeRsiForm(fixture.candles);
  assert.deepEqual(confirmed.markers.map((marker) => [marker.time, marker.text, marker.position]), fixture.expectedMarkers, `${timeframe} confirmed marker sequence changed`);
  assert.equal(confirmed.states.at(-1)?.state, fixture.expectedLastState, `${timeframe} confirmed final state changed`);
}

console.log("RSI form engine tests passed");
