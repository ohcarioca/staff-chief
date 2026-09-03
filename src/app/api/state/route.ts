import { getAppState } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json(getAppState(search), { headers: { "Cache-Control": "no-store" } });
}
