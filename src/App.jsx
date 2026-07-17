import { useEffect } from "react";

const matrixFrames = [
  ["h4", "H4", "Baseline, VWAP W/M, RSI14"],
  ["h12", "H12", "Baseline, VWAP W/M, RSI14"],
  ["d1", "D1", "Baseline, VWAP W/M, RSI14"],
  ["d2", "D2", "D1 x2, Baseline, VWAP W/M"],
];

const layers = [
  ["baseline", "Baseline", "yellow"],
  ["slowBaseline", "Slow Baseline", "purple"],
  ["vwap", "VWAP W", "white"],
  ["vwapMonth", "VWAP M", "cyan"],
  ["rsi", "RSI14", "white"],
  ["rsiEma", "RSI EMA9", "orange"],
  ["rsiWma", "RSI WMA45", "red"],
];

function Metrics({ price = false }) {
  return (
    <div className="frame-metrics">
      {price && <span>Close <b data-role="close">--</b></span>}
      <span>RSI <b data-role={price ? "rsi" : "rsi-only-value"}>--</b></span>
      <span>E <b data-role={price ? "rsi-ema" : "rsi-only-ema"}>--</b></span>
      <span>W <b data-role={price ? "rsi-wma" : "rsi-only-wma"}>--</b></span>
    </div>
  );
}

function MatrixCard({ frame, title, subtitle }) {
  return (
    <section className="market-card" data-frame={frame}>
      <header className="card-head">
        <div><div className="frame-title">{title}</div><div className="frame-subtitle">{subtitle}</div></div>
        <Metrics price />
      </header>
      <div className="price-chart" data-role="price-chart" />
      <div className="rsi-chart" data-role="rsi-chart" />
    </section>
  );
}

function RsiCard({ frame, title }) {
  return (
    <section className="market-card rsi-only-card" data-rsi-frame={frame}>
      <header className="card-head">
        <div><div className="frame-title">{title}</div><div className="frame-subtitle">RSI14 + EMA9 + WMA45</div></div>
        <Metrics />
      </header>
      <div className="rsi-only-chart" data-role="rsi-only-chart" />
    </section>
  );
}

export default function App() {
  useEffect(() => {
    let alive = true;
    import("../assets/js/app.js").then(({ boot }) => {
      if (alive) boot();
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="market-app">
      <header className="market-topbar">
        <div className="brand" aria-label="Thành Đạt - Hành trình trade để tự do tài chính">
          <span className="brand-mark" aria-hidden="true"><span className="brand-mark__st">TĐ</span></span>
          <span className="brand-word"><span className="brand-name">THÀNH ĐẠT</span><span className="brand-kicker">TRADE TO FREEDOM</span></span>
        </div>
        <form id="symbolForm" className="symbol-form"><input id="symbolInput" className="symbol-input" defaultValue="BTCUSDT" autoComplete="off" /><button className="load-btn" type="submit">Load</button></form>
        <button id="reloadCharts" className="reload-btn" type="button">Reload</button>
        <button id="toggleControls" className="reload-btn" type="button">Controls</button>
        <nav className="view-tabs" aria-label="Chart view">
          <button className="view-tab active" type="button" data-view="chart">Chart</button>
          <button className="view-tab" type="button" data-view="single">Single</button>
          <button className="view-tab" type="button" data-view="rsi">RSI Only</button>
        </nav>
        <div id="symbolTitle" className="symbol-title">Bitcoin / TetherUS</div><span id="liveDot" className="live-dot" />
        <div id="mainOhlc" className="ohlc">O -- H -- L -- C --</div><div id="mainChange" className="main-change">--%</div><div className="top-spacer" />
        <div className="status-line"><span id="liveStatus">Loading matrix...</span><span id="clock">UTC+7 --:--</span></div>
      </header>

      <section id="controlsPanel" className="controls-panel">
        <table className="controls-table"><thead><tr><th>Layer</th><th>Show</th><th>Color</th></tr></thead><tbody>
          {layers.map(([key, label, color]) => <tr key={key}><td>{label}</td><td><input className="layer-toggle" type="checkbox" data-layer={key} defaultChecked /></td><td><span className={`swatch ${color}`} /></td></tr>)}
        </tbody></table>
      </section>

      <div className="content-shell">
        <main id="chartView" className="matrix-grid view-panel active">{matrixFrames.map(([frame, title, subtitle]) => <MatrixCard key={frame} frame={frame} title={title} subtitle={subtitle} />)}</main>
        <main id="rsiView" className="matrix-grid rsi-only-grid view-panel">{matrixFrames.map(([frame, title]) => <RsiCard key={frame} frame={frame} title={title} />)}</main>
        <main id="singleView" className="single-view view-panel"><section className="single-card">
          <header className="single-head"><div className="single-title"><strong data-role="single-symbol">BTCUSDT</strong><span data-role="single-frame">H4</span><span data-role="single-close">--</span><span data-role="single-rsi">RSI --</span><span data-role="single-ema">E --</span><span data-role="single-wma">W --</span></div>
            <div className="single-head-actions"><nav id="singleTimeframes" className="single-timeframes" aria-label="Single chart timeframe" /><div className="single-drawing-tools" aria-label="Drawing tools"><button className="draw-tool" type="button" data-role="trendline-tool" title="Draw trendline">Trend</button><button className="draw-tool" type="button" data-role="trendline-delete" title="Delete selected trendline">Delete</button><button className="draw-tool" type="button" data-role="trendline-undo" title="Undo last trendline">Undo</button><button className="draw-tool" type="button" data-role="trendline-clear" title="Clear trendlines">Clear</button></div></div>
          </header>
          <div className="single-price-chart" data-role="single-price-chart" /><button className="single-rsi-resizer" type="button" data-role="single-rsi-resizer" aria-label="Adjust RSI height" /><div className="single-rsi-chart" data-role="single-rsi-chart" />
        </section></main>
      </div>
    </div>
  );
}
