import { describe, expect, it } from "vitest";
import { agencyCohort, briefingFacts, SYSTEM_PROMPT } from "../src/lib/briefing";

describe("briefing facts for the LLM", () => {
  it("spells out the agency cohort subject and flags the strata levy as a suburb median", () => {
    expect(agencyCohort({ cohort: "mild_underquoter", agency_name: "McGrath Surry Hills" })).toEqual({ subject: "the agency, McGrath Surry Hills, is a mild underquoter" });
    const f = briefingFacts({
      basics: { available: true, data: { dwelling_type: "Unit" } },
      strataLevy: { available: true, data: { median_levy_annual: 4210 } },
    } as never);
    expect(f.strata_is_suburb_median).toBe(true);
    expect(SYSTEM_PROMPT).toMatch(/suburb's median strata levy/);
  });
});
