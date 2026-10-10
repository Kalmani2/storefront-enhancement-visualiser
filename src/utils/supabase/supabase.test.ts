// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieMethodsServer } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { createClient as createBrowserClient } from "./client";
import { createClient as createServerClient } from "./server";
import { getSupabaseConfig } from "./config";
import { proxy, config } from "../../proxy";

const mocks = vi.hoisted(() => ({ server: vi.fn(), browser: vi.fn(), cookies: vi.fn(), claims: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.server, createBrowserClient: mocks.browser }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

describe("Supabase setup", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.claims.mockResolvedValue({ data: null, error: null });
    mocks.server.mockReturnValue({ auth: { getClaims: mocks.claims } });
  });
  afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

  it("creates the browser client with the publishable credentials", () => {
    createBrowserClient();
    expect(mocks.browser).toHaveBeenCalledWith("https://example.supabase.co", "sb_publishable_test");
  });

  it("creates a request-scoped server client using async Next.js cookies", async () => {
    const store = { getAll: vi.fn().mockReturnValue([{ name: "session", value: "old" }]), set: vi.fn() };
    mocks.cookies.mockResolvedValue(store);
    await createServerClient();
    const methods = mocks.server.mock.calls[0][2].cookies as CookieMethodsServer;
    expect(methods.getAll()).toEqual([{ name: "session", value: "old" }]);
    await methods.setAll!([{ name: "session", value: "new", options: { path: "/" } }], {});
    expect(store.set).toHaveBeenCalledWith("session", "new", { path: "/" });
    store.set.mockImplementation(() => { throw new Error("Read-only Server Component"); });
    expect(() => methods.setAll!([{ name: "session", value: "new", options: {} }], {})).not.toThrow();
  });

  it("refreshes claims and forwards refreshed cookies and cache headers", async () => {
    const request = new NextRequest("https://demo.example/studio", { headers: { cookie: "session=old" } });
    mocks.claims.mockImplementation(async () => {
      const methods = mocks.server.mock.calls[0][2].cookies as CookieMethodsServer;
      expect(methods.getAll()).toEqual([{ name: "session", value: "old" }]);
      await methods.setAll!([{ name: "session", value: "fresh", options: { path: "/", httpOnly: true } }], {
        "Cache-Control": "private, no-store", Expires: "0", Pragma: "no-cache",
      });
      // The SDK supplies cache headers only on its first cookie write.
      await methods.setAll!([{ name: "other", value: "value", options: { path: "/" } }], {});
      return { data: null, error: null };
    });
    const response = await proxy(request);
    expect(mocks.claims).toHaveBeenCalledOnce();
    expect(request.cookies.get("session")?.value).toBe("fresh");
    expect(response.cookies.get("session")?.value).toBe("fresh");
    expect(response.cookies.get("session")?.httpOnly).toBe(true);
    expect(response.cookies.get("other")?.value).toBe("value");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-cookie")).toContain("session=fresh");
  });

  it("keeps the demo accessible without Supabase environment variables", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await proxy(new NextRequest("https://demo.example/"));
    expect(response.status).toBe(200);
    expect(mocks.server).not.toHaveBeenCalled();
    expect(() => getSupabaseConfig()).toThrow("NEXT_PUBLIC_SUPABASE");
  });

  it.each(["/", "/studio", "/google", "/api/planters"])("refreshes application route %s", (url) => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(true);
  });

  it.each(["/_next/static/chunk.js", "/_next/image?url=test", "/favicon.ico", "/robots.txt", "/planters/sample.png", "/font.woff2"])("skips static asset %s", (url) => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(false);
  });
});
