export const PANEL_CSS = /* css */ `
:host { all: initial; }
.gt {
  --ink: #0e1726; --ink-2: #33415a; --ink-3: #6b778c;
  --paper: #fbfaf6; --paper-2: #f1eee5; --rule: #dfe6ee; --line: #d9d4c7;
  --harbour: #1d5a8a; --harbour-2: #2c79b5; --harbour-wash: #e7f0f8;
  --ok: #1f7a4d; --ok-wash: #e3f3ea; --warn: #a96500; --warn-wash: #fbf0dc;
  --info: #1d5a8a; --info-wash: #e5eff8; --bad: #b4232c; --bad-wash: #fbe7e8;
  --grey: #5b6574; --grey-wash: #eceef1;
  --sans: "IBM Plex Sans", ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --r-lg: 14px; --r-sm: 6px;
  --dur: 180ms; --ease: cubic-bezier(0.16, 1, 0.3, 1);
  position: fixed; top: 84px; right: 0; z-index: 2147483000;
  font: 13px/1.45 var(--sans); color: var(--ink);
  display: flex; align-items: flex-start;
  -webkit-font-smoothing: antialiased;
}
.gt * { box-sizing: border-box; }
.gt button, .gt input { font: inherit; color: inherit; }
.gt :focus-visible { outline: 2px solid var(--harbour-2); outline-offset: 2px; border-radius: 4px; }

.tab {
  writing-mode: vertical-rl; transform: rotate(180deg);
  background: var(--ink); color: #f5f1e6; border: 0; cursor: pointer;
  padding: 14px 7px; border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font: 600 11px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase;
  box-shadow: 0 6px 18px rgba(14,23,38,.25); margin-top: 18px;
  display: flex; gap: 8px; align-items: center;
}
.tab .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--grey); }
.tab:hover { background: var(--harbour); }

.sheet {
  width: 348px; max-height: calc(100vh - 110px); overflow: auto;
  background: var(--paper); border: 1px solid var(--line); border-right: 0;
  border-radius: var(--r-lg) 0 0 var(--r-lg);
  box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, 0 24px 48px -12px rgba(14,23,38,.32), 0 4px 10px rgba(14,23,38,.08);
  transform-origin: right center;
  animation: gt-in 260ms var(--ease);
}
@keyframes gt-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
.collapsed .sheet { display: none; }
.gt.embedded { position: relative; top: auto; right: auto; z-index: auto; }
.embedded .sheet { max-height: none; border-right: 1px solid var(--line); border-radius: 0 var(--r-lg) var(--r-lg) 0; }

header.top {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px;
  background: var(--ink); color: #f5f1e6;
}
.brand { font: 700 15px/1 var(--sans); letter-spacing: -.01em; }
.brand small { display: block; font: 500 10px/1.2 var(--mono); color: #9fb4cc; letter-spacing: .08em; text-transform: uppercase; margin-top: 3px; }
.spacer { flex: 1; }
.icon-btn { background: transparent; border: 1px solid rgba(245,241,230,.25); color: #f5f1e6; border-radius: var(--r-sm); width: 28px; height: 28px; cursor: pointer; line-height: 1; }
.icon-btn:hover { background: rgba(245,241,230,.1); }

.pill { font: 700 10px/1 var(--mono); letter-spacing: .1em; padding: 5px 8px; border-radius: 999px; text-transform: uppercase; white-space: nowrap; }
.pill.EXACT { background: var(--ok-wash); color: var(--ok); }
.pill.BUILDING { background: var(--warn-wash); color: var(--warn); }
.pill.CHOOSE { background: var(--info-wash); color: var(--info); }
.pill.NO_MATCH { background: var(--bad-wash); color: var(--bad); }
.pill.OUT_OF_AREA { background: var(--grey-wash); color: var(--grey); }
.pill.LOADING { background: rgba(245,241,230,.12); color: #f5f1e6; }
.pill.ERROR { background: var(--bad-wash); color: var(--bad); }

.body { padding: 14px 14px 18px; display: grid; gap: 12px; }

.receipt {
  position: relative; font: 11.5px/20px var(--mono); color: var(--ink-2);
  padding: 10px 12px 10px 22px; border: 1px solid var(--line); border-radius: var(--r-sm);
  background-color: #fffef9;
  background-image: linear-gradient(to bottom, transparent 19px, var(--rule) 19px, var(--rule) 20px);
  background-size: 100% 20px; background-position: 0 9px;
}
.receipt::before { content: ""; position: absolute; left: 13px; top: 0; bottom: 0; width: 1px; background: #f0c9c9; }
.receipt .ttl { font-weight: 700; color: var(--ink); letter-spacing: .12em; text-transform: uppercase; font-size: 10px; display: flex; justify-content: space-between; }
.receipt dl { margin: 0; display: grid; grid-template-columns: 78px 1fr; }
.receipt dt { color: var(--ink-3); }
.receipt dd { margin: 0; color: var(--ink); word-break: break-word; }
.receipt .checks span { margin-right: 10px; white-space: nowrap; }
.receipt .y { color: var(--ok); } .receipt .n { color: var(--bad); }

.msg { font-size: 12.5px; color: var(--ink-2); }
.link { background: none; border: 0; padding: 0; color: var(--harbour); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; font-weight: 500; }
.link:hover { color: var(--harbour-2); }

.card {
  background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 13px;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -8px rgba(14,23,38,.25); }
.card h3 { margin: 0 0 6px; font: 600 10.5px/1.2 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); display: flex; justify-content: space-between; gap: 8px; }
.card .big { font: 700 24px/1.1 var(--sans); letter-spacing: -.02em; color: var(--ink); }
.card .sub { color: var(--ink-3); font-size: 12px; }
.card.na { background: var(--paper-2); border-style: dashed; }
.card.na .big { font-size: 13px; font-weight: 500; color: var(--ink-3); }
.card.alert { background: var(--bad-wash); border-color: #efb9bc; }
.card.alert h3, .card.alert .big { color: var(--bad); }
.card.hero { border-color: var(--harbour); box-shadow: 0 0 0 3px var(--harbour-wash); }

.range { position: relative; height: 30px; margin: 10px 0 4px; }
.range .track { position: absolute; left: 0; right: 0; top: 12px; height: 6px; border-radius: 3px; background: var(--paper-2); }
.range .band { position: absolute; top: 10px; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--harbour-wash), var(--harbour-2) 50%, var(--harbour-wash)); }
.range .mid { position: absolute; top: 4px; width: 2px; height: 22px; background: var(--ink); }
.range .guide { position: absolute; top: 0; width: 0; height: 30px; border-left: 2px dashed var(--bad); }
.range .guide::after { content: "guide"; position: absolute; top: -2px; left: 4px; font: 600 9px/1 var(--mono); color: var(--bad); text-transform: uppercase; }
.range-labels { display: flex; justify-content: space-between; font: 11px/1 var(--mono); color: var(--ink-3); }
.conf { margin-top: 8px; display: flex; align-items: center; gap: 8px; font: 11px/1 var(--mono); color: var(--ink-3); }
.meter { flex: 1; height: 4px; background: var(--paper-2); border-radius: 2px; overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--harbour); }
.guide-row { margin-top: 10px; display: flex; gap: 6px; }
.guide-row input { flex: 1; min-width: 0; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 6px 8px; background: var(--paper); }
.guide-verdict { margin-top: 6px; font-size: 12px; }
.guide-verdict.below { color: var(--bad); font-weight: 600; } .guide-verdict.inside { color: var(--ok); } .guide-verdict.above { color: var(--warn); }

table.mini { width: 100%; border-collapse: collapse; font: 12px/1.3 var(--mono); }
table.mini td { padding: 4px 0; border-bottom: 1px dotted var(--line); }
table.mini td:last-child { text-align: right; color: var(--ink); font-weight: 600; }
table.mini tr:last-child td { border-bottom: 0; }

.vs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.vs div { background: var(--paper); border-radius: var(--r-sm); padding: 8px; }
.vs b { display: block; font: 700 16px/1.1 var(--sans); }
.vs span { font: 10px/1 var(--mono); color: var(--ink-3); text-transform: uppercase; letter-spacing: .08em; }

.risk { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px dotted var(--line); }
.risk:last-child { border-bottom: 0; }
.risk .on { color: var(--bad); font-weight: 600; } .risk .off { color: var(--ink-3); }

details.basics summary { cursor: pointer; font: 600 10.5px/1.2 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); list-style: none; }
details.basics summary::before { content: "+ "; } details.basics[open] summary::before { content: "− "; }

.btn { border: 1px solid var(--harbour); background: var(--harbour); color: #fff; border-radius: var(--r-sm); padding: 7px 12px; cursor: pointer; font-weight: 600; transition: background var(--dur) var(--ease), transform var(--dur) var(--ease); }
.btn:hover { background: var(--harbour-2); }
.btn:active { transform: translateY(1px); }
.btn.ghost { background: transparent; color: var(--harbour); }
.btn.ghost:hover { background: var(--harbour-wash); }
.btn[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
.beds { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 6px; }
.units { list-style: none; margin: 8px 0 0; padding: 0; max-height: 180px; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-sm); background: #fff; }
.units li + li { border-top: 1px dotted var(--line); }
.units button { width: 100%; text-align: left; background: none; border: 0; padding: 7px 10px; cursor: pointer; display: flex; justify-content: space-between; font: 12px/1.3 var(--mono); }
.units button:hover { background: var(--harbour-wash); }

form.manual { display: grid; gap: 8px; }
form.manual label { font: 600 10.5px/1.2 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
form.manual input { border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; background: #fff; }
.row { display: flex; gap: 8px; }

.loading { display: grid; gap: 8px; }
.shimmer { height: 54px; border-radius: 10px; background: linear-gradient(90deg, var(--paper-2), #fff, var(--paper-2)); background-size: 200% 100%; animation: gt-sh 1.2s linear infinite; }
@keyframes gt-sh { to { background-position: -200% 0; } }
.err { border: 1px solid #efb9bc; background: var(--bad-wash); color: var(--bad); border-radius: 10px; padding: 12px; }
.err b { display: block; margin-bottom: 4px; }
.foot { font: 10px/1.4 var(--mono); color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 10px; }

@media (prefers-reduced-motion: reduce) {
  .sheet, .shimmer { animation: none; }
  .card, .btn { transition: none; }
  .card:hover { transform: none; }
}
`;
