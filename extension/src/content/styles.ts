/**
 * Panel styles: "precision instrument for buyers".
 * System font stacks only (we render inside third-party pages: no remote fonts, no layout cost).
 * Colour is semantic only: ok / warn / bad / info. Everything else is ink on paper.
 * Token names (--ink, --line, --sans, --mono, --dur, --ease, --harbour-2 …) are shared with the 3D card.
 */
export const PANEL_CSS = /* css */ `
:host { all: initial; }
.gt {
  --paper: #ffffff; --paper-2: #f5f5f1; --paper-3: #ecebe5;
  --ink: #101318; --ink-2: #3a414d; --ink-3: #6b7280; --ink-4: #9aa0aa;
  --line: #e3e2dc; --line-2: #cfcec6; --rule: #ecebe5;
  --harbour: #1b4fd8; --harbour-2: #2f62e8; --harbour-wash: #eaf0ff;
  --ok: #157347; --ok-wash: #e6f4ec; --warn: #a85a00; --warn-wash: #fdf1df;
  --info: #1b4fd8; --info-wash: #eaf0ff; --bad: #b42318; --bad-wash: #fdeceb;
  --grey: #5b6472; --grey-wash: #eeeeea;
  --shadow: 0 1px 0 rgba(16,19,24,.04), 0 18px 40px -16px rgba(16,19,24,.28), 0 2px 6px rgba(16,19,24,.06);
  --sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, Roboto, sans-serif;
  --serif: ui-serif, "New York", "Iowan Old Style", "Charter", Georgia, serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --t-xs: 10.5px; --t-sm: 12px; --t-md: 13.5px; --t-lg: 16px; --t-xl: 21px; --t-num: 30px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 20px; --s6: 28px;
  --r-lg: 14px; --r-md: 10px; --r-sm: 6px;
  --dur: 180ms; --ease: cubic-bezier(0.16, 1, 0.3, 1);
  position: fixed; top: 76px; right: 12px; z-index: 2147483000;
  font: var(--t-md)/1.45 var(--sans); color: var(--ink);
  font-variant-numeric: tabular-nums;
  display: flex; align-items: flex-start; gap: 8px;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .gt {
    --paper: #16181c; --paper-2: #1d2025; --paper-3: #262a30;
    --ink: #eef0f3; --ink-2: #c3c8d0; --ink-3: #8d94a0; --ink-4: #646b76;
    --line: #2b2f36; --line-2: #3a3f47; --rule: #23262c;
    --harbour: #7ea2ff; --harbour-2: #9ab6ff; --harbour-wash: #1c2540;
    --ok: #4cc38a; --ok-wash: #15291f; --warn: #f0a548; --warn-wash: #2e2414;
    --info: #7ea2ff; --info-wash: #1c2540; --bad: #ff7b72; --bad-wash: #331a19;
    --grey: #9aa1ad; --grey-wash: #23262b;
    --shadow: 0 0 0 1px rgba(255,255,255,.04), 0 24px 48px -16px rgba(0,0,0,.7);
  }
}
.gt * { box-sizing: border-box; }
:where(.gt) button, :where(.gt) input { font: inherit; color: inherit; }
.gt :focus-visible { outline: 2px solid var(--harbour); outline-offset: 2px; border-radius: 4px; }
.gt h2, .gt h3, .gt p { margin: 0; }

/* Slim tab: the collapsed state. */
.tab {
  display: none; writing-mode: vertical-rl; transform: rotate(180deg);
  background: var(--paper); color: var(--ink); border: 1px solid var(--line); cursor: pointer;
  padding: 14px 8px; border-radius: var(--r-md);
  font: 600 11px/1 var(--sans); letter-spacing: .08em;
  box-shadow: var(--shadow); gap: 8px; align-items: center;
  transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.tab:hover { border-color: var(--line-2); transform: rotate(180deg) translateX(2px); }
.tab .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--grey); box-shadow: 0 0 0 3px var(--paper-2); }
.collapsed .tab { display: flex; }
.collapsed .sheet { display: none; }

.sheet {
  width: 380px; max-height: calc(100vh - 92px); overflow: auto; overscroll-behavior: contain;
  background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  animation: gt-in 320ms var(--ease);
  scrollbar-width: thin; scrollbar-color: var(--line-2) transparent;
}
@keyframes gt-in { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
.gt.embedded { position: relative; top: auto; right: auto; z-index: auto; }
.embedded .sheet { width: 100%; max-height: none; overflow: visible; }

/* Sticky header: brand, state pill, briefing, collapse. */
header.top {
  position: sticky; top: 0; z-index: 3;
  display: flex; align-items: center; gap: 6px; padding: 10px 8px 10px 14px; min-width: 0;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  -webkit-backdrop-filter: saturate(1.4) blur(10px); backdrop-filter: saturate(1.4) blur(10px);
  border-bottom: 1px solid var(--line); border-radius: var(--r-lg) var(--r-lg) 0 0;
}
.brand { display: flex; align-items: center; gap: 8px; font: 650 14px/1 var(--sans); letter-spacing: -.01em; white-space: nowrap; }
.mark { position: relative; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--ink); flex: none; }
.mark::before { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: var(--ink); }
.mark::after { content: ""; position: absolute; left: 50%; top: -4px; bottom: -4px; width: 1.5px; margin-left: -.75px; background: var(--ink); opacity: .35; }
.spacer { flex: 1; }
.icon-btn { background: transparent; border: 1px solid transparent; color: var(--ink-3); border-radius: var(--r-sm); width: 28px; height: 28px; cursor: pointer; line-height: 1; font-size: 15px; display: grid; place-items: center; transition: background var(--dur) var(--ease), color var(--dur) var(--ease); }
.icon-btn:hover { background: var(--paper-2); color: var(--ink); }

.pill { display: inline-flex; align-items: center; gap: 6px; font: 650 10.5px/1 var(--sans); letter-spacing: .06em; padding: 6px 9px 6px 8px; border-radius: 999px; text-transform: uppercase; white-space: nowrap; background: var(--grey-wash); color: var(--grey); }
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pill.EXACT { background: var(--ok-wash); color: var(--ok); }
.pill.BUILDING { background: var(--warn-wash); color: var(--warn); }
.pill.CHOOSE { background: var(--info-wash); color: var(--info); }
.pill.NO_MATCH, .pill.ERROR { background: var(--bad-wash); color: var(--bad); }
.pill.OUT_OF_AREA { background: var(--grey-wash); color: var(--grey); }
.pill.LOADING::before { animation: gt-pulse 1s ease-in-out infinite; }
@keyframes gt-pulse { 50% { opacity: .25; } }

.body { padding: var(--s4) var(--s4) var(--s5); display: grid; gap: var(--s3); }
.body > .rise { animation: gt-rise 460ms var(--ease) both; animation-delay: calc(var(--i, 0) * 45ms); }
@keyframes gt-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* Verdict: the one line a buyer should read first. */
.verdict { padding: 2px 2px 4px; }
.verdict .kicker { font: 600 var(--t-xs)/1.2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); display: flex; align-items: center; gap: 6px; }
.verdict .kicker::before { content: ""; width: 14px; height: 2px; background: currentColor; border-radius: 1px; }
.verdict h2 { margin-top: 6px; font: 600 var(--t-xl)/1.18 var(--serif); letter-spacing: -.012em; color: var(--ink); text-wrap: balance; }
.verdict h2 em { font-style: normal; color: var(--tone, var(--ink)); }
.verdict .vsub { margin-top: 6px; font-size: var(--t-sm); color: var(--ink-3); text-wrap: pretty; }
.verdict .vcta { margin-top: var(--s3); display: flex; gap: var(--s2); flex-wrap: wrap; }
.verdict.ok { --tone: var(--ok); } .verdict.warn { --tone: var(--warn); } .verdict.bad { --tone: var(--bad); } .verdict.info { --tone: var(--info); }
.verdict.ok .kicker, .verdict.warn .kicker, .verdict.bad .kicker, .verdict.info .kicker { color: var(--tone); }

/* Match receipt: compact "Verified home" strip that expands into the full receipt. */
.receipt { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--paper-2); overflow: hidden; }
.receipt .strip { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 10px; padding: 9px 10px 9px 10px; }
.receipt .strip:hover { background: var(--paper-3); }
.receipt .strip:focus-visible { outline: 2px solid var(--harbour); outline-offset: -2px; border-radius: var(--r-md); }
.receipt .seal { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font: 700 12px/1 var(--sans); color: #fff; background: var(--grey); }
.receipt.EXACT .seal { background: var(--ok); } .receipt.BUILDING .seal { background: var(--warn); } .receipt.CHOOSE .seal { background: var(--info); }
.receipt.NO_MATCH .seal, .receipt.ERROR .seal { background: var(--bad); }
.receipt.LOADING .seal { background: var(--ink-4); animation: gt-pulse 1s ease-in-out infinite; }
.receipt .who { min-width: 0; display: grid; gap: 1px; }
.receipt .who b { font: 600 var(--t-sm)/1.2 var(--sans); color: var(--ink); }
.receipt .who span { font: 11px/1.3 var(--mono); color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.receipt .meta { font: 600 11px/1 var(--sans); color: var(--ink-3); white-space: nowrap; }
.receipt .chev { width: 8px; height: 8px; border-right: 1.5px solid var(--ink-3); border-bottom: 1.5px solid var(--ink-3); transform: rotate(45deg) translate(-2px, -2px); transition: transform var(--dur) var(--ease); }
.receipt.open .chev { transform: rotate(225deg) translate(-1px, -1px); }
.receipt .rbody { display: none; border-top: 1px dashed var(--line-2); padding: 10px 12px 12px; background: var(--paper); }
.receipt.open .rbody { display: block; animation: gt-rise 260ms var(--ease); }
.receipt .ttl { font: 600 var(--t-xs)/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); display: flex; justify-content: space-between; margin-bottom: 8px; }
.receipt dl { margin: 0; display: grid; grid-template-columns: 84px 1fr; row-gap: 6px; font: 11.5px/1.45 var(--mono); }
.receipt dt { color: var(--ink-3); }
.receipt dd { margin: 0; color: var(--ink); word-break: break-word; }
.receipt .checks { display: flex; flex-wrap: wrap; gap: 4px; }
.receipt .checks span { font: 600 10.5px/1 var(--sans); padding: 4px 7px; border-radius: 999px; white-space: nowrap; }
.receipt .y { color: var(--ok); background: var(--ok-wash); } .receipt .n { color: var(--bad); background: var(--bad-wash); }

.msg { font-size: var(--t-sm); color: var(--ink-3); }
.link { background: none; border: 0; padding: 0; color: var(--ink-2); cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 3px; font-weight: 600; }
.link:hover { color: var(--harbour); text-decoration-color: currentColor; }

/* Fact cards: label, big number, one-line meaning, source. */
.card { position: relative; background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px 14px 12px; transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
.card:hover { border-color: var(--line-2); box-shadow: 0 6px 18px -12px rgba(16,19,24,.35); }
.card h3 { margin: 0 0 8px; font: 600 var(--t-xs)/1.2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); display: flex; justify-content: space-between; gap: 8px; }
.card .big { font: 650 var(--t-num)/1.05 var(--sans); letter-spacing: -.03em; color: var(--ink); }
.card .big .u { font-size: 15px; font-weight: 500; letter-spacing: -.005em; color: var(--ink-2); margin-left: 4px; }
.card .sub { color: var(--ink-3); font-size: var(--t-sm); margin-top: 4px; }
.card .src { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--rule); font: 10.5px/1.3 var(--sans); color: var(--ink-4); letter-spacing: .01em; }
.card.na { background: var(--paper-2); border-style: dashed; }
.card.na .big { font: 500 var(--t-sm)/1.45 var(--sans); color: var(--ink-3); letter-spacing: 0; }
.card.alert { border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); box-shadow: inset 3px 0 0 var(--warn); }
.card.alert h3 { color: var(--warn); }
.card .note { margin-top: 10px; padding: 8px 10px; border-radius: var(--r-sm); background: var(--warn-wash); color: var(--warn); font: 600 var(--t-sm)/1.35 var(--sans); }

.range { position: relative; height: 30px; margin: 14px 0 4px; }
.range .track { position: absolute; left: 0; right: 0; top: 13px; height: 4px; border-radius: 2px; background: var(--paper-3); }
.range .band { position: absolute; top: 10px; height: 10px; border-radius: 5px; background: color-mix(in srgb, var(--harbour) 28%, var(--paper)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--harbour) 45%, transparent); }
.range .mid { position: absolute; top: 4px; width: 2px; margin-left: -1px; height: 22px; border-radius: 1px; background: var(--ink); }
.range .guide { position: absolute; top: -2px; width: 0; height: 34px; border-left: 2px dashed var(--bad); }
.range .guide::after { content: "guide"; position: absolute; top: -2px; left: 4px; font: 650 9px/1 var(--sans); letter-spacing: .06em; color: var(--bad); text-transform: uppercase; }
.range-labels { display: flex; justify-content: space-between; font: 11px/1 var(--sans); color: var(--ink-3); }
.conf { margin-top: 10px; display: flex; align-items: center; gap: 8px; font: 11px/1 var(--sans); color: var(--ink-3); }
.meter { flex: 1; height: 4px; background: var(--paper-3); border-radius: 2px; overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--ink-2); border-radius: 2px; }
.guide-row { margin-top: 8px; display: flex; gap: 6px; }
.guide-row input { flex: 1; min-width: 0; border: 1px solid var(--line-2); border-radius: var(--r-sm); padding: 8px 10px; background: var(--paper); transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
.guide-row input:focus { outline: none; border-color: var(--harbour); box-shadow: 0 0 0 3px var(--harbour-wash); }
.guide-verdict { margin-top: 8px; font-size: var(--t-sm); }
.guide-verdict:empty { display: none; }
.guide-verdict.below { color: var(--bad); font-weight: 600; } .guide-verdict.inside { color: var(--ok); font-weight: 600; } .guide-verdict.above { color: var(--warn); font-weight: 600; }

table.mini { width: 100%; border-collapse: collapse; font: var(--t-sm)/1.3 var(--sans); margin-top: 8px; }
table.mini td { padding: 6px 0; border-bottom: 1px solid var(--rule); color: var(--ink-2); }
table.mini td:last-child { text-align: right; color: var(--ink); font-weight: 600; }
table.mini tr:last-child td { border-bottom: 0; }
table.mini tr.head td { font: 600 var(--t-xs)/1.2 var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-4); }

.risk { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--rule); font-size: var(--t-sm); color: var(--ink-2); }
.risk:last-of-type { border-bottom: 0; }
.risk .on { color: var(--bad); font-weight: 650; } .risk .off { color: var(--ok); }

details.basics { padding: 0; }
details.basics summary { cursor: pointer; padding: 12px 14px; font: 600 var(--t-xs)/1.2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); list-style: none; display: flex; justify-content: space-between; }
details.basics summary::-webkit-details-marker { display: none; }
details.basics summary::after { content: "+"; font-size: 14px; line-height: .8; } details.basics[open] summary::after { content: "−"; }
details.basics > :not(summary) { margin: 0 14px 12px; width: calc(100% - 28px); }

details.na-line { padding: 2px 2px 0; font-size: var(--t-xs); color: var(--ink-4); }
details.na-line summary { cursor: pointer; list-style: none; display: flex; gap: 6px; align-items: baseline; line-height: 1.45; }
details.na-line summary::-webkit-details-marker { display: none; }
details.na-line summary .why { color: var(--ink-3); text-decoration: underline dotted; text-underline-offset: 2px; white-space: nowrap; }
details.na-line summary:hover .why, details.na-line summary:focus-visible .why { color: var(--ink); }
details.na-line[open] summary .why { text-decoration: none; }
details.na-line ul { margin: 6px 0 0; padding-left: 14px; display: grid; gap: 3px; color: var(--ink-3); }
details.na-line b { font-weight: 600; color: var(--ink-2); }

/* Verdict slot: reserves the verdict's height while the 3D headroom finding loads, so the swap doesn't shift the page. */
.verdict-slot { min-height: 104px; }
.price-block { padding: 2px 2px 10px; margin-bottom: 6px; border-bottom: 1px solid var(--line, rgba(0,0,0,.08)); }
.price-block .kicker { font: 600 var(--t-xs)/1.2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.price-block .price { margin-top: 6px; font: 500 var(--t-lg, 17px)/1.2 var(--serif); color: var(--ink-2, var(--ink)); }
.price-block .price b { font: 650 26px/1.05 var(--serif); letter-spacing: -.02em; color: var(--ink); }
.price-block .prow { margin-top: 8px; }
.price-block .prow.value b { color: var(--ink-2, var(--ink)); }
.price-block .pgap { margin-top: 10px; padding: 6px 8px; border-radius: 6px; font-size: var(--t-sm); background: var(--line, rgba(0,0,0,.05)); color: var(--ink); }
.price-block .pgap.above { border-left: 3px solid #c47a12; }
.price-block .pgap.below { border-left: 3px solid #2f7d4f; }
.price-block .psub { margin-top: 4px; font-size: var(--t-sm); color: var(--ink-3); }
.card .aq-head { font-size: var(--t-lg, 17px); line-height: 1.25; }
.card .cohort-pill { display: inline-block; margin-top: 8px; padding: 3px 9px; border-radius: 999px; font: 600 var(--t-xs)/1.4 var(--sans); background: var(--warn-wash); color: var(--warn); }
.card .scale-title { margin-top: 10px; font: 600 var(--t-xs)/1.3 var(--sans); color: var(--ink-3); }
.verdict-slot > .verdict.pending { animation: none; }
.verdict-slot > .verdict:not(.pending) { animation: gt-fade var(--dur, .2s) var(--ease, ease-out) both; }
@keyframes gt-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .verdict-slot > .verdict { animation: none !important; } }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); border-radius: var(--r-sm); padding: 8px 12px; cursor: pointer; font-weight: 600; font-size: var(--t-sm); transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease), background var(--dur) var(--ease); }
.btn:hover { opacity: .88; }
.btn:active { transform: translateY(1px); }
.btn.ghost { background: transparent; color: var(--ink); border-color: var(--line-2); }
.btn.ghost:hover { background: var(--paper-2); opacity: 1; }

/* BUILDING: bedroom chips as a segmented control. */
.beds { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 10px; padding: 3px; background: var(--paper-2); border: 1px solid var(--line); border-radius: 9px; }
.beds button { border: 0; background: transparent; padding: 7px 0; border-radius: 6px; cursor: pointer; font: 600 var(--t-md)/1 var(--sans); color: var(--ink-2); transition: background var(--dur) var(--ease), color var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
.beds button:hover { color: var(--ink); }
.beds button[aria-pressed="true"] { background: var(--paper); color: var(--ink); box-shadow: 0 1px 2px rgba(16,19,24,.12), 0 0 0 1px var(--line); }
.units { list-style: none; margin: 10px 0 0; padding: 0; max-height: 220px; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); }
.units li + li { border-top: 1px solid var(--rule); }
.units button { width: 100%; text-align: left; background: none; border: 0; padding: 9px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 500 var(--t-sm)/1.3 var(--sans); color: var(--ink); transition: background var(--dur) var(--ease); }
.units button span:last-child { color: var(--ink-3); font-size: 11px; }
.units button::after { content: "→"; color: var(--ink-4); transition: transform var(--dur) var(--ease), color var(--dur) var(--ease); }
.units button:hover { background: var(--paper-2); }
.units button:hover::after { color: var(--ink); transform: translateX(2px); }
.count { font: 600 var(--t-xs)/1 var(--sans); color: var(--ink-4); letter-spacing: .04em; text-transform: none; }

form.manual { display: grid; gap: 8px; }
form.manual label { font: 600 var(--t-xs)/1.2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
form.manual input { border: 1px solid var(--line-2); border-radius: var(--r-sm); padding: 10px 12px; background: var(--paper); }
form.manual input:focus { outline: none; border-color: var(--harbour); box-shadow: 0 0 0 3px var(--harbour-wash); }
.row { display: flex; gap: 8px; flex-wrap: wrap; }

/* Skeletons shaped like the final content. */
.loading { display: grid; gap: var(--s3); }
.skel { border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: grid; gap: 8px; }
.shimmer { height: 10px; border-radius: 4px; background: linear-gradient(90deg, var(--paper-2), var(--paper-3), var(--paper-2)); background-size: 200% 100%; animation: gt-sh 1.2s linear infinite; }
.shimmer.w30 { width: 30%; } .shimmer.w55 { width: 55%; } .shimmer.w80 { width: 80%; }
.shimmer.num { height: 28px; width: 46%; border-radius: 6px; }
.shimmer.h2 { height: 20px; width: 88%; border-radius: 5px; }
@keyframes gt-sh { to { background-position: -200% 0; } }

.err { border: 1px solid color-mix(in srgb, var(--bad) 30%, var(--line)); background: var(--bad-wash); color: var(--bad); border-radius: var(--r-md); padding: 12px 14px; font-size: var(--t-sm); }
.err b { display: block; margin-bottom: 4px; font-size: var(--t-md); }
.coverage { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.coverage span { font: 500 11px/1 var(--sans); padding: 5px 8px; border-radius: 999px; background: var(--paper-2); color: var(--ink-2); border: 1px solid var(--line); }
.foot { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 10.5px/1.45 var(--sans); color: var(--ink-4); border-top: 1px solid var(--line); padding-top: 12px; margin-top: 4px; }

/* Timelines (sale history, agency guide → sold), with "+N more" reveal. */
ol.tl { list-style: none; margin: 12px 0 0; padding: 0 0 0 14px; position: relative; display: grid; gap: 2px; }
ol.tl::before { content: ""; position: absolute; left: 3px; top: 8px; bottom: 8px; width: 1px; background: var(--line-2); }
ol.tl li { position: relative; display: grid; grid-template-columns: 82px 1fr auto; align-items: baseline; gap: 8px; padding: 5px 0; font-size: var(--t-sm); }
ol.tl li::before { content: ""; position: absolute; left: -14px; top: 10px; width: 7px; height: 7px; border-radius: 50%; background: var(--paper); border: 1.5px solid var(--ink-3); }
ol.tl li:first-child::before { background: var(--ink); border-color: var(--ink); }
ol.tl li[hidden] { display: none; }
ol.tl .when { color: var(--ink-3); font-size: 11px; }
ol.tl .what { color: var(--ink); font-weight: 600; }
ol.tl.aq-sales li { display: block; }
ol.tl.aq-sales .addr { display: block; color: var(--ink); font-weight: 600; }
ol.tl.aq-sales .what { font-weight: 500; color: var(--ink-2, var(--ink)); }
ol.tl.aq-sales .when-inline { color: var(--ink-3); font-size: 11px; }
.aq-others { margin-top: 14px; }
.delta { font: 650 10.5px/1 var(--sans); padding: 3px 6px; border-radius: 999px; background: var(--grey-wash); color: var(--grey); }
.delta.up { background: var(--warn-wash); color: var(--warn); } .delta.down { background: var(--ok-wash); color: var(--ok); }
.more { background: none; border: 0; padding: 6px 0 0; margin-left: -14px; cursor: pointer; font: 600 11.5px/1 var(--sans); color: var(--harbour); }
.more:hover { text-decoration: underline; text-underline-offset: 3px; }
.kv { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; font-size: var(--t-sm); color: var(--ink-3); }
.kv b { color: var(--ink); font-weight: 650; }

/* Agency accuracy scale: linear, zero marked, marker = median sale vs guide. */
.scale { margin: 32px 0 2px; }
.scale-track { position: relative; height: 8px; border-radius: 4px; background: var(--paper-3); }
.scale-track .zone { position: absolute; top: 0; bottom: 0; border-radius: 4px; opacity: .55; }
.scale-track .zone.ok { background: color-mix(in srgb, var(--ok) 45%, transparent); }
.scale-track .zone.warn { background: linear-gradient(90deg, color-mix(in srgb, var(--warn) 25%, transparent), color-mix(in srgb, var(--warn) 70%, transparent)); }
.scale-track .zero { position: absolute; top: -3px; width: 1px; height: 14px; background: var(--ink-3); }
.scale-track .marker { position: absolute; top: -5px; width: 4px; height: 18px; margin-left: -2px; border-radius: 2px; background: var(--ink); box-shadow: 0 0 0 2px var(--paper); }
.scale-track .marker span { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%); font: 700 11px/1 var(--sans); color: var(--ink); white-space: nowrap; background: var(--paper); padding: 2px 4px; border-radius: 4px; }
.scale-labels { position: relative; height: 14px; margin-top: 6px; font: 10.5px/1 var(--sans); color: var(--ink-4); }
.scale-labels span { position: absolute; top: 0; }
.scale-labels span:first-child { left: 0; } .scale-labels span:last-child { right: 0; }
.scale-labels span:nth-child(2) { transform: translateX(-50%); }

/* 3D card container (the map itself belongs to context3d). */
.gt .card.c3 { padding-bottom: 12px; }
.gt .card.c3 .c3-stage { margin-inline: -14px; }

@media (max-width: 420px) {
  .embedded .brand .word { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet, .shimmer, .body > .rise, .receipt.open .rbody, .pill.LOADING::before, .receipt.LOADING .seal { animation: none; }
  .card, .btn, .tab, .beds button, .units button { transition: none; }
}
`;
