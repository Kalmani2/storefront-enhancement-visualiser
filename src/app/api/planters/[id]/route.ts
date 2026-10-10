import { NextResponse } from "next/server";
import { readAsset, updateAsset } from "@/lib/planters/store";
import { planterFailure, requireMutation } from "@/lib/planters/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try { return NextResponse.json(await readAsset((await context.params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return planterFailure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try { requireMutation(request); return NextResponse.json(await updateAsset((await context.params).id, await request.json())); }
  catch (error) { return planterFailure(error); }
}
