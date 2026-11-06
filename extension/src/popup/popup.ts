import type { BgRequest, LookupResult } from '../api-types';
import { CLIENT_HEADER, CLIENT_TOKEN, PROXY_BASE } from '../config';
import { manualExtraction } from '../manual';
import { money, pickNumber } from '../content/format';

const out = document.getElementById('out')!;
const health = document.getElementById('health')!;

function line(text: string, cls = ''): HTMLElement {
  const d = document.createElement('div');
  d.textContent = text;
  if (cls) d.className = cls;
  return d;
}

document.getElementById('f')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = (document.getElementById('addr') as HTMLInputElement).value.trim();
  if (!text) return;
  const ex = manualExtraction(text);
  out.replaceChildren(line('Looking up…'));
  const msg: BgRequest = { type: 'gt:lookup', key: `manual:${ex.raw}`, from: 'manual', req: { source: 'manual', raw: ex.raw, parts: ex.parts, bedrooms: null } };
  const r = (await chrome.runtime.sendMessage(msg).catch(() => null)) as LookupResult | null;
  if (!r) { out.replaceChildren(line('Extension background not responding.', 'err')); return; }
  if (!r.ok) { out.replaceChildren(line(r.error, 'err')); return; }
  const nodes: HTMLElement[] = [line(`${r.resolve.state} · conf ${r.resolve.confidence}`, 'st'), line(r.resolve.receipt.normalised)];
  if (r.resolve.message) nodes.push(line(r.resolve.message));
  const avm = r.facts?.facts.avm;
  if (avm?.available) nodes.push(line(`Value ${money(pickNumber(avm.data, ['predicted_price']))} (${money(pickNumber(avm.data, ['predicted_price_low']))}–${money(pickNumber(avm.data, ['predicted_price_high']))})`));
  if (r.resolve.state !== 'EXACT' && r.resolve.candidates.length) {
    const ul = document.createElement('ul');
    r.resolve.candidates.slice(0, 8).forEach((c) => ul.append(Object.assign(document.createElement('li'), { textContent: c.label })));
    nodes.push(ul);
  }
  nodes.push(line('Open the listing page for the full panel.'));
  out.replaceChildren(...nodes);
});

fetch(`${PROXY_BASE}/api/health`, { headers: { [CLIENT_HEADER]: CLIENT_TOKEN } })
  .then((r) => r.json())
  .then((j: { ok?: boolean; mock?: boolean }) => { health.textContent = `Proxy ${PROXY_BASE}: ${j.ok ? 'online' : 'error'}${j.mock ? ' (mock data)' : ''}`; })
  .catch(() => { health.textContent = `Proxy ${PROXY_BASE}: unreachable`; health.style.color = '#b4232c'; });
