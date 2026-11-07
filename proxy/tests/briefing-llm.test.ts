import { describe, expect, it, vi } from "vitest";
import { briefingFacts, cleanReply, composeBriefing, numbersGrounded, replyNumbers, LLM_MODEL } from "@/lib/briefing";
import { synthesize, synthesizeAny, synthesizeOpenAI, TTS_MODEL } from "@/lib/tts";
import type { Fact } from "@/lib/facts";

const yes = (data: unknown): Fact => ({ available: true, data });
const facts = {
  agentQuoting: yes({ agency_name: "McGrath Surry Hills", cohort: "Mild Underquoter", median_deviation_pct: 3.9, underquote_rate_pct: 70, total_sales: 10, likely_sale_price: 832_000 }),
  basics: yes({ dwelling_type: "unit", bed_count: 2, bath_count: 1 }),
  strataLevy: yes({ median_levy_annual: 4120 }),
};
const chat = (content: string) => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
const GOOD = "So this two-bed unit should go for about $830,000. McGrath Surry Hills sold 7 of 10 recent homes above the guide, usually around 4% over, so treat the guide as a floor. Strata's roughly $4,100 a year. When you're there, check the bathroom for water damage.";

describe("briefingFacts", () => {
  it("flattens the agency record into plain facts, including sales above guide", () => {
    const g = briefingFacts(facts) as { agency: Record<string, unknown>; strata_levy_per_year: number };
    expect(g.agency).toMatchObject({ name: "McGrath Surry Hills", recent_sales_above_guide: 7, recent_sales_tracked: 10, typical_sold_vs_guide_pct: 3.9, likely_sale_price_for_this_home: 832_000 });
    expect(g.strata_levy_per_year).toBe(4120);
  });
});

describe("number grounding", () => {
  it("parses spoken-style numbers", () => {
    expect(replyNumbers("about $1.1 million, 830k, $830,000 and 4%")).toEqual([1_100_000, 830_000, 830_000, 4]);
  });
  it("accepts rounded facts and rejects invented numbers", () => {
    const g = briefingFacts(facts);
    expect(numbersGrounded(GOOD, g)).toBe(true);
    expect(numbersGrounded("It should fetch $950,000.", g)).toBe(false);
    expect(numbersGrounded("Built in 1998.", g)).toBe(false);
  });
  it("strips markdown and caps length", () => {
    expect(cleanReply("**Hi** - _there_ #now")).toBe("Hi - there now");
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    expect(cleanReply(long).split(" ").length).toBeLessThanOrEqual(85);
  });
});

describe("composeBriefing", () => {
  it("uses the template with no OpenAI key", async () => {
    const r = await composeBriefing("G0", facts, null, { apiKey: "" });
    expect(r.source).toBe("template");
  });
  it("calls OpenAI chat completions and returns the validated reply, then caches it", async () => {
    const f = chat(GOOD);
    const r = await composeBriefing("G1", facts, null, { apiKey: "sk", fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ script: GOOD, source: "llm" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: LLM_MODEL, temperature: 0.7 });
    expect(JSON.parse(body.messages[1].content).agency.name).toBe("McGrath Surry Hills");
    await composeBriefing("G1", facts, null, { apiKey: "sk", fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("falls back to the template when the reply invents a number or the call fails", async () => {
    const bad = await composeBriefing("G2", facts, null, { apiKey: "sk", fetchImpl: chat("It'll sell for $990,000, trust me, and the agent is lovely and the street is quiet.") as unknown as typeof fetch });
    expect(bad.source).toBe("template");
    const boom = vi.fn(async () => { throw new Error("net"); });
    expect((await composeBriefing("G3", facts, null, { apiKey: "sk", fetchImpl: boom as unknown as typeof fetch })).source).toBe("template");
  });
});

describe("tts providers", () => {
  const audio = () => new Response(new Uint8Array([9]), { status: 200 });
  it("sends the expressive ElevenLabs model and voice settings", async () => {
    const f = vi.fn(async () => audio());
    await synthesize("hi", { apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ model_id: TTS_MODEL, voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } });
    expect(TTS_MODEL).toBe("eleven_multilingual_v2");
  });
  it("falls back to OpenAI TTS when ElevenLabs fails", async () => {
    const f = vi.fn(async (url: string) => (url.includes("elevenlabs") ? new Response("no", { status: 500 }) : audio()));
    const out = await synthesizeAny("hi", { elevenLabsKey: "e", openAiKey: "o", fetchImpl: f as unknown as typeof fetch });
    expect(out && new Uint8Array(out)).toEqual(new Uint8Array([9]));
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "gpt-4o-mini-tts", input: "hi" });
  });
  it("returns null when OpenAI TTS fails too", async () => {
    const f = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await synthesizeOpenAI("hi", { apiKey: "o", fetchImpl: f as unknown as typeof fetch })).toBeNull();
    expect(await synthesizeAny("hi", {})).toBeNull();
  });
});
