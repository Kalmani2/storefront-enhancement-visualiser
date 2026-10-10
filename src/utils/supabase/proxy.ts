import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Keep the existing demo usable when Supabase is not configured.
  if (!isSupabaseConfigured()) return response;

  const { url, key } = getSupabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = response;
        response = NextResponse.next({ request });
        previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
        for (const name of ["cache-control", "expires", "pragma"]) {
          const value = previous.headers.get(name);
          if (value) response.headers.set(name, value);
        }
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  await supabase.auth.getClaims();
  // Session refresh only. Protected routes must still check authorization themselves.
  return response;
}
