import "server-only";
import { CodexCliProvider } from "@/lib/analysis/codex-provider";
import { noEvidenceAnswer, validateAnswer } from "./context";
import { ResearchError, isPending } from "./contracts";
import { enqueueMessage, finishMessage, getMessage, getMessageContext, retryMessage } from "./repository";

type Provider = Pick<CodexCliProvider, "runStructured">;
const runtime = globalThis as unknown as { staffChiefResearchControllers?: Map<string, AbortController> };
const controllers = runtime.staffChiefResearchControllers ??= new Map();

export async function executeMessage(id: string, provider: Provider = new CodexCliProvider()) {
  if (controllers.has(id)) return;
  const message = getMessage(id);
  if (message.status !== "queued") return;
  const controller = new AbortController();
  controllers.set(id, controller);
  try {
    finishMessage(id, "running", null, null, message.attempt);
    const context = getMessageContext(id);
    const answer = context.chunks.length ? validateAnswer(await provider.runStructured(context.prompt, context.schema, controller.signal), context) : noEvidenceAnswer;
    if (!controller.signal.aborted) finishMessage(id, "completed", answer, null, message.attempt);
  } catch (error) {
    const cancelled = controller.signal.aborted;
    const safeMessage = cancelled ? "Resposta cancelada." : error instanceof ResearchError ? error.message
      : error instanceof Error && /spawn .*ENOENT/.test(error.message) ? "O servidor não encontrou o Codex CLI. Instale o Codex ou configure CODEX_BIN com o caminho de codex.exe e reinicie o servidor."
      : error instanceof Error && /três minutos|timeout/i.test(error.message) ? "O Codex excedeu três minutos. Tente novamente."
      : "Não foi possível obter uma resposta válida do Codex. Verifique a sessão local e tente novamente.";
    if (!cancelled) console.error("[research] Execution failed", id, error instanceof Error ? error.name : "UnknownError", safeMessage);
    finishMessage(id, cancelled ? "cancelled" : "failed", null, safeMessage, message.attempt);
  } finally { if (controllers.get(id) === controller) controllers.delete(id); }
}

export function sendMessage(conversationId: string, input: unknown) {
  const result = enqueueMessage(conversationId, input);
  if (result.created) void executeMessage(result.message.id);
  return getMessage(result.message.id);
}
export function cancelMessage(id: string) {
  const message = getMessage(id);
  if (isPending(message.status)) {
    controllers.get(id)?.abort();
    finishMessage(id, "cancelled", null, "Resposta cancelada.", message.attempt);
  }
  return getMessage(id);
}
export function repeatMessage(id: string, attempt: number) {
  if (controllers.has(id)) throw new ResearchError("Aguarde o encerramento da tentativa atual.", 409);
  const result = retryMessage(id, attempt);
  if (result.created) void executeMessage(id);
  return getMessage(id);
}
