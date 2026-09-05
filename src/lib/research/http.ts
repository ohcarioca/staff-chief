import { ZodError } from "zod";
import { ResearchError } from "./contracts";

export function researchApiError(error: unknown) {
  if (error instanceof ResearchError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({ error: "Dados inválidos para a pesquisa." }, { status: 400 });
  console.error("[research] Unexpected API failure", error);
  return Response.json({ error: "Não foi possível concluir a operação de pesquisa." }, { status: 500 });
}
