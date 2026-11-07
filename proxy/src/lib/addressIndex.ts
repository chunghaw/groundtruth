import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { canonNumber, canonStreet, canonSuburb, canonUnit, parseAddress, parseStreetLine, streetKey, titleCase } from "./normalise";

/** One address from the supplied CSV, in loosely-normalised form. */
export interface IndexInput {
  gnafId: string | null;
  unit: string | null;
  number: string | null;
  street: string | null;
  suburb: string | null;
  label?: string | null;
  postcode?: string | null;
  lat?: number | null;
  lng?: number | null;
  bedrooms?: number | null;
  flats?: number | null;
}

export interface IndexRow {
  gnafId: string | null;
  unit: string | null;
  number: string;
  label: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  flats: number | null;
}

export interface AddressIndex {
  size: number;
  unitsAt(key: string): IndexRow[];
  byGnaf(gnafId: string): IndexRow | null;
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
  postcode?: string;
  lat?: string;
  lng?: string;
  bedrooms?: string;
  flats?: string;
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
  ["postcode", /^post_?code$/i],
  ["lat", /^(lat|latitude)$/i],
  ["lng", /^(lng|lon|long|longitude)$/i],
  ["bedrooms", /^(bedrooms|beds|bed_count)$/i],
  ["flats", /^flats_in_building$/i],
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

const num = (v: string): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Address-line kinds that are homes. Shops, suites, car spaces, levels, stores etc. are dropped. */
const HOME_KINDS = new Set(["UNIT", "APARTMENT", "APT", "FLAT", "STUDIO", "TOWNHOUSE", "PENTHOUSE", "HOUSE", "DUPLEX", "VILLA"]);
const KIND_RE = /^([A-Za-z]+)\s+([A-Za-z0-9]+)\s*,\s*(.+)$/;

/** "Unit 41, 19-23 Forbes Street" (no suburb) -> parts; null for non-home lines like "Shop 1, ...". */
function parseCsvLine(line: string, unitCol: string): { unit: string | null; number: string | null; streetDisplay: string | null } | null {
  const m = line.match(KIND_RE);
  if (m && !HOME_KINDS.has(m[1].toUpperCase())) return null;
  const rest = m ? m[3] : line;
  const sl = parseStreetLine(rest);
  if (sl.hadLevel && !m) return null;
  const unit = m ? m[2] : sl.unit ?? (unitCol ? unitCol.replace(/^[A-Za-z]+\s+/, "") : null);
  return { unit: unit || null, number: sl.number, streetDisplay: sl.streetDisplay };
}

function extras(r: Record<string, string>, m: ColumnMap): Pick<IndexInput, "postcode" | "lat" | "lng" | "bedrooms" | "flats"> {
  return {
    postcode: get(r, m.postcode) || null,
    lat: num(get(r, m.lat)),
    lng: num(get(r, m.lng)),
    bedrooms: num(get(r, m.bedrooms)),
    flats: num(get(r, m.flats)),
  };
}

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
    return { gnafId, unit, number, street: street || null, suburb: get(r, m.suburb) || null, label: m.address ? get(r, m.address) : null, ...extras(r, m) };
  }
  if (m.address && m.suburb && get(r, m.suburb)) {
    // Street-line address with suburb in its own column (organiser flats CSV).
    const suburb = get(r, m.suburb);
    const p = parseCsvLine(get(r, m.address), get(r, m.unit));
    if (!p) return null;
    const label = p.number && p.streetDisplay
      ? `${p.unit ? `${canonUnit(p.unit)}/` : ""}${p.number} ${p.streetDisplay}, ${suburb}`
      : null;
    return { gnafId, unit: p.unit, number: p.number, street: p.streetDisplay, suburb, label, ...extras(r, m) };
  }
  if (m.address) {
    const label = get(r, m.address);
    const a = parseAddress(label);
    return { gnafId, unit: a.unit, number: a.number, street: a.street, suburb: a.suburb, label, ...extras(r, m) };
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
  const byId = new Map<string, IndexRow>();
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
    const row: IndexRow = {
      gnafId: i.gnafId,
      unit,
      number,
      label,
      postcode: i.postcode ?? null,
      lat: i.lat ?? null,
      lng: i.lng ?? null,
      bedrooms: i.bedrooms ?? null,
      flats: i.flats ?? null,
    };
    list.push(row);
    map.set(key, list);
    if (i.gnafId && !byId.has(i.gnafId)) byId.set(i.gnafId, row);
    size++;
  }
  for (const [k, v] of map) map.set(k, [...v].sort(naturalUnit));
  return { size, unitsAt: (key) => map.get(key) ?? [], byGnaf: (id) => byId.get(id) ?? null };
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
