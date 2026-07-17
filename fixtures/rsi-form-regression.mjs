// Frozen synthetic market path used to catch indicator regressions. Add
// TradingView-confirmed candle windows here as they are approved.
export const rsiFormRegressionFixture = {
  name: "oscillating-4h-regression",
  candles: Array.from({ length: 160 }, (_, index) => {
    const close = 64000 + Math.sin(index / 4) * 900 + Math.sin(index / 11) * 500 + index * 3;
    return {
      time: 1700000000 + index * 4 * 60 * 60,
      open: close - 25,
      high: close + 75,
      low: close - 90,
      close,
      volume: 100 + index
    };
  }),
  expectedMarkers: [
    [1700878400, "2", "aboveBar"], [1700892800, "3", "aboveBar"], [1701036800, "3", "belowBar"],
    [1701238400, "2", "aboveBar"], [1701252800, "3", "aboveBar"], [1701425600, "2", "belowBar"],
    [1701454400, "3", "belowBar"], [1701584000, "3", "aboveBar"], [1701771200, "2", "belowBar"],
    [1701785600, "3", "belowBar"], [1701972800, "2", "aboveBar"], [1702001600, "3", "aboveBar"],
    [1702131200, "3", "belowBar"]
  ],
  expectedLastState: 21
};
