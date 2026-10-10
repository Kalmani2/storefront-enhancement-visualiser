"use client";

import { createClient } from "@/utils/supabase/client";
import type { UploadKind, UploadReceipt } from "./uploads";

export async function uploadImage(file: File, kind: UploadKind): Promise<UploadReceipt> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const response = await fetch("/api/uploads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, filename: file.name, size: file.size, contentType: file.type }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not prepare upload.");
  const { error } = await createClient().storage.from(result.bucket).uploadToSignedUrl(result.upload.path, result.token, file, { contentType: file.type });
  if (error) throw new Error("Image upload failed. Please try again.");
  return result.upload;
}
