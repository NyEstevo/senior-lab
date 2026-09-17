import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Modo, Nivel } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

const ARQUIVO_POR_MODO: Record<Modo, string> = {
  incidente: "incidente.txt",
  code_review: "code-review.txt",
  arquitetura: "arquitetura.txt",
};

function preencherTemplate(template: string, variaveis: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variaveis[key] ?? `[${key} não definido]`);
}

function carregarTemplate(arquivo: string): string {
  return readFileSync(join(PROMPTS_DIR, arquivo), "utf-8");
}

export function buildSystemPrompt(
  modo: Modo,
  variaveis: Record<string, string>,
): string {
  return preencherTemplate(carregarTemplate(ARQUIVO_POR_MODO[modo]), variaveis);
}

export interface TopicoParaPrompt {
  nome: string;
  nivel: Nivel;
  objetivosAprendizagem: string[];
  conceitosIntroduzidos: string[];
  criteriosDominio: string[];
}

function listaMarcada(itens: string[]): string {
  return itens.map((item) => `- ${item}`).join("\n");
}

export function buildAulaPrompt(topico: TopicoParaPrompt): string {
  return preencherTemplate(carregarTemplate("aula.txt"), {
    topico_nome: topico.nome,
    nivel: String(topico.nivel),
    objetivos: listaMarcada(topico.objetivosAprendizagem),
    conceitos: listaMarcada(topico.conceitosIntroduzidos),
    criterios_dominio: listaMarcada(topico.criteriosDominio),
  });
}

export function buildRevisaoPrompt(topico: TopicoParaPrompt, nivelDemonstrado: Nivel): string {
  return preencherTemplate(carregarTemplate("revisao.txt"), {
    topico_nome: topico.nome,
    nivel: String(nivelDemonstrado),
    conceitos: listaMarcada(topico.conceitosIntroduzidos),
  });
}

// Tabela de calibração L1-L5 (ver docs/0002-plano-trilha-progressiva-calibracao.md, seção 4).
const CALIBRACAO_POR_NIVEL: Record<Nivel, Record<string, string>> = {
  1: {
    n_componentes: "1",
    n_red_herrings: "0",
    ambiguidade: "totalmente explícito",
    profundidade_causa: "sintoma = causa",
    autonomia: "ofereça uma dica se o aluno ficar 2 turnos sem progresso",
    ruido: "nenhum stakeholder interrompendo, logs limpos",
  },
  2: {
    n_componentes: "1 a 2",
    n_red_herrings: "0 a 1",
    ambiguidade: "quase explícito",
    profundidade_causa: "1 salto (sintoma leva direto à causa)",
    autonomia: "ofereça uma dica se o aluno ficar 3 turnos sem progresso",
    ruido: "1 stakeholder calmo pedindo status",
  },
  3: {
    n_componentes: "2 a 3",
    n_red_herrings: "1 a 2",
    ambiguidade: "parcialmente aberto",
    profundidade_causa: "2 saltos (existe uma causa intermediária)",
    autonomia: "só ofereça dica se o aluno pedir explicitamente",
    ruido: "1 a 2 stakeholders, uma fonte de log irrelevante",
  },
  4: {
    n_componentes: "3 a 4",
    n_red_herrings: "2 a 3",
    ambiguidade: "aberto, exige que o aluno formule hipóteses",
    profundidade_causa: "causa sistêmica (combinação de config e infra)",
    autonomia: "nunca ofereça dica proativamente, só confirme perguntas bem feitas",
    ruido: "múltiplos stakeholders, logs ruidosos",
  },
  5: {
    n_componentes: "4 ou mais",
    n_red_herrings: "3 ou mais",
    ambiguidade: "aberto, múltiplas causas plausíveis coexistindo",
    profundidade_causa: "causa sistêmica multi-camada",
    autonomia: "nunca ofereça dica, questione de volta as hipóteses do aluno",
    ruido: "crise multi-stakeholder, ruído alto e informação conflitante",
  },
};

export function calibracaoParaNivel(nivel: Nivel): Record<string, string> {
  return CALIBRACAO_POR_NIVEL[nivel];
}

export const INSTRUCAO_ENCERRAMENTO =
  "[sistema] Encerre a simulação e entre no modo avaliação conforme as instruções do seu system prompt.";

const REGEX_FECHAMENTO_TOPICO =
  /\[FECHAMENTO_TOPICO\s+nivel_demonstrado=(\d)\s+lacunas="([^"]*)"\]/;

export interface FechamentoTopico {
  nivelDemonstrado: Nivel;
  lacunas: string[];
}

export function extrairFechamentoTopico(resposta: string): FechamentoTopico | null {
  const match = resposta.match(REGEX_FECHAMENTO_TOPICO);
  if (!match) return null;

  const nivel = Number(match[1]);
  if (nivel < 1 || nivel > 5) return null;

  const lacunas = match[2]
    .split(";")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return { nivelDemonstrado: nivel as Nivel, lacunas };
}
