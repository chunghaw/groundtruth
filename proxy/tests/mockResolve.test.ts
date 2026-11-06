import { describe, expect, it, vi } from "vitest";
import { resolve } from "@/lib/resolve";
import { geocode } from "@/lib/upstreamDeps";
import { isInArea } from "@/lib/area";

vi.stubEnv("MOCK", "1");
const deps = { geocode, index: null, isInArea };
const run = (raw: string) => resolve({ source: "manual", raw, parts: null, bedrooms: null }, deps);

describe("mock mode end-to-end resolve", () => {
  it("unit address -> EXACT", async () => expect((await run("4/10 Crown Street, Surry Hills NSW 2010")).state).toBe("EXACT"));
  it("odd number no unit -> BUILDING", async () => expect((await run("11 Crown Street, Surry Hills")).state).toBe("BUILDING"));
  it("even number no unit -> EXACT house", async () => expect((await run("12 Crown Street, Surry Hills")).state).toBe("EXACT"));
  it("NOMATCH -> NO_MATCH", async () => expect((await run("12 Nomatch Street, Surry Hills")).state).toBe("NO_MATCH"));
  it("Parramatta -> OUT_OF_AREA", async () => expect((await run("12 Church Street, Parramatta")).state).toBe("OUT_OF_AREA"));
  it("is deterministic", async () => expect(await run("4/10 Crown Street, Surry Hills")).toEqual(await run("4/10 Crown Street, Surry Hills")));
});
