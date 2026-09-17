import Anthropic from "@anthropic-ai/sdk";
import type { Mensagem } from "../types.js";

const MODEL_PADRAO = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const MAX_TOKENS = 1024;
const RETRY_BACKOFF_MS = 2000;

// Permite que o usuário informe sua própria chave/modelo (ver modal no frontend);
// se não vier nada, cai no padrão do servidor (env). Por isso o client é criado
// por chamada em vez de uma instância única no módulo.
export interface AgentOptions {
  apiKey?: string;
  model?: string;
}

function criarCliente(apiKey?: string): Anthropic {
  return new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    timeout: 30_000,
    maxRetries: 0,
  });
}

export type AgentErrorCode =
  | "agente_sobrecarregado"
  | "agente_indisponivel"
  | "timeout";

export class AgentError extends Error {
  constructor(
    public code: AgentErrorCode,
    public httpStatus: number,
  ) {
    super(code);
  }
}

export interface AgentResponse {
  conteudo: string;
  truncado: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chamarUmaVez(
  systemPrompt: string,
  messages: Mensagem[],
  opcoes?: AgentOptions,
): Promise<AgentResponse> {
  const anthropic = criarCliente(opcoes?.apiKey);
  const response = await anthropic.messages.create({
    model: opcoes?.model || MODEL_PADRAO,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  const bloco = response.content.find((b) => b.type === "text");
  const conteudo = bloco && bloco.type === "text" ? bloco.text : "";

  return {
    conteudo,
    truncado: response.stop_reason === "max_tokens",
  };
}

export async function chamarAgente(
  systemPrompt: string,
  messages: Mensagem[],
  opcoes?: AgentOptions,
): Promise<AgentResponse> {
  try {
    return await chamarUmaVez(systemPrompt, messages, opcoes);
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    const isTimeout = err instanceof Anthropic.APIConnectionTimeoutError;
    const isRetryable = status === 429 || (status !== undefined && status >= 500) || isTimeout;

    if (!isRetryable) {
      throw new AgentError("agente_indisponivel", 502);
    }

    await sleep(RETRY_BACKOFF_MS);

    try {
      return await chamarUmaVez(systemPrompt, messages, opcoes);
    } catch (err2) {
      const status2 = err2 instanceof Anthropic.APIError ? err2.status : undefined;
      const isTimeout2 = err2 instanceof Anthropic.APIConnectionTimeoutError;

      if (isTimeout2) throw new AgentError("timeout", 504);
      if (status2 === 429) throw new AgentError("agente_sobrecarregado", 502);
      throw new AgentError("agente_indisponivel", 502);
    }
  }
}
