const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const appPath = path.join(rootDir, "assets", "js", "app.js");
const appCode = fs.readFileSync(appPath, "utf8").replace(/\bboot\(\);\s*$/, "");

function makeContext() {
  const context = {
    console,
    fetch,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    Intl,
    Date,
    Math,
    Number,
    String,
    Boolean,
    JSON,
    Map,
    Set,
    Array,
    Object,
    URLSearchParams,
    window: {
      location: { search: "", pathname: "/", origin: "http://127.0.0.1" },
      addEventListener() {},
    },
    document: {
      body: { dataset: {}, classList: { toggle() {} } },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    LightweightCharts: {
      createChart() {
        return {
          addCandlestickSeries() {
            return {};
          },
          addLineSeries() {
            return {};
          },
          addHistogramSeries() {
            return {};
          },
          timeScale() {
            return {
              fitContent() {},
              setVisibleLogicalRange() {},
              subscribeVisibleLogicalRangeChange() {},
              getVisibleLogicalRange() {
                return null;
              },
            };
          },
          applyOptions() {},
          remove() {},
        };
      },
      CrosshairMode: {},
      LineStyle: {},
      ColorType: {},
    },
    ResizeObserver: function ResizeObserver() {
      this.observe = function observe() {};
    },
    WebSocket: function WebSocket() {},
  };
  context.window.window = context.window;
  context.window.document = context.document;
  return context;
}

function isoToSec(iso) {
  return Date.parse(iso) / 1000;
}

function fmtTime(sec) {
  return sec ? new Date(sec * 1000).toISOString().replace(".000Z", "Z") : null;
}

function nearlyEqual(a, b, tolerance) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function priceText(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function qtyText(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "n/a";
}

function findClosestByTime(rows, targetTime, timeKey) {
  return rows
    .map((row) => ({ row, diff: Math.abs((row[timeKey] || 0) - targetTime) }))
    .sort((a, b) => a.diff - b.diff)[0]?.row;
}

function describeLeg(leg) {
  if (!leg) return "missing";
  return [
    leg.side,
    `entry=${fmtTime(leg.entryTime)} @ ${priceText(leg.entryPrice)}`,
    `qty=${qtyText(leg.qty)}`,
    leg.exitTime ? `exit=${fmtTime(leg.exitTime)} @ ${priceText(leg.exitPrice)}` : "open",
    Number.isFinite(leg.netPnl) ? `net=${priceText(leg.netPnl)}` : null,
    `entryText=${leg.entryText || ""}`,
    `exitText=${leg.exitText || ""}`,
  ].filter(Boolean).join(" | ");
}

function normalizeOpenLeg(leg) {
  return {
    ...leg,
    side: leg.side === 1 ? "long" : "short",
    exitTime: null,
    exitPrice: null,
    exitText: "",
  };
}

function matchLeg(legs, expected) {
  return legs.find((leg) => {
    if (leg.side !== expected.side) return false;
    if (leg.entryTime !== expected.entryTime) return false;
    if (!nearlyEqual(leg.entryPrice, expected.entryPrice, expected.entryPriceTolerance || 1)) return false;
    if (expected.qty != null && !nearlyEqual(leg.qty, expected.qty, expected.qtyTolerance || 0.01)) return false;
    if (expected.exitTime == null) return !leg.exitTime;
    if (leg.exitTime !== expected.exitTime) return false;
    if (!nearlyEqual(leg.exitPrice, expected.exitPrice, expected.exitPriceTolerance || 1)) return false;
    if (expected.netPnl != null && !nearlyEqual(leg.netPnl, expected.netPnl, expected.netPnlTolerance || 25)) return false;
    return true;
  });
}

async function main() {
  const context = makeContext();
  vm.createContext(context);
  vm.runInContext(appCode, context, { filename: appPath });

  const {
    aggregateCandlesByTime,
    buildClosedTradeLegsFromOrders,
    computeV17ParityEvents,
    fetchKlinesSince,
    strategyConfigFingerprint,
    toChartCandle,
  } = context;

  const start = Date.UTC(2021, 0, 1);
  const end = Date.now();
  const [h4Raw, h12Raw, d1Raw] = await Promise.all([
    fetchKlinesSince("4h", start, end),
    fetchKlinesSince("12h", start, end),
    fetchKlinesSince("1d", start, end),
  ]);

  const h4 = h4Raw.map(toChartCandle);
  const h12 = h12Raw.map(toChartCandle);
  const d1 = d1Raw.map(toChartCandle);
  const d2 = aggregateCandlesByTime(d1, 2, 24 * 60 * 60);
  const core = computeV17ParityEvents(h4, h12, d1, d2);
  const closed = buildClosedTradeLegsFromOrders(core.orders);
  const legs = [...closed.closed, ...closed.open.map(normalizeOpenLeg)];

  const expectedLegs = [
    {
      id: "TV #350 short",
      side: "short",
      entryTime: isoToSec("2026-05-26T12:00:00Z"),
      entryPrice: 76518.08,
      entryPriceTolerance: 2,
      qty: 1.09,
      qtyTolerance: 0.03,
      exitTime: isoToSec("2026-06-08T20:00:00Z"),
      exitPrice: 63086.01,
      exitPriceTolerance: 2,
      netPnl: 14559.318,
      netPnlTolerance: 75,
    },
    {
      id: "TV #351 long",
      side: "long",
      entryTime: isoToSec("2026-06-19T16:00:00Z"),
      entryPrice: 63021.62,
      entryPriceTolerance: 2,
      qty: 0.39,
      qtyTolerance: 0.02,
      exitTime: isoToSec("2026-06-23T08:00:00Z"),
      exitPrice: 62507.04,
      exitPriceTolerance: 2,
      netPnl: -211.055,
      netPnlTolerance: 50,
    },
    {
      id: "TV #352 long",
      side: "long",
      entryTime: isoToSec("2026-06-24T08:00:00Z"),
      entryPrice: 62921.21,
      entryPriceTolerance: 2,
      qty: 0.64,
      qtyTolerance: 0.03,
      exitTime: isoToSec("2026-06-24T12:00:00Z"),
      exitPrice: 60249.98,
      exitPriceTolerance: 10,
      netPnl: -1734.061,
      netPnlTolerance: 75,
    },
    {
      id: "TV #353 open long",
      side: "long",
      entryTime: isoToSec("2026-06-26T04:00:00Z"),
      entryPrice: 60532.02,
      entryPriceTolerance: 2,
      qty: 0.58,
      qtyTolerance: 0.03,
      exitTime: null,
    },
  ];

  console.log(`Strategy fingerprint: ${strategyConfigFingerprint()}`);
  console.log(`Orders: ${core.orders.length}, legs: ${legs.length}`);

  let failed = 0;
  for (const expected of expectedLegs) {
    const hit = matchLeg(legs, expected);
    if (hit) {
      console.log(`PASS ${expected.id}: ${describeLeg(hit)}`);
      continue;
    }

    failed += 1;
    const closest = findClosestByTime(legs.filter((leg) => leg.side === expected.side), expected.entryTime, "entryTime");
    console.log(`FAIL ${expected.id}`);
    console.log(`  expected: ${expected.side} | entry=${fmtTime(expected.entryTime)} @ ${priceText(expected.entryPrice)} | qty=${qtyText(expected.qty)} | ${expected.exitTime == null ? "open" : `exit=${fmtTime(expected.exitTime)} @ ${priceText(expected.exitPrice)}`} ${expected.netPnl == null ? "" : `| net=${priceText(expected.netPnl)}`}`);
    console.log(`  closest:  ${describeLeg(closest)}`);
  }

  const from = isoToSec("2026-05-01T00:00:00Z");
  const to = isoToSec("2026-07-08T00:00:00Z");
  const windowOrders = core.orders
    .filter((order) => order.time >= from && order.time <= to)
    .map((order) => `${fmtTime(order.time)} ${order.action} ${order.text} @ ${priceText(order.price)} q=${priceText(order.qty || 0)} ${order.detail || ""}`);

  console.log("\nOrders around known mismatch window:");
  for (const line of windowOrders) console.log(`  ${line}`);

  const legWindowFrom = isoToSec("2026-05-20T00:00:00Z");
  const legWindowTo = isoToSec("2026-06-10T00:00:00Z");
  const windowLegs = legs
    .filter((leg) => leg.entryTime >= legWindowFrom && leg.entryTime <= legWindowTo)
    .map(describeLeg);

  console.log("\nIndividual legs around TV #350:");
  for (const line of windowLegs) console.log(`  ${line}`);

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
