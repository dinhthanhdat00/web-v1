import { describeRsiForm } from "./rsi-form-config.js";
import { pineRsiFrameState, rsiRegimeData, rsiSignalMarkers } from "../../assets/js/app.js";

// Stable engine boundary for the React analysis views. The existing state
// machine remains untouched while its implementation is migrated in stages.
export function analyzeRsiForm(candles, d2State = []) {
  const states = pineRsiFrameState(candles);
  const latest = states.at(-1) ?? null;
  return {
    states,
    latest,
    form: latest ? describeRsiForm(latest.state) : describeRsiForm(0),
    markers: rsiSignalMarkers(states),
    regime: rsiRegimeData(candles, d2State)
  };
}
