#!/usr/bin/env node
// Groundtruth held-out eval.
// Reads eval/heldout-labels.csv, calls POST {PROXY}/api/resolve for each row,
// compares to labels, prints a summary and writes eval/results.md.
//
// Usage:
//   GROUNDTRUTH_CLIENT_TOKEN=... node eval/run-eval.mjs
// Env:
//   GROUNDTRUTH_CLIENT_TOKEN  required, sent as X-Groundtruth-Client
//   PROXY_BASE                default http://localhost:3000
//   EVAL_PARTS                "none" (default): send raw only, parts:null — tests the full parse+resolve path
//                             "hand": send the hand-parsed parts from the CSV — isolates the resolver
//   EVAL_DELAY_MS             pause between requests (default 150)
//
// Never writes raw API payloads to disk: results.md holds only state, confidence, gnafId and a truncated message.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LABELS = join(HERE, 'heldout-labels.csv');
const RESULTS = join(HERE, 'results.md');
const PROXY = (process.env.PROXY_BASE || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.GROUNDTRUTH_CLIENT_TOKEN || '';
const PARTS_MODE = process.env.EVAL_PARTS === 'hand' ? 'hand' : 'none';
const DELAY_MS = Number(process.env.EVAL_DELAY_MS || 150);
const VALID_STATES = new Set(['EXACT', 'BUILDING', 'CHOOSE', 'NO_MATCH', 'OUT_OF_AREA']);

// Minimal RFC-4180 CSV parser (quoted fields, doubled quotes, CRLF).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function buildRequest(label) {
  const parts = PARTS_MODE === 'hand'
    ? {
        unit: label.unit || null,
        number: label.number || null,
        street: label.street || null,
        suburb: label.suburb || null,
        state: 'NSW',
        postcode: label.postcode || null,
      }
    : null;
  return { source: label.site === 'domain' ? 'domain' : 'rea', raw: label.displayed_address, parts, bedrooms: null };
}

async function resolve(label) {
  const started = Date.now();
  try {
    const res = await fetch(`${PROXY}/api/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Groundtruth-Client': TOKEN },
      body: JSON.stringify(buildRequest(label)),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { error: `HTTP ${res.status}`, ms };
    const body = await res.json();
    const state = VALID_STATES.has(body?.state) ? body.state : null;
    if (!state) return { error: `invalid state ${JSON.stringify(body?.state)}`, ms };
    return {
      state,
      confidence: typeof body.confidence === 'number' ? body.confidence : null,
      gnafId: body.gnafId || null,
      message: typeof body.message === 'string' ? body.message.slice(0, 120) : '',
      ms,
    };
  } catch (err) {
    return { error: `request failed: ${err.message}`, ms: Date.now() - started };
  }
}

// Classify one row. A "false match" is the outcome we care about most:
// the resolver said EXACT but it is not the labelled home.
export function judge(label, got) {
  const expected = label.expected_state;
  if (got.error) return { verdict: 'ERROR', falseMatch: false, correct: false };
  if (got.state === 'EXACT') {
    if (expected !== 'EXACT') return { verdict: 'FALSE_MATCH (EXACT on non-exact label)', falseMatch: true, correct: false };
    if (label.gnaf_id && got.gnafId !== label.gnaf_id) return { verdict: 'FALSE_MATCH (wrong G-NAF id)', falseMatch: true, correct: false };
    return { verdict: label.gnaf_id ? 'OK' : 'OK (gnaf_id unlabelled)', falseMatch: false, correct: true };
  }
  if (got.state === expected) return { verdict: 'OK', falseMatch: false, correct: true };
  // CHOOSE in place of BUILDING is a safe, acceptable outcome.
  if (expected === 'BUILDING' && got.state === 'CHOOSE') return { verdict: 'OK (CHOOSE~BUILDING)', falseMatch: false, correct: true };
  return { verdict: `MISS (expected ${expected})`, falseMatch: false, correct: false };
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarise(rows) {
  const total = rows.length;
  const scored = rows.filter((r) => !r.got.error);
  const count = (fn) => rows.filter(fn).length;
  const falseMatches = count((r) => r.j.falseMatch);
  const returnedExact = count((r) => r.got.state === 'EXACT');
  const expExact = rows.filter((r) => r.label.expected_state === 'EXACT');
  const expBuilding = rows.filter((r) => r.label.expected_state === 'BUILDING');
  const expOut = rows.filter((r) => r.label.expected_state === 'OUT_OF_AREA');
  const inArea = rows.filter((r) => r.label.expected_state !== 'OUT_OF_AREA');
  return {
    total,
    errors: total - scored.length,
    falseMatches,
    returnedExact,
    exactHit: count((r) => r.label.expected_state === 'EXACT' && r.j.correct),
    expExact: expExact.length,
    buildingHit: expBuilding.filter((r) => r.j.correct).length,
    expBuilding: expBuilding.length,
    outHit: expOut.filter((r) => r.got.state === 'OUT_OF_AREA').length,
    expOut: expOut.length,
    inAreaWronglyOut: inArea.filter((r) => r.got.state === 'OUT_OF_AREA').length,
    inArea: inArea.length,
    correct: count((r) => r.j.correct),
  };
}

function perPattern(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.label.pattern || '(none)';
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pattern, rs]) => ({
      pattern,
      n: rs.length,
      correct: rs.filter((r) => r.j.correct).length,
      falseMatches: rs.filter((r) => r.j.falseMatch).length,
    }));
}

function renderMarkdown(rows, s, patterns) {
  const now = new Date().toISOString();
  const lines = [
    '# Groundtruth held-out eval — results',
    '',
    `Run: ${now} · proxy: \`${PROXY}\` · parts mode: \`${PARTS_MODE}\` · rows: ${s.total} · request errors: ${s.errors}`,
    '',
    '## Headline',
    '',
    `**False-match rate: ${pct(s.falseMatches, s.total)}** (${s.falseMatches}/${s.total} listings resolved to the wrong home). Target: 0.`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| False matches (EXACT but wrong / should not be EXACT) | ${s.falseMatches} / ${s.total} (${pct(s.falseMatches, s.total)}) |`,
    `| EXACT precision (correct EXACT / all EXACT returned) | ${pct(s.returnedExact - s.falseMatches, s.returnedExact)} (${s.returnedExact} returned) |`,
    `| Exact rate (labelled EXACT resolved to EXACT) | ${s.exactHit} / ${s.expExact} (${pct(s.exactHit, s.expExact)}) |`,
    `| Building-level rate (labelled BUILDING → BUILDING/CHOOSE) | ${s.buildingHit} / ${s.expBuilding} (${pct(s.buildingHit, s.expBuilding)}) |`,
    `| Out-of-area correctness (labelled OUT_OF_AREA → OUT_OF_AREA) | ${s.outHit} / ${s.expOut} (${pct(s.outHit, s.expOut)}) |`,
    `| In-area wrongly marked OUT_OF_AREA | ${s.inAreaWronglyOut} / ${s.inArea} |`,
    `| Overall agreement with label | ${s.correct} / ${s.total} (${pct(s.correct, s.total)}) |`,
    '',
    '## Per pattern',
    '',
    '| Pattern | n | Correct | False matches |',
    '|---|---|---|---|',
    ...patterns.map((p) => `| ${p.pattern} | ${p.n} | ${p.correct} (${pct(p.correct, p.n)}) | ${p.falseMatches} |`),
    '',
    '## Failures',
    '',
  ];
  const failures = rows.filter((r) => !r.j.correct);
  if (!failures.length) lines.push('None.');
  else {
    lines.push('| id | Pattern | Displayed address | Expected | Got | Conf | Verdict | Message |', '|---|---|---|---|---|---|---|---|');
    for (const r of failures) {
      lines.push(`| ${r.label.id} | ${esc(r.label.pattern)} | ${esc(r.label.displayed_address)} | ${r.label.expected_state} | ${r.got.error ? 'ERROR' : r.got.state} | ${r.got.confidence ?? ''} | ${esc(r.j.verdict)} | ${esc(r.got.error || r.got.message)} |`);
    }
  }
  lines.push('', '## All rows', '', '| id | Site | Expected | Got | Conf | Verdict | ms |', '|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| ${r.label.id} | ${r.label.site} | ${r.label.expected_state} | ${r.got.error ? 'ERROR' : r.got.state} | ${r.got.confidence ?? ''} | ${esc(r.j.verdict)} | ${r.got.ms} |`);
  }
  lines.push('', '_Only states, confidences, G-NAF ids and truncated messages are recorded here. No raw API payloads._', '');
  return lines.join('\n');
}

async function main() {
  if (!TOKEN) {
    console.error('GROUNDTRUTH_CLIENT_TOKEN is not set; the proxy will return 401. Set it and re-run.');
    process.exit(1);
  }
  const labels = parseCsv(await readFile(LABELS, 'utf8')).filter((l) => l.id && l.displayed_address);
  if (!labels.length) throw new Error(`No labelled rows in ${LABELS}`);
  const rows = [];
  for (const label of labels) {
    const got = await resolve(label);
    const j = judge(label, got);
    rows.push({ label, got, j });
    console.log(`${label.id.padEnd(6)} ${label.expected_state.padEnd(11)} -> ${(got.error || got.state).padEnd(11)} ${j.verdict}`);
    await sleep(DELAY_MS);
  }
  const s = summarise(rows);
  const md = renderMarkdown(rows, s, perPattern(rows));
  await writeFile(RESULTS, md, 'utf8');
  console.log(`\nFalse-match rate ${pct(s.falseMatches, s.total)} · exact ${pct(s.exactHit, s.expExact)} · building ${pct(s.buildingHit, s.expBuilding)} · out-of-area ${pct(s.outHit, s.expOut)}`);
  console.log(`Wrote ${RESULTS}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
