// Copies existing local files only. Never calls OpenAI, Google or discovery APIs.
// Safe to rerun: existing cloud files must match; existing metadata is not overwritten.
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "storefront-assets";
if (!url || !secret) throw new Error("Set Supabase URL and server secret in .env.local first.");
const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const root = path.resolve("output", "planters");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
let files = 0, bytes = 0, imported = 0;

const { data: bucketInfo, error: bucketError } = await client.storage.getBucket(bucket);
if (bucketError || !bucketInfo || bucketInfo.public) throw new Error("The configured private storage bucket is missing or public.");
// These read checks also verify that the supplied SQL migration has been applied.
for (const table of ["projects", "planters", "renders"]) {
  const { error } = await client.from(table).select("id").limit(0);
  if (error) throw new Error(`Apply supabase/migrations/202610100001_shared_library.sql first (${table}).`);
}

for (const folder of await readdir(root, { withFileTypes: true })) {
  if (!folder.isDirectory() || !/^[a-f0-9-]{36}$/.test(folder.name)) continue;
  const directory = path.join(root, folder.name);
  const asset = JSON.parse(await readFile(path.join(directory, "asset.json"), "utf8"));
  if (asset.id !== folder.name || asset.status === "processing") throw new Error(`Resolve invalid or running local asset ${folder.name} before importing.`);
  const { data: existing, error: readError } = await client.from("planters").select("data").eq("id", asset.id).maybeSingle();
  if (readError) throw new Error("Could not inspect existing cloud planter.");
  if (existing && !isDeepStrictEqual(existing.data, asset)) throw new Error(`Cloud metadata has changed for ${asset.id}; refusing to overwrite it.`);
  const prefix = `planters/${asset.id}`;
  const { data: objects, error: listError } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (listError) throw new Error("Could not inspect existing storage files.");
  const names = new Set(objects.map(object => object.name));
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile() || !/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|json)$/.test(file.name)) continue;
    const key = `${prefix}/${file.name}`;
    const source = await readFile(path.join(directory, file.name));
    if (!names.has(file.name)) {
      const contentType = file.name.endsWith(".json") ? "application/json" : file.name.endsWith(".png") ? "image/png" : file.name.endsWith(".webp") ? "image/webp" : "image/jpeg";
      const { error } = await client.storage.from(bucket).upload(key, source, { contentType, upsert: false });
      if (error) throw new Error(`Upload failed for ${key}: ${error.message}`);
    }
    const { data, error } = await client.storage.from(bucket).download(key);
    if (error || !data || digest(source) !== digest(Buffer.from(await data.arrayBuffer()))) throw new Error(`Cloud file verification failed for ${key}.`);
    files++; bytes += source.length;
  }
  if (!existing) {
    const { error } = await client.from("planters").insert({ id: asset.id, name: asset.name, status: asset.status, data: asset, version: 1, created_at: asset.createdAt, updated_at: asset.updatedAt });
    if (error) throw new Error(`Metadata import failed for ${asset.id}: ${error.message}`);
  }
  const { data: verified, error } = await client.from("planters").select("data").eq("id", asset.id).single();
  if (error || !isDeepStrictEqual(verified.data, asset)) throw new Error("Cloud metadata verification failed.");
  imported++;
  console.log(JSON.stringify({ planter: asset.name, id: asset.id, status: asset.status, revisions: asset.revisions.length, verified: true }));
}
console.log(JSON.stringify({ imported, verifiedFiles: files, verifiedBytes: bytes, bucket, localFilesPreserved: true }));
