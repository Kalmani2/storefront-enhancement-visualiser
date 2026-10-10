import { prepareUpload } from "@/lib/uploads";
import { planterFailure, requireMutation } from "@/lib/planters/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireMutation(request);
    return Response.json(await prepareUpload(await request.json()));
  } catch (error) { return planterFailure(error); }
}
