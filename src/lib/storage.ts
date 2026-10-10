import { createClient } from "@supabase/supabase-js";
import { PlanterError } from "./planters/validation";

// Server routes only. Never import this module from a client component.
export function storageConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function storageClient() {
  if (typeof window !== "undefined") throw new Error("Storage admin is server-only.");
  if (!storageConfigured()) throw new PlanterError("Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY on this server.", 503);
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function storageBucket() { return process.env.SUPABASE_STORAGE_BUCKET || "storefront-assets"; }

export function contentType(file: string) {
  return file.endsWith(".json") ? "application/json" : file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
}

export async function putFile(key: string, bytes: Buffer, upsert = false) {
  const { error } = await storageClient().storage.from(storageBucket()).upload(key, bytes, { contentType: contentType(key), upsert });
  if (error) throw new PlanterError(`Image storage failed: ${error.message}`, 502);
}

export async function getFile(key: string) {
  const { data, error } = await storageClient().storage.from(storageBucket()).download(key);
  if (error || !data) {
    const code = error && "code" in error ? error.code : undefined;
    const missing = code === "NoSuchKey" || (code !== "NoSuchBucket" && (error?.status === 404 || error?.statusCode === "404"));
    // An outage is not a missing file. In particular, deletion must stop when
    // composition references cannot be checked, rather than treating them as empty.
    throw new PlanterError("Stored image could not be read.", missing ? 404 : 502);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function signedFileUrl(key: string, download?: string) {
  const { data, error } = await storageClient().storage.from(storageBucket()).createSignedUrl(key, 300, download ? { download } : undefined);
  if (error || !data) throw new PlanterError("Stored image could not be opened.", 502);
  return data.signedUrl;
}

// Library assets are flat folders. Collect all pages before deleting so offsets
// cannot skip objects as the listing shrinks. Never accept a bucket/root prefix.
export async function removeAssetFolder(prefix: string) {
  if (!/^(planters|storefronts|compositions)\/[a-zA-Z0-9_-]{1,220}$/.test(prefix)) throw new PlanterError("Invalid asset folder.");
  const bucket = storageClient().storage.from(storageBucket());
  const keys: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) throw new PlanterError("Saved files could not be listed for cleanup.", 502);
    for (const file of data) {
      if (!file.id || file.name.includes("/") || file.name === "." || file.name === "..") throw new PlanterError("Unexpected folder in saved assets; cleanup stopped.", 502);
      keys.push(`${prefix}/${file.name}`);
    }
    if (data.length < 100) break;
  }
  for (let offset = 0; offset < keys.length; offset += 100) {
    const { error } = await bucket.remove(keys.slice(offset, offset + 100));
    if (error) throw new PlanterError("Some saved files could not be cleaned up.", 502);
  }
}
