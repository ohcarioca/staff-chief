import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json({ error: "Dados inválidos.", details: error.issues }, { status: 400 });
  }
  if (error instanceof Error) {
    const status = error.message.includes("não encontrad") || error.message.includes("não existe") ? 404 : 400;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: "Erro inesperado." }, { status: 500 });
}
