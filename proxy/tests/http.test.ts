import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedOrigin, checkClient, isSameOriginRequest, rateLimited, parseResolveBody, isGnafId } from "@/lib/http";

const reqWith = (headers: Record<string, string>) => new Request("http://x/api/resolve", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("allowedOrigin", () => {
  it("allows chrome-extension origins and the two listing sites only", () => {
    expect(allowedOrigin("chrome-extension://abcdefghijklmnop")).toBe("chrome-extension://abcdefghijklmnop");
    expect(allowedOrigin("https://www.realestate.com.au")).toBe("https://www.realestate.com.au");
    expect(allowedOrigin("https://www.domain.com.au")).toBe("https://www.domain.com.au");
    expect(allowedOrigin("https://evil.example")).toBeNull();
    expect(allowedOrigin(null)).toBeNull();
  });
});

describe("checkClient", () => {
  it("requires the shared token when configured", () => {
    vi.stubEnv("GROUNDTRUTH_CLIENT_TOKEN", "s3cret");
    expect(checkClient(reqWith({}))).toBe(false);
    expect(checkClient(reqWith({ "x-groundtruth-client": "nope" }))).toBe(false);
    expect(checkClient(reqWith({ "x-groundtruth-client": "s3cret" }))).toBe(true);
  });
  it("fails closed in production when no token configured", () => {
    vi.stubEnv("GROUNDTRUTH_CLIENT_TOKEN", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(checkClient(reqWith({ "x-groundtruth-client": "anything" }))).toBe(false);
  });
  it("is open in development when no token configured", () => {
    vi.stubEnv("GROUNDTRUTH_CLIENT_TOKEN", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(checkClient(reqWith({}))).toBe(true);
  });
});

describe("same-origin demo access", () => {
  const demoReq = (headers: Record<string, string>) => new Request("https://gt.example.app/api/resolve", { headers: { host: "gt.example.app", ...headers } });

  it("detects same-origin browser requests by Origin or Referer", () => {
    expect(isSameOriginRequest(demoReq({ origin: "https://gt.example.app" }))).toBe(true);
    expect(isSameOriginRequest(demoReq({ referer: "https://gt.example.app/demo", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(demoReq({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(demoReq({ origin: "https://gt.example.app", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(demoReq({}))).toBe(false);
    expect(isSameOriginRequest(new Request("https://x/api", { headers: { origin: "https://gt.example.app" } }))).toBe(false);
  });

  it("lets the demo page in without the token in mock mode, but keeps the token gate for everyone else", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GROUNDTRUTH_CLIENT_TOKEN", "s3cret");
    vi.stubEnv("MOCK", "1");
    expect(checkClient(demoReq({ origin: "https://gt.example.app" }))).toBe(true);
    expect(checkClient(demoReq({ origin: "chrome-extension://abcdefghijklmnop" }))).toBe(false);
    expect(checkClient(demoReq({ origin: "https://www.realestate.com.au" }))).toBe(false);
    expect(checkClient(demoReq({}))).toBe(false);
    expect(checkClient(demoReq({ origin: "chrome-extension://abcdefghijklmnop", "x-groundtruth-client": "s3cret" }))).toBe(true);
  });

  it("is off with a live key unless explicitly enabled, and can be disabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GROUNDTRUTH_CLIENT_TOKEN", "s3cret");
    vi.stubEnv("MOCK", "");
    vi.stubEnv("MICROBURBS_API_KEY", "real-key");
    expect(checkClient(demoReq({ origin: "https://gt.example.app" }))).toBe(false);
    vi.stubEnv("GROUNDTRUTH_DEMO", "1");
    expect(checkClient(demoReq({ origin: "https://gt.example.app" }))).toBe(true);
    vi.stubEnv("MOCK", "1");
    vi.stubEnv("GROUNDTRUTH_DEMO", "0");
    expect(checkClient(demoReq({ origin: "https://gt.example.app" }))).toBe(false);
  });
});

describe("rateLimited", () => {
  it("limits bursts per key", () => {
    const key = `k-${Math.random()}`;
    const results = Array.from({ length: 70 }, () => rateLimited(key, 60));
    expect(results.filter(Boolean).length).toBe(10);
  });
});

describe("parseResolveBody", () => {
  it("accepts the contract shape", () => {
    const r = parseResolveBody({ source: "rea", raw: "1 X St, Glebe", parts: null, bedrooms: 2 });
    expect(r.ok && r.value.bedrooms).toBe(2);
  });
  it("rejects bad input", () => {
    expect(parseResolveBody(null).ok).toBe(false);
    expect(parseResolveBody({ source: "rea" }).ok).toBe(false);
    expect(parseResolveBody({ source: "x", raw: "a" }).ok).toBe(false);
    expect(parseResolveBody({ source: "rea", raw: "a".repeat(600) }).ok).toBe(false);
    expect(parseResolveBody({ source: "rea", raw: "a", bedrooms: 99 }).ok).toBe(false);
  });
});

describe("isGnafId", () => {
  it("validates", () => {
    expect(isGnafId("GANSW705970502")).toBe(true);
    expect(isGnafId("../etc")).toBe(false);
    expect(isGnafId("GANSW1/../x")).toBe(false);
  });
});
