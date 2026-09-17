import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 10_000,
  maxRetries: 0,
});

let chaveValida = false;

export function chaveAnthropicOk(): boolean {
  return chaveValida;
}

export async function verificarChaveAnthropic(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    chaveValida = false;
    console.error("[boot] ANTHROPIC_API_KEY ausente");
    return;
  }

  try {
    await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    chaveValida = true;
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    if (status === 401) {
      chaveValida = false;
      console.error("[boot] ANTHROPIC_API_KEY inválida (401)");
    } else {
      // Chave provavelmente válida; falha foi de outra natureza (rede, rate limit, etc).
      chaveValida = true;
      console.warn("[boot] verificação da chave Anthropic inconclusiva:", status ?? err);
    }
  }
}
