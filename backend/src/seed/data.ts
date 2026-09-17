export interface CenarioSeed {
  dominio: "backend" | "kubernetes";
  modo: "incidente" | "code_review" | "arquitetura";
  variaveis: Record<string, string>;
}

export const seedCenarios: CenarioSeed[] = [
  // ---------- Backend ----------
  {
    dominio: "backend",
    modo: "incidente",
    variaveis: {
      domain: "API de pagamentos",
      symptom: "taxa de erro 5xx em 34% nas últimas 6 minutos, p99 em 9.2s",
      time: "23h47 de uma sexta-feira",
      root_cause:
        "connection pool esgotado no PostgreSQL por query sem índice rodando full table scan após deploy das 23h30",
    },
  },
  {
    dominio: "backend",
    modo: "code_review",
    variaveis: {
      domain: "Backend Node.js",
      pr_context:
        "endpoint de checkout com retry automático em caso de falha no gateway de pagamento",
      code_snippet: [
        "async function processCheckout(orderId, gatewayClient) {",
        "  try {",
        "    const result = await axios.post(",
        "      'https://gateway.example.com/charge',",
        "      { orderId }",
        "    );",
        "    return result.data;",
        "  } catch (err) {",
        "    return processCheckout(orderId, gatewayClient);",
        "  }",
        "}",
      ].join("\n"),
      planted_issues:
        "sem timeout no axios, retry sem exponential backoff, erro do gateway silenciado, sem idempotency key no retry",
    },
  },
  {
    dominio: "backend",
    modo: "arquitetura",
    variaveis: {
      architecture_problem:
        "sistema de notificações push para 500k usuários ativos com personalização por segmento",
      constraints:
        "time de 2 devs backend, $1.5k/mês budget, prazo de 4 semanas, sem experiência com message brokers",
      traps:
        "solução com SQS + Lambda parece simples mas cold start vai quebrar o SLA; fanout por segmento sem cache vai explodir o custo",
    },
  },
  // ---------- Kubernetes ----------
  {
    dominio: "kubernetes",
    modo: "incidente",
    variaveis: {
      domain: "cluster Kubernetes em GKE",
      symptom:
        "pods do serviço de auth em CrashLoopBackOff, 3 réplicas, nenhuma saudável",
      time: "08h12 de uma segunda-feira, 10 minutos antes do horário de pico",
      root_cause:
        "ConfigMap atualizado com variável de ambiente errada no deploy da madrugada — a URL do Redis está apontando para o ambiente de staging",
    },
  },
  {
    dominio: "kubernetes",
    modo: "code_review",
    variaveis: {
      domain: "Operador Kubernetes em Go",
      pr_context:
        "readiness probe customizada que checa dependências externas antes de marcar o pod como pronto",
      code_snippet: [
        "func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {",
        "  resp, err := http.Get(\"http://redis:6379/ping\")",
        "  if err != nil {",
        "    w.WriteHeader(http.StatusOK)",
        "    return",
        "  }",
        "  defer resp.Body.Close()",
        "  w.WriteHeader(http.StatusOK)",
        "}",
      ].join("\n"),
      planted_issues:
        "erro de dependência externa é ignorado e ainda retorna 200, sem timeout no http.Get, probe não reflete o estado real do pod",
    },
  },
  {
    dominio: "kubernetes",
    modo: "arquitetura",
    variaveis: {
      architecture_problem:
        "migrar logging descentralizado (kubectl logs por pod) para um pipeline centralizado em um cluster com 40 microsserviços",
      constraints:
        "time de 1 SRE dedicado, budget de $800/mês em infra de observabilidade, prazo de 3 semanas, cluster multi-tenant",
      traps:
        "solução ingênua com sidecar por pod dobra o consumo de memória do cluster; enviar log direto pro storage sem buffer derruba o serviço em picos de tráfego",
    },
  },
];
