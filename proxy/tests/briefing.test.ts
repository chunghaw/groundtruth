import { describe, expect, it, vi } from "vitest";
import { buildBriefingScript, speakMoney, speakNumber, wordCount, MAX_WORDS } from "@/lib/briefing";
import { synthesize, TtsCache, DEFAULT_VOICE_ID } from "@/lib/tts";
import type { Fact } from "@/lib/facts";

const yes = (data: unknown): Fact => ({ available: true, data });
const no: Fact = { available: false, data: null, reason: "n/a" };

const full = {
  avm: yes({ predicted_price: 1_104_000, predicted_price_low: 972_000, predicted_price_high: 1_236_000 }),
  agentQuoting: yes({ agency_name: "Acme", median_deviation_pct: 6.5, underquote_rate_pct: 62, total_sales: 12 }),
  risks: yes({ flood: [{ name: "Flood", on_property: false }], heritage: [{ name: "Heritage", on_property: true }] }),
  strataLevy: yes({ median_levy_annual: 4120.5 }),
  basics: yes({ dwelling_type: "unit" }),
};

describe("speech numbers", () => {
  it("says numbers in plain English", () => {
    expect(speakNumber(0)).toBe("zero");
    expect(speakNumber(15)).toBe("fifteen");
    expect(speakNumber(42)).toBe("forty-two");
    expect(speakNumber(850)).toBe("eight hundred and fifty");
    expect(speakNumber(4100)).toBe("four thousand one hundred");
  });
  it("rounds money for speech", () => {
    expect(speakMoney(1_104_000)).toBe("about one point one million");
    expect(speakMoney(1_000_000)).toBe("about one million");
    expect(speakMoney(2_250_000)).toBe("about two point two five million");
    expect(speakMoney(972_000)).toBe("about nine hundred and seventy thousand");
    expect(speakMoney(1_236_000)).toBe("about one point two five million");
    expect(speakMoney(1_310_000)).toBe("about one point three million");
    expect(speakMoney(2_040_000)).toBe("about two point oh five million");
    expect(speakMoney(4120.5)).toBe("about four thousand one hundred");
  });
});

describe("buildBriefingScript", () => {
  it("covers value, agency honesty, top risk and strata for a unit within the word budget", () => {
    const s = buildBriefingScript(full);
    expect(s).toContain("about one point one million");
    expect(s).toMatch(/seven percent above the guide/);
    expect(s).toMatch(/Heritage/);
    expect(s).toMatch(/strata/i);
    expect(s).not.toMatch(/\d/); // everything spoken as words
    expect(wordCount(s)).toBeLessThanOrEqual(MAX_WORDS);
  });

  it("mentions what can rise next door when 3D context is present, and tolerates its absence", () => {
    const s = buildBriefingScript({ ...full, strataLevy: no }, { next_door_max_height_m: 22 });
    expect(s).toMatch(/twenty-two metres/);
    expect(wordCount(s)).toBeLessThanOrEqual(MAX_WORDS);
    expect(buildBriefingScript(full, null)).not.toMatch(/metres/);
    expect(buildBriefingScript(full, { summary: "Up to 8 storeys can be built next door." })).toMatch(/storeys/);
    const ctx = { available: true, tallestNeighbour: { maxHeightM: 27.5, storeys: 9, distanceM: 40, direction: "north-east", source: "hob" } };
    expect(buildBriefingScript({ avm: full.avm }, ctx)).toMatch(/to the north-east, planning allows up to about nine storeys/);
    expect(buildBriefingScript({ avm: full.avm }, { available: false, tallestNeighbour: null })).not.toMatch(/storeys/);
  });

  it("praises an honest agency, skips strata for houses, and says when no overlays apply", () => {
    const s = buildBriefingScript({
      avm: full.avm,
      agentQuoting: yes({ median_deviation_pct: 1, underquote_rate_pct: 10, total_sales: 30 }),
      risks: yes({ flood: [{ name: "Flood", on_property: false }] }),
      strataLevy: full.strataLevy,
      basics: yes({ dwelling_type: "house" }),
    });
    expect(s).toMatch(/close to the final price/);
    expect(s).not.toMatch(/strata/i);
    expect(s).toMatch(/No risk overlays/);
  });

  it("degrades gracefully with no data", () => {
    expect(buildBriefingScript({})).toMatch(/not enough data/i);
  });
});

describe("tts", () => {
  it("calls ElevenLabs with the key header and returns audio bytes", async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const out = await synthesize("hello", { apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    expect(out && new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/v1/text-to-speech/${DEFAULT_VOICE_ID}`);
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
    expect(JSON.parse(init.body as string)).toMatchObject({ text: "hello" });
  });

  it("returns null on upstream errors or network failure", async () => {
    const bad = vi.fn(async () => new Response("no", { status: 401 }));
    expect(await synthesize("x", { apiKey: "k", fetchImpl: bad as unknown as typeof fetch })).toBeNull();
    const boom = vi.fn(async () => { throw new Error("net"); });
    expect(await synthesize("x", { apiKey: "k", fetchImpl: boom as unknown as typeof fetch })).toBeNull();
  });

  it("caches by gnafId + script hash and evicts the oldest", () => {
    const c = new TtsCache(2);
    const a = new ArrayBuffer(1);
    c.set("G1", "script", a);
    expect(c.get("G1", "script")).toBe(a);
    expect(c.get("G1", "other")).toBeUndefined();
    c.set("G2", "s", a);
    c.set("G3", "s", a);
    expect(c.get("G1", "script")).toBeUndefined();
    expect(c.get("G3", "s")).toBe(a);
  });
});
