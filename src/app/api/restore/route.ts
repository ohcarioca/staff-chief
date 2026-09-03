import { apiError } from "@/lib/api";
import { restoreBackup } from "@/lib/db/repository";

export async function POST(request: Request) {
  try {
    const safetyBackup = restoreBackup(await request.json());
    return Response.json({ ok: true, safetyBackup });
  } catch (error) {
    return apiError(error);
  }
}
