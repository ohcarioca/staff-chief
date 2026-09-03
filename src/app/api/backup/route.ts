import { exportBackup } from "@/lib/db/repository";

export async function GET() {
  const filename = `staff-chief-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(exportBackup(), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
