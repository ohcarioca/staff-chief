import { apiError } from "@/lib/api";
import { LibraryError } from "./contracts";

export function libraryApiError(error: unknown) {
  if (error instanceof LibraryError) return Response.json({ error: error.message }, { status: error.status });
  // Zod validation messages are safe; internal parser/database errors are not.
  if (error instanceof Error && error.name === "ZodError") return apiError(error);
  return Response.json({ error: "Não foi possível concluir a operação na biblioteca." }, { status: 500 });
}
