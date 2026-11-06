var ne=Object.defineProperty;var ae=(r,e,t)=>e in r?ne(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var g=(r,e,t)=>ae(r,typeof e!="symbol"?e+"":e,t);var P=globalThis.__GT_PROXY_BASE__??"http://localhost:3000",F=globalThis.__GT_CLIENT_TOKEN__??"groundtruth-hackathon-2026",I="X-Groundtruth-Client",G=8e3,A=600*1e3;var v=class extends Error{constructor(t,a){super(t);g(this,"kind",a)}},k={base:P,token:F};function B(r){k={base:(r.proxyBase??k.base).replace(/\/$/,""),token:r.clientToken??k.token}}async function U(r,e,t){let a=new AbortController,o=setTimeout(()=>a.abort(),G),s;try{s=await t(`${k.base}${r}`,{...e,signal:a.signal,headers:{"Content-Type":"application/json",...k.token?{[I]:k.token}:{},...e.headers??{}}})}catch{throw new v(`Groundtruth proxy unreachable at ${k.base||"this site"}`,"unreachable")}finally{clearTimeout(o)}if(!s.ok)throw new v(`Proxy returned HTTP ${s.status}`,"http");try{return await s.json()}catch{throw new v("Proxy returned a malformed response","bad-response")}}function oe(r){return!!r&&typeof r.state=="string"&&typeof r.receipt=="object"&&Array.isArray(r.candidates??[])}async function D(r,e=fetch){let t=await U("/api/resolve",{method:"POST",body:JSON.stringify(r)},e);if(!oe(t))throw new v("Proxy resolve response missing fields","bad-response");return{...t,candidates:t.candidates??[]}}async function j(r,e=fetch){let t=await U(`/api/facts/${encodeURIComponent(r)}`,{method:"GET"},e);if(!t||typeof t.facts!="object")throw new v("Proxy facts response missing fields","bad-response");return t}function n(r,e={},...t){let a=document.createElement(r);for(let[o,s]of Object.entries(e))s==null||s===!1||(o.startsWith("on")&&typeof s=="function"?a.addEventListener(o.slice(2).toLowerCase(),s):o==="class"?a.className=String(s):s===!0?a.setAttribute(o,""):a.setAttribute(o,String(s)));for(let o of t)o==null||o===!1||a.append(typeof o=="string"?document.createTextNode(o):o);return a}function m(r){return r==null||!Number.isFinite(r)?"\u2014":Math.abs(r)>=1e6?`$${(r/1e6).toFixed(2).replace(/\.?0+$/,"")}m`:Math.abs(r)>=1e5?`$${Math.round(r/1e3)}k`:`$${Math.round(r).toLocaleString("en-AU")}`}function C(r){if(r==null||!Number.isFinite(r))return"\u2014";let e=Math.abs(r)<=1?r*100:r;return`${Math.round(e)}%`}function p(r,e){if(!r||typeof r!="object")return null;for(let t of e){let a=r[t],o=typeof a=="number"?a:typeof a=="string"&&a.trim()!==""?Number(a.replace(/[$,%\s]/g,"")):NaN;if(Number.isFinite(o))return o}return null}function x(r,e){if(!r||typeof r!="object")return null;for(let t of e){let a=r[t];if(typeof a=="string"&&a.trim())return a.trim()}return null}function se(r){let e=/(\d+(?:[.,]\d+)*)\s*(m(?:il(?:lion)?)?|k)?\b/i.exec(r);if(!e)return null;let t=Number(e[1].replace(/,/g,"")),a=(e[2]??"").toLowerCase();return a.startsWith("m")?t*=1e6:a==="k"&&(t*=1e3),Number.isFinite(t)&&t>=1e4?t:null}function M(r){let e=(r??"").trim();if(!e)return null;let t=e.split(/\s*(?:-|–|to)\s*(?=\$?\d)/i).map(se).filter(a=>a!==null);return t.length===0?null:Math.round(t.reduce((a,o)=>a+o,0)/t.length)}function z(r,e){return{position:r<e.low?"below":r>e.high?"above":"inside",gapPct:(r-e.mid)/e.mid*100}}var ie=.4,X=r=>r.replace(/_/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").toLowerCase();function V(r,e=6){if(!r||typeof r!="object"||Array.isArray(r))return null;let t=Object.entries(r).filter(([,a])=>["string","number","boolean"].includes(typeof a)).slice(0,e).map(([a,o])=>n("tr",{},n("td",{},X(a)),n("td",{},typeof o=="number"&&o>1e4?m(o):String(o))));return t.length?n("table",{class:"mini"},...t):null}function w(r,e,t,a=""){if(!e||!e.available||e.data===null||e.data===void 0)return n("section",{class:"card na","aria-label":r},n("h3",{},r),n("div",{class:"big"},e?.reason?`Not available: ${e.reason}`:"Not available for this home"));let o=null;try{o=t(e.data)}catch{o=null}let s=V(e.data);return n("section",{class:`card ${a}`.trim(),"aria-label":r},n("h3",{},r),...o??(s?[s]:[n("div",{class:"sub"},"Data received, nothing to summarise.")]))}function le(r){let e=r?.data,t=p(e,["underquote_rate_pct","underquote_rate","underquoting_rate","pct_underquoted"]),a=t===null?null:t>1?t/100:t,o=x(e,["cohort"]),s=a!==null&&a>=ie||/underquot/i.test(o??"");return w("Agency quoting accuracy",r,l=>{if(a===null&&!o)return null;let d=x(l,["agency_name","agency"]),c=p(l,["median_deviation_pct","avg_gap_pct"]),h=p(l,["total_sales","n_sales","sample_size"]),i=p(l,["likely_sale_price"]),u=Array.isArray(l?.recent_sales)?l.recent_sales.slice(0,3):[];return[n("div",{class:"big"},a!==null?`${C(a)} of sales beat the guide`:o??""),n("div",{class:"sub"},[d,o,h!==null?`${h} tracked sales`:null,c!==null?`median ${c>0?"+":""}${c}% vs guide`:null].filter(Boolean).join(" \xB7 ")),i!==null?n("div",{class:"sub"},`Likely sale price: ${m(i)}`):null,u.length?n("table",{class:"mini","aria-label":"Recent agency sales: guide vs sold"},...u.map(f=>n("tr",{},n("td",{},`${m(p(f,["guide_price"]))} \u2192 ${m(p(f,["sold_price"]))}`),n("td",{},f.diff_pct!==void 0?`${f.diff_pct>0?"+":""}${f.diff_pct}%`:"")))):null,s?n("div",{class:"sub",role:"note",style:"margin-top:6px;font-weight:600"},"Treat the advertised guide as a floor, not an estimate."):null].filter(Boolean)},s?"alert":"")}function de(r){let e=p(r,["predicted_price","value","estimate","mid"]),t=p(r,["predicted_price_low","low","lower"]),a=p(r,["predicted_price_high","high","upper"]);return e!==null&&t!==null&&a!==null&&a>t?{low:t,mid:e,high:a}:null}function q(r,e){let t=Math.min(r.low,e??r.low)*.92,a=Math.max(r.high,e??r.high)*1.08,o=s=>`${(s-t)/(a-t)*100}%`;return n("div",{class:"range",role:"img","aria-label":`80% range ${m(r.low)} to ${m(r.high)}, estimate ${m(r.mid)}${e?`, your guide ${m(e)}`:""}`},n("div",{class:"track"}),n("div",{class:"band",style:`left:${o(r.low)};width:calc(${o(r.high)} - ${o(r.low)})`}),n("div",{class:"mid",style:`left:${o(r.mid)}`}),e!==null?n("div",{class:"guide",style:`left:${o(e)}`}):null)}function ce(r,e){return w("Microburbs value",r,t=>{let a=de(t);if(!a)return null;let o=p(t,["confidence","confidence_score","accuracy"]),s=n("div",{},q(a,M(e.value))),l=n("div",{class:"guide-verdict","aria-live":"polite"}),d=()=>{let i=M(e.value);if(s.replaceChildren(q(a,i)),i===null){l.className="guide-verdict",l.textContent="";return}let u=z(i,a);l.className=`guide-verdict ${u.position}`,l.textContent=u.position==="below"?`Guide ${m(i)} is below the 80% range: ${Math.abs(Math.round(u.gapPct))}% under the estimate.`:u.position==="above"?`Guide ${m(i)} is above the 80% range.`:`Guide ${m(i)} sits inside the range.`},c=n("input",{type:"text",inputmode:"decimal",placeholder:"e.g. $1.1m","aria-label":"Guide price you were quoted",value:e.value,onInput:i=>{e.value=i.target.value,d()}});queueMicrotask(d);let h=x(t,["prediction_date","date"]);return[n("div",{class:"big"},m(a.mid)),n("div",{class:"sub"},`80% range ${m(a.low)} \u2013 ${m(a.high)}${h?` \xB7 as of ${h}`:""}`),s,n("div",{class:"range-labels"},n("span",{},m(a.low)),n("span",{},m(a.high))),o!==null?n("div",{class:"conf"},n("span",{},"confidence"),n("div",{class:"meter"},n("i",{style:`width:${Math.min(100,o<=1?o*100:o)}%`})),n("span",{},C(o))):null,n("label",{class:"sub",style:"display:block;margin-top:10px"},"Type the guide you were given (stays on this page):"),n("div",{class:"guide-row"},c),l].filter(Boolean)},"hero")}function ue(r){return w("Last sales",r,e=>{let t=Array.isArray(e)?e:Array.isArray(e?.sales)?e.sales:null;if(!t||t.length===0)return[n("div",{class:"big"},"No recorded sales")];let a=t.slice(0,4).map(o=>n("tr",{},n("td",{},String(o.date??o.sold_date??"").slice(0,10)||"\u2014"),n("td",{},p(o,["price","sold_price"])!==null?m(p(o,["price","sold_price"])):String(o.type??"\u2014"))));return[n("table",{class:"mini"},...a)]})}function pe(r){return w("Street vs suburb",r,e=>{let t=e?.profile??e,a=e?.suburb_medians??{},s=[["growth forecast /yr",p(t,["annual_4y"]),p(a,["annual_4y"]),c=>`${c}%`],["past growth /yr",p(t,["past_growth_pct"]),p(a,["past_growth_pct"]),c=>`${c}%`],["renters",p(t,["renters_pct"]),p(a,["renters_pct"]),c=>`${c}%`]].filter(([,c,h])=>c!==null||h!==null);if(!s.length)return null;let l=x(e?.forecast_rank,["band"]),d=x(t,["title"])??x(e,["street"])??"This street";return[n("table",{class:"mini"},n("tr",{},n("td",{},""),n("td",{},`${d} \xB7 suburb`)),...s.map(([c,h,i,u])=>n("tr",{},n("td",{},c),n("td",{},`${h!==null?u(h):"\u2014"} \xB7 ${i!==null?u(i):"\u2014"}`)))),l?n("div",{class:"sub",style:"margin-top:6px"},`Street forecast rank: ${l}`):null].filter(Boolean)})}function me(r){return w("Risk overlays",r,e=>{if(!e||typeof e!="object")return null;let t=Object.entries(e).flatMap(([a,o])=>(Array.isArray(o)?o:[o]).map(s=>({k:a,x:s})));return t.length?t.slice(0,8).map(({k:a,x:o})=>{let s=o?.on_property===!0,l=typeof o?.name=="string"?o.name:X(a),d=typeof o?.value=="string"?o.value:s?"On property":typeof o=="string"?o:"";return n("div",{class:"risk"},n("span",{},l),n("span",{class:s?"on":"off"},d||(s?"On property":"Clear")))}):[n("div",{class:"big"},"No overlays flagged")]})}function ge(r){return w("Strata levy (suburb median)",r,e=>{let t=p(e,["median_levy_annual","levy_annual","median_levy"]);if(t===null)return null;let a=p(e,["n_properties","count"]),o=x(e,["area_name","suburb"]);return[n("div",{class:"big"},`${m(t)}/yr`),n("div",{class:"sub"},`${m(t/4)} a quarter${o?` \xB7 ${o}`:""}${a!==null?` \xB7 ${a} buildings`:""}`)]})}function fe(r){let e=r?.available&&r.data?V(r.data,10):null;return n("details",{class:"card basics"},n("summary",{},"Basics"),e??n("div",{class:"sub",style:"margin-top:6px"},r?.reason??"Not available for this home"))}function W(r,e){let t=r.facts;return[le(t.agentQuoting),ce(t.avm,e),ue(t.saleHistory),pe(t.streetProfile),me(t.risks),ge(t.strataLevy),fe(t.basics)]}var K=`
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
details.basics summary::before { content: "+ "; } details.basics[open] summary::before { content: "\u2212 "; }

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
`;var Q={EXACT:"Exact",BUILDING:"Building",CHOOSE:"Choose",NO_MATCH:"No match",OUT_OF_AREA:"Out of area",LOADING:"Reading",ERROR:"Offline"},he={EXACT:"#1f7a4d",BUILDING:"#a96500",CHOOSE:"#2c79b5",NO_MATCH:"#b4232c",OUT_OF_AREA:"#8a93a2",LOADING:"#8a93a2",ERROR:"#b4232c"},be={h1:"page heading","h1+json-ld":"heading \u2713 structured data",__NEXT_DATA__:"page data (id-matched)",manual:"typed by you"},_=class{constructor(e,t={}){g(this,"handlers",e);g(this,"opts",t);g(this,"host");g(this,"root");g(this,"wrap");g(this,"collapsed",!1);g(this,"view",null);g(this,"guide",{value:""});this.host=document.createElement("groundtruth-panel"),this.root=this.host.attachShadow({mode:"closed"}),this.root.append(n("style",{},K)),this.wrap=n("div",{class:"gt"}),this.root.append(this.wrap);try{this.collapsed=sessionStorage.getItem("gt:collapsed")==="1"}catch{}this.mount()}mount(){this.host.isConnected||(this.opts.container??document.documentElement).append(this.host)}destroy(){this.host.remove()}resetGuide(){this.guide={value:""}}render(e){this.view=e,this.mount();let t=this.stateOf(e);this.wrap.className=`gt${this.opts.container?" embedded":""}${this.collapsed?" collapsed":""}`;let a=n("button",{class:"tab","aria-expanded":String(!this.collapsed),"aria-label":`Groundtruth: ${Q[t]}. ${this.collapsed?"Expand":"Collapse"} panel`,onClick:()=>this.toggle()},n("span",{class:"dot",style:`background:${he[t]}`}),"Groundtruth"),o=n("aside",{class:"sheet","aria-label":"Groundtruth property facts"},n("header",{class:"top"},n("div",{class:"brand"},"Groundtruth",n("small",{},"Microburbs facts")),n("div",{class:"spacer"}),n("span",{class:`pill ${t}`},Q[t]),n("button",{class:"icon-btn","aria-label":"Collapse panel",onClick:()=>this.toggle()},"\u203A")),n("div",{class:"body"},...this.bodyFor(e)));this.wrap.replaceChildren(a,o)}toggle(){this.collapsed=!this.collapsed;try{sessionStorage.setItem("gt:collapsed",this.collapsed?"1":"0")}catch{}this.view&&this.render(this.view)}stateOf(e){return e.kind==="loading"||e.kind==="manual"?"LOADING":e.kind==="error"?"ERROR":e.picked?"EXACT":e.resolve.state}bodyFor(e){switch(e.kind){case"loading":return[this.receipt(e.ex,null),n("div",{class:"loading","aria-busy":"true","aria-label":"Looking up this home"},n("div",{class:"shimmer"}),n("div",{class:"shimmer"}))];case"error":return[e.ex?this.receipt(e.ex,null):null,n("div",{class:"err",role:"alert"},n("b",{},"Can\u2019t reach Groundtruth"),e.message),n("div",{class:"row"},n("button",{class:"btn",onClick:()=>this.handlers.onRetry()},"Try again"),n("button",{class:"btn ghost",onClick:()=>this.render({kind:"manual",prefill:e.ex?.raw??""})},"Type address"))].filter(Boolean);case"manual":return[this.manualForm(e.prefill)];case"result":return this.resultBody(e)}}wrongHome(e){return n("div",{class:"msg"},n("button",{class:"link",onClick:()=>this.render({kind:"manual",prefill:e.raw})},"Wrong home?")," Type the address yourself.")}resultBody(e){let t=[this.receipt(e.ex,e.resolve,e.picked)],a=e.picked?"EXACT":e.resolve.state;return a!=="EXACT"&&e.resolve.message&&t.push(n("div",{class:"msg"},e.resolve.message)),a==="BUILDING"&&t.push(this.buildingBlock(e)),a==="CHOOSE"&&t.push(this.candidateList("Which home is it?",e.resolve.candidates)),a==="OUT_OF_AREA"&&t.push(n("div",{class:"card na"},n("h3",{},"Outside the pilot area"),n("div",{class:"big"},"Groundtruth covers the 29 City of Sydney suburbs for now."))),a==="EXACT"&&(e.factsPending?t.push(n("div",{class:"loading","aria-busy":"true"},n("div",{class:"shimmer"}),n("div",{class:"shimmer"}))):e.facts?t.push(...W(e.facts,this.guide)):t.push(n("div",{class:"err",role:"alert"},n("b",{},"Facts unavailable"),e.factsError??"The proxy did not return facts.",n("div",{style:"margin-top:8px"},n("button",{class:"btn",onClick:()=>this.handlers.onRetry()},"Try again"))))),t.push(this.wrongHome(e.ex)),t.push(n("div",{class:"foot"},"Only the address was read from this page. Data: Microburbs, G-NAF.")),t}buildingBlock(e){let t=[1,2,3,4].map(a=>n("button",{class:"btn ghost","aria-pressed":String(e.bedrooms===a),onClick:()=>this.handlers.onBedrooms(a)},a===4?"4+":String(a)));return n("section",{class:"card","aria-label":"Narrow down the unit"},n("h3",{},"Which unit?"),n("div",{class:"sub"},"The listing doesn\u2019t say which unit. How many bedrooms?"),n("div",{class:"beds",role:"group","aria-label":"Bedrooms"},...t),e.resolve.candidates.length?this.unitList(e.resolve.candidates):null)}unitList(e){return n("ul",{class:"units","aria-label":"Units at this address"},...e.slice(0,60).map(t=>n("li",{},n("button",{onClick:()=>this.handlers.onPick(t)},n("span",{},t.label),n("span",{},t.bedrooms?`${t.bedrooms} bed`:"")))))}candidateList(e,t){return n("section",{class:"card"},n("h3",{},e),t.length?this.unitList(t):n("div",{class:"sub"},"No candidates returned."))}receipt(e,t,a){let o=t?.receipt?.checks??{},s=Object.entries(o).map(([d,c])=>n("span",{class:c?"y":"n"},`${c?"\u2713":"\u2717"} ${d}`)),l=a?.gnafId??t?.gnafId??null;return n("section",{class:"receipt","aria-label":"Match receipt"},n("div",{class:"ttl"},n("span",{},"Match receipt"),n("span",{},t?`conf ${Math.round(t.confidence)}`:"\u2026")),n("dl",{},n("dt",{},"read"),n("dd",{},e.raw),n("dt",{},"from"),n("dd",{},`${this.opts.siteLabel?.(e)??(e.source==="manual"?"you":e.source==="rea"?"realestate.com.au":"domain.com.au")} \xB7 ${be[e.from]??e.from}`),n("dt",{},"normalised"),n("dd",{},a?a.label:t?.receipt?.normalised??"\u2026"),n("dt",{},"g-naf"),n("dd",{},l??"\u2014"),s.length?n("dt",{},"checks"):null,s.length?n("dd",{class:"checks"},...s):null))}manualForm(e){let t=n("input",{id:"gt-manual",type:"text",value:e,autocomplete:"off",placeholder:"12/45 Crown Street, Surry Hills NSW 2010"});return queueMicrotask(()=>t.focus()),n("form",{class:"manual",onSubmit:a=>{a.preventDefault(),t.value.trim()&&this.handlers.onManual(t.value.trim())}},n("label",{for:"gt-manual"},"Address of the home"),t,n("div",{class:"row"},n("button",{class:"btn",type:"submit"},"Look up"),n("button",{class:"btn ghost",type:"button",onClick:()=>this.handlers.onRetry()},"Back to listing")))}};var L=class{constructor(){g(this,"token",0);g(this,"key",null)}begin(e){return this.key=e,++this.token}isCurrent(e,t){return e===this.token&&t===this.key}get current(){return this.key}};var ve="NSW|VIC|QLD|SA|WA|TAS|NT|ACT",ye=new RegExp(`[,\\s]+(${ve})\\.?(?:[,\\s]+(\\d{4}))?\\s*$`,"i"),xe=/[,\s]+(\d{4})\s*$/,ke=/^(?:level|lvl|floor)\s+\w+\s*,?\s*/i,Z="[A-Z]{0,2}\\d+[A-Z]{0,2}",we=new RegExp(`^(?:unit|apartment|apt|shop|suite|penthouse|lot|villa|flat|townhouse|studio|u)\\.?\\s*(${Z})\\s*[,/]?\\s*`,"i"),Ee=new RegExp(`^(${Z})\\s*/\\s*(.+)$`,"i"),Te=/^(\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?)\s+(.*[A-Za-z].*)$/i,E=r=>r.replace(/\s+/g," ").trim();function Re(r){let e=ye.exec(r);if(e)return{rest:r.slice(0,e.index),state:e[1].toUpperCase(),postcode:e[2]??null};let t=xe.exec(r);return t?{rest:r.slice(0,t.index),state:null,postcode:t[1]}:{rest:r,state:null,postcode:null}}function _e(r){let e=E(r).replace(ke,""),t=null,a=we.exec(e);a&&(t=a[1].toUpperCase(),e=e.slice(a[0].length));let o=Ee.exec(e);o&&(t===null&&(t=o[1].toUpperCase()),e=o[2]);let s=Te.exec(E(e));return s?{unit:t,number:s[1].replace(/\s+/g,"").toUpperCase(),street:E(s[2])}:null}function $(r){let e=E(r??"").replace(/,\s*$/,"");if(!e)return null;let{rest:t,state:a,postcode:o}=Re(e),s=t.split(",").map(E).filter(Boolean);if(s.length<2)return null;let l=s[s.length-1],d=_e(s.slice(0,-1).join(", "));return!d||!/[A-Za-z]/.test(l)?null:{unit:d.unit,number:d.number,street:d.street,suburb:l,state:a,postcode:o}}var T=class{constructor(e,t=50,a=()=>Date.now()){g(this,"ttlMs",e);g(this,"max",t);g(this,"now",a);g(this,"store",new Map)}get(e){let t=this.store.get(e);if(t){if(this.now()-t.at>this.ttlMs){this.store.delete(e);return}return t.value}}set(e,t){for(this.store.delete(e),this.store.set(e,{at:this.now(),value:t});this.store.size>this.max;)this.store.delete(this.store.keys().next().value)}};var Y=new T(A),J=new T(A);function Le(r,e){return`${r}|${e.bedrooms??""}|${e.raw}`}async function S(r,e=fetch){let t=J.get(r);if(t)return t;let a=await j(r,e);return J.set(r,a),a}async function ee(r,e,t=fetch){let a=Le(r,e),o=Y.get(a);if(o)return o;try{let s=await D(e,t),l=null,d;if(s.gnafId&&s.state==="EXACT")try{l=await S(s.gnafId,t)}catch(h){d=h.message}let c={ok:!0,key:r,resolve:s,facts:l,factsError:d};return d||Y.set(a,c),c}catch(s){let l=s instanceof v?s:new v(String(s?.message??s),"unreachable");return{ok:!1,key:r,error:l.message,kind:l.kind}}}function O(r){let e=r.replace(/\s+/g," ").trim();return{source:"manual",listingId:null,raw:e,parts:$(e),from:"manual"}}var te=r=>`${r.source}:${r.listingId??r.raw}`,$e=r=>new Promise(e=>setTimeout(e,r));function lt(r,e={}){B({proxyBase:e.proxyBase??"",clientToken:e.clientToken??""});let t=e.onEvent??(()=>{}),a=e.siteName??"this page",o=new L,s=null,l=null,d=new _({onBedrooms:i=>{l&&c(l.ex,i)},onPick:i=>{h(i)},onManual:i=>{c(O(i),null)},onRetry:()=>{s&&c(s,null)}},{container:r,siteLabel:i=>i.source==="manual"&&i.from==="manual"?"you":a});async function c(i,u,f=0){let b=te(i),R=o.begin(b);i.from!=="manual"&&(s=i),d.resetGuide(),d.render({kind:"loading",ex:i}),t({type:"lookup",key:b,raw:i.raw}),f>0&&await $e(f);let y=await ee(b,{source:i.source,raw:i.raw,parts:i.parts,bedrooms:u});if(!o.isCurrent(R,b)){t({type:"stale-dropped",key:b,raw:i.raw});return}if(!y.ok){d.render({kind:"error",ex:i,message:y.error});return}l={ex:i,resolve:y.resolve,bedrooms:u},d.render({kind:"result",ex:i,resolve:y.resolve,facts:y.facts,factsError:y.factsError,bedrooms:u}),t({type:"rendered",key:b,state:y.resolve.state})}async function h(i){if(!l)return;let{ex:u,resolve:f,bedrooms:b}=l,R=te(u),y=o.begin(R);d.render({kind:"result",ex:u,resolve:f,facts:null,bedrooms:b,picked:i,factsPending:!0});let N=null,H;try{N=await S(i.gnafId)}catch(re){H=re.message}o.isCurrent(y,R)&&d.render({kind:"result",ex:u,resolve:f,facts:N,factsError:H,bedrooms:b,picked:i})}return{showListing(i,u={}){let f=i.replace(/\s+/g," ").trim(),b={source:"manual",listingId:u.listingId??f,raw:f,parts:$(f),from:"h1"};return c(b,null,u.delayMs??0)},showManual(i){return c(O(i),null)},destroy(){d.destroy()}}}export{lt as mount};
