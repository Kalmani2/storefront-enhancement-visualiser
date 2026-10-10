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
  if (error || !data) throw new PlanterError("Stored image could not be read.", 404);
  return Buffer.from(await data.arrayBuffer());
}

export async function signedFileUrl(key: string, download?: string) {
  const { data, error } = await storageClient().storage.from(storageBucket()).createSignedUrl(key, 300, download ? { download } : undefined);
  if (error || !data) throw new PlanterError("Stored image could not be opened.", 502);
  return data.signedUrl;
}
