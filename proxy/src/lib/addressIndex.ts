import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { canonNumber, canonStreet, canonSuburb, canonUnit, parseAddress, streetKey, titleCase } from "./normalise";

/** One address from the supplied CSV, in loosely-normalised form. */
export interface IndexInput {
  gnafId: string | null;
  unit: string | null;
  number: string | null;
  street: string | null;
  suburb: string | null;
  label?: string | null;
}

export interface IndexRow {
  gnafId: string | null;
  unit: string | null;
  number: string;
  label: string;
}

export interface AddressIndex {
  size: number;
  unitsAt(key: string): IndexRow[];
}

export interface ColumnMap {
  gnaf?: string;
  unit?: string;
  unitPrefix?: string;
  unitSuffix?: string;
  number?: string;
  numberSuffix?: string;
  numberLast?: string;
  numberLastSuffix?: string;
  streetName?: string;
  streetType?: string;
  streetSuffix?: string;
  street?: string;
  suburb?: string;
  address?: string;
}

const PATTERNS: ReadonlyArray<[keyof ColumnMap, RegExp]> = [
  ["gnaf", /^(gnaf(_?(id|pid))?|address_detail_pid|adp|pid|gnafid|gnaf_pid|id)$/i],
  ["unitPrefix", /^flat_number_prefix$/i],
  ["unitSuffix", /^flat_number_suffix$/i],
  ["unit", /^(flat_number|flat|unit|unit_?(no|number)|apartment|apt)$/i],
  ["numberSuffix", /^number_first_suffix$/i],
  ["numberLastSuffix", /^number_last_suffix$/i],
  ["numberLast", /^number_last$/i],
  ["number", /^(number_first|street_?(no|number|num)|house_?(no|number)|number)$/i],
  ["streetName", /^street_name$/i],
  ["streetType", /^street_type(_code)?$/i],
  ["streetSuffix", /^street_suffix(_code)?$/i],
  ["street", /^(street|street_?address|road)$/i],
  ["suburb", /^(locality(_name)?|suburb(_name)?|town|sal(_name)?)$/i],
  ["address", /^(address|full_?address|address_?label|display_?name|formatted_?address|addr)$/i],
];

export function detectColumns(headers: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  for (const [field, re] of PATTERNS) {
    const hit = headers.find((h) => re.test(h.trim()) && !Object.values(map).includes(h));
    if (hit) map[field] = hit;
  }
  return map;
}

const get = (r: Record<string, string>, col?: string): string => (col ? (r[col] ?? "").trim() : "");

function rowFrom(r: Record<string, string>, m: ColumnMap): IndexInput | null {
  const gnafId = get(r, m.gnaf) || null;
  const structured = (m.number && (m.streetName || m.street) && m.suburb);
  if (structured) {
    const unit = `${get(r, m.unitPrefix)}${get(r, m.unit)}${get(r, m.unitSuffix)}` || null;
    const first = `${get(r, m.number)}${get(r, m.numberSuffix)}`;
    const last = `${get(r, m.numberLast)}${get(r, m.numberLastSuffix)}`;
    const number = first ? (last ? `${first}-${last}` : first) : null;
    const street = m.streetName
      ? [get(r, m.streetName), get(r, m.streetType), get(r, m.streetSuffix)].filter(Boolean).join(" ")
      : get(r, m.street);
    return { gnafId, unit, number, street: street || null, suburb: get(r, m.suburb) || null, label: m.address ? get(r, m.address) : null };
  }
  if (m.address) {
    const label = get(r, m.address);
    const a = parseAddress(label);
    return { gnafId, unit: a.unit, number: a.number, street: a.street, suburb: a.suburb, label };
  }
  return null;
}

export function rowsFromCsv(text: string, mapping?: ColumnMap): IndexInput[] {
  const records = parse(text, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }) as Record<string, string>[];
  if (records.length === 0) return [];
  const m = mapping ?? detectColumns(Object.keys(records[0]));
  return records.map((r) => rowFrom(r, m)).filter((x): x is IndexInput => x !== null);
}

function naturalUnit(a: IndexRow, b: IndexRow): number {
  return (a.unit ?? "").localeCompare(b.unit ?? "", "en", { numeric: true });
}

export function buildIndex(inputs: readonly IndexInput[]): AddressIndex {
  const map = new Map<string, IndexRow[]>();
  let size = 0;
  for (const i of inputs) {
    const { number, first } = canonNumber(i.number);
    const street = canonStreet(i.street);
    const suburb = canonSuburb(i.suburb);
    if (!number || !street || !suburb) continue;
    const unit = canonUnit(i.unit);
    const label =
      i.label ||
      `${unit ? `${unit}/` : ""}${number} ${titleCase(i.street ?? "")}, ${titleCase(i.suburb ?? "")}`;
    const key = streetKey({ numberFirst: first, street, suburb });
    const list = map.get(key) ?? [];
    map.set(key, [...list, { gnafId: i.gnafId, unit, number, label }]);
    size++;
  }
  for (const [k, v] of map) map.set(k, [...v].sort(naturalUnit));
  return { size, unitsAt: (key) => map.get(key) ?? [] };
}

// ---------- process-wide lazy load ----------

export interface IndexStatus {
  loaded: boolean;
  rows: number;
  source: string | null;
  error: string | null;
}

const g = globalThis as { __gtIndex?: { index: AddressIndex | null; status: IndexStatus } };

export const PREBUILT_INDEX_PATH = path.join(process.cwd(), ".data", "address-index.json");

function csvPath(): string {
  return process.env.ADDRESS_CSV_PATH || path.resolve(process.cwd(), "../data/addresses-city-of-sydney.csv");
}

function parseMapping(): ColumnMap | undefined {
  const raw = process.env.ADDRESS_CSV_COLUMNS;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ColumnMap;
  } catch {
    throw new Error("ADDRESS_CSV_COLUMNS is not valid JSON");
  }
}

/** Loads (once) from the prebuilt JSON (deploys) or the CSV (local). Null when neither exists. */
export function getAddressIndex(): AddressIndex | null {
  if (g.__gtIndex) return g.__gtIndex.index;
  const status: IndexStatus = { loaded: false, rows: 0, source: null, error: null };
  let index: AddressIndex | null = null;
  try {
    if (existsSync(PREBUILT_INDEX_PATH)) {
      index = buildIndex(JSON.parse(readFileSync(PREBUILT_INDEX_PATH, "utf8")) as IndexInput[]);
      status.source = PREBUILT_INDEX_PATH;
    } else if (existsSync(csvPath())) {
      index = buildIndex(rowsFromCsv(readFileSync(csvPath(), "utf8"), parseMapping()));
      status.source = csvPath();
    }
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e);
    console.error("[groundtruth] address index failed to load:", status.error);
    index = null;
  }
  status.loaded = !!index && index.size > 0;
  status.rows = index?.size ?? 0;
  g.__gtIndex = { index: status.loaded ? index : null, status };
  return g.__gtIndex.index;
}

export function indexStatus(): IndexStatus {
  getAddressIndex();
  return g.__gtIndex!.status;
}
