import assert from "node:assert/strict";
import { analyzeRsiForm } from "../src/engine/rsi-forms.js";
import { SEMANTIC, describeRsiForm } from "../src/engine/rsi-form-config.js";

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

console.log("RSI form engine tests passed");
