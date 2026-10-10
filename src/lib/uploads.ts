import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { storageClient, storageBucket, getFile } from "./storage";
import { MAX_UPLOAD_BYTES } from "./planters/images";
import { PlanterError } from "./planters/validation";

export type UploadKind = "planter" | "frontage" | "edit";
export type UploadReceipt = { path: string; filename: string; expires: number; signature: string };

function signature(kind: UploadKind, value: Omit<UploadReceipt, "signature">) {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(JSON.stringify([kind, value.path, value.filename, value.expires])).digest("hex");
}

export async function prepareUpload(value: unknown) {
  const body = value as { kind?: UploadKind; filename?: string; size?: number; contentType?: string };
  if (!body || !["planter", "frontage", "edit"].includes(body.kind!) || typeof body.filename !== "string" || !Number.isInteger(body.size) || body.size! <= 0 || body.size! > MAX_UPLOAD_BYTES) throw new PlanterError("Choose an image smaller than 20 MB.");
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[body.contentType!];
  if (!extension) throw new PlanterError("Choose a JPEG, PNG or WebP image.");
  const file = { path: `uploads/${randomUUID()}.${extension}`, filename: path.basename(body.filename).slice(0, 200), expires: Date.now() + 2 * 60 * 60_000 };
  const { data, error } = await storageClient().storage.from(storageBucket()).createSignedUploadUrl(file.path);
  if (error || !data) throw new PlanterError("Could not prepare the image upload.", 502);
  return { upload: { ...file, signature: signature(body.kind!, file) }, bucket: storageBucket(), token: data.token };
}

export async function readUpload(kind: UploadKind, value: unknown) {
  storageClient(); // Fail clearly if the server is not configured.
  const upload = value as UploadReceipt;
  if (!upload || typeof upload.path !== "string" || !/^uploads\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(upload.path) || typeof upload.filename !== "string" || !Number.isFinite(upload.expires) || upload.expires < Date.now() || typeof upload.signature !== "string" || !/^[a-f0-9]{64}$/.test(upload.signature)) throw new PlanterError("Upload expired or invalid. Choose the image again.");
  const expected = signature(kind, upload);
  if (!timingSafeEqual(Buffer.from(upload.signature, "hex"), Buffer.from(expected, "hex"))) throw new PlanterError("Invalid upload receipt.", 403);
  const bytes = await getFile(upload.path);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new PlanterError("Choose an image smaller than 20 MB.");
  return { bytes, filename: upload.filename, path: upload.path };
}

export async function consumeUpload(key: string) {
  const { error } = await storageClient().storage.from(storageBucket()).remove([key]);
  if (error) console.warn("Saved image, but its temporary upload could not be removed.");
}
