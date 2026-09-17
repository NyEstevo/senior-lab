const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const CHAVE_API_KEY = "seniorlab_anthropic_api_key";
const CHAVE_MODEL = "seniorlab_anthropic_model";

export interface ConfigAgente {
  apiKey: string;
  model: string;
}

export function getConfigAgente(): ConfigAgente {
  return {
    apiKey: localStorage.getItem(CHAVE_API_KEY) ?? "",
    model: localStorage.getItem(CHAVE_MODEL) ?? "",
  };
}

export function salvarConfigAgente(config: ConfigAgente): void {
  if (config.apiKey) localStorage.setItem(CHAVE_API_KEY, config.apiKey);
  else localStorage.removeItem(CHAVE_API_KEY);

  if (config.model) localStorage.setItem(CHAVE_MODEL, config.model);
  else localStorage.removeItem(CHAVE_MODEL);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public erro: string,
    public detalhe?: Record<string, unknown>,
  ) {
    super(erro);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { apiKey, model } = getConfigAgente();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (apiKey) headers["X-Anthropic-Api-Key"] = apiKey;
  if (model) headers["X-Anthropic-Model"] = model;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "falha_de_rede");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.erro ?? "erro_desconhecido", body);
  }
  return body as T;
}

// ---------- Trilhas ----------

export interface Trilha {
  id: string;
  dominio: string;
  nome: string;
  descricao: string;
}

export function listarTrilhas() {
  return request<{ trilhas: Trilha[] }>("/api/trilhas");
}

export type StatusTopico = "bloqueado" | "disponivel" | "em_andamento" | "concluido";

export interface Topico {
  id: string;
  nome: string;
  nivel: number;
  ordem: number;
  objetivosAprendizagem: string[];
  conceitosIntroduzidos: string[];
  criteriosDominio: string[];
  status: StatusTopico;
  nivelDemonstrado: number | null;
  preRequisitoFaltanteId: string | null;
}

export function listarTopicos(trilhaId: string, usuarioId: string) {
  return request<{ topicos: Topico[] }>(
    `/api/trilhas/${trilhaId}/topicos?usuarioId=${encodeURIComponent(usuarioId)}`,
  );
}

export interface OpcaoMenu {
  disponivel: boolean;
  motivo: string | null;
  proximoTopicoId?: string;
}

export interface MenuTopico {
  modos: {
    simulacao_incidente: OpcaoMenu;
    simulacao_code_review: OpcaoMenu;
    simulacao_arquitetura: OpcaoMenu;
    revisao: OpcaoMenu;
    aprofundar: OpcaoMenu;
    avancar: OpcaoMenu;
  };
}

export function obterMenuTopico(topicoId: string, usuarioId: string) {
  return request<MenuTopico>(`/api/topicos/${topicoId}/menu?usuarioId=${encodeURIComponent(usuarioId)}`);
}

// ---------- Sessões ----------

export type TipoSessao = "aula" | "simulacao" | "revisao";

export interface Cenario {
  dominio: string;
  modo: string;
  variaveis: Record<string, string>;
}

export interface CriarSessaoResposta {
  sessaoId: string;
  tipoSessao: TipoSessao;
  topico: { id: string; nome: string; nivel: number };
  cenario: Cenario | null;
  mensagemInicial: string;
}

export function criarSessao(params: {
  usuarioId: string;
  tipoSessao: TipoSessao;
  topicoId: string;
  modo?: string;
}) {
  return request<CriarSessaoResposta>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface FechamentoTopico {
  concluido: boolean;
  nivelDemonstrado?: number;
  lacunas?: string[];
}

export interface TurnoResposta {
  role: "assistant";
  conteudo: string;
  truncado: boolean;
  turnoLimiteAtingido: boolean;
  fechamentoTopico?: FechamentoTopico;
}

export function enviarTurno(sessaoId: string, mensagem: string) {
  return request<TurnoResposta>(`/api/sessions/${sessaoId}/turns`, {
    method: "POST",
    body: JSON.stringify({ mensagem }),
  });
}

export interface FechamentoTopicoResposta {
  fechamentoTopico?: FechamentoTopico;
  avaliacao?: string;
}

export function encerrarSessao(sessaoId: string) {
  return request<FechamentoTopicoResposta>(`/api/sessions/${sessaoId}/end`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface SessaoResumo {
  id: string;
  dominio: string;
  modo: string | null;
  tipoSessao: TipoSessao;
  topicoNome: string | null;
  status: string;
  criadoEm: string;
}

export function listarSessoes(usuarioId: string) {
  return request<{ sessoes: SessaoResumo[] }>(`/api/users/${usuarioId}/sessions`);
}

export function retomarSessao(sessaoId: string) {
  return request<{ status: string }>(`/api/sessions/${sessaoId}/resume`, { method: "POST" });
}

export interface MensagemSalva {
  role: "user" | "assistant";
  conteudo: string;
  criado_em: string;
}

export interface ObterSessaoResposta {
  sessao: {
    id: string;
    status: string;
    tipo_sessao: TipoSessao;
    dominio: string;
    modo: string | null;
    topico_nome: string | null;
    topico_id: string | null;
    criado_em: string;
    encerrado_em: string | null;
  };
  mensagens: MensagemSalva[];
  avaliacao: string | null;
}

export function obterSessao(sessaoId: string) {
  return request<ObterSessaoResposta>(`/api/sessions/${sessaoId}`);
}
