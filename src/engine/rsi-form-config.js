// One source of truth for the RSI form rules shared by chart rendering and
// the upcoming multi-timeframe swing reader.
export const RSI_LEVELS = {
  low: 20,
  high: 80,
  lowColor: "#8b0000",
  highColor: "#ff2bd6"
};

export const SEMANTIC = {
  INIT: 0, NEUTRAL_REARM: 1,
  BUY_I: 10, BUY_II: 11, BUY_1: 12, BUY_2: 13, BUY_3: 14, BUY_STALE: 15, BUY_TRAP_WAIT: 16,
  SELL_I: 20, SELL_II: 21, SELL_1: 22, SELL_2: 23, SELL_3: 24, SELL_STALE: 25, SELL_TRAP_WAIT: 26
};

export const PINE_RULES = {
  noiseLookback: 7,
  noiseCrossCount: 3,
  iiTo3WindowBars: 2,
  stateFreshBars: 1,
  staleStateBars: 5,
  trapHighLevel: RSI_LEVELS.high,
  trapLowLevel: RSI_LEVELS.low,
  allowDirectITriggers: false,
  requireStrictFormSequence: false,
  filterPointsByEmaWmaTrend: false
};

const STATE_DETAILS = new Map([
  [SEMANTIC.INIT, ["neutral", "init"]], [SEMANTIC.NEUTRAL_REARM, ["neutral", "rearm"]],
  [SEMANTIC.BUY_I, ["buy", "P1"]], [SEMANTIC.BUY_II, ["buy", "P2"]], [SEMANTIC.BUY_1, ["buy", "P1"]], [SEMANTIC.BUY_2, ["buy", "P2"]], [SEMANTIC.BUY_3, ["buy", "P3"]], [SEMANTIC.BUY_STALE, ["buy", "stale"]], [SEMANTIC.BUY_TRAP_WAIT, ["buy", "trap-wait"]],
  [SEMANTIC.SELL_I, ["sell", "P1"]], [SEMANTIC.SELL_II, ["sell", "P2"]], [SEMANTIC.SELL_1, ["sell", "P1"]], [SEMANTIC.SELL_2, ["sell", "P2"]], [SEMANTIC.SELL_3, ["sell", "P3"]], [SEMANTIC.SELL_STALE, ["sell", "stale"]], [SEMANTIC.SELL_TRAP_WAIT, ["sell", "trap-wait"]]
]);

export function describeRsiForm(stateCode) {
  const [side, phase] = STATE_DETAILS.get(stateCode) ?? ["neutral", "unknown"];
  return { code: stateCode, side, phase, actionable: phase === "P2" || phase === "P3" };
}
