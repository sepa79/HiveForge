import { describe, expect, it } from "vitest";
import { configureHttpProxyFromEnv } from "../../src/runtime/http-proxy.js";

describe("HTTP proxy configuration", () => {
  it("does not enable proxy support without proxy environment", () => {
    expect(configureHttpProxyFromEnv({})).toBe(false);
  });

  it("enables proxy support when a standard proxy environment variable is set", () => {
    expect(configureHttpProxyFromEnv({ HTTPS_PROXY: "http://proxy.example:8080" })).toBe(true);
  });
});
