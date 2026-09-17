export type Modo = "incidente" | "code_review" | "arquitetura";
export type Dominio = "backend" | "kubernetes";
export type StatusSessao = "active" | "evaluating" | "completed" | "encerrada";
export type Role = "user" | "assistant";
export type TipoSessao = "aula" | "simulacao" | "revisao";
export type Nivel = 1 | 2 | 3 | 4 | 5;
export type StatusTopicoEfetivo = "bloqueado" | "disponivel" | "em_andamento" | "concluido";

export interface Mensagem {
  role: Role;
  content: string;
}

export const TETO_TURNOS: Record<Modo, number> = {
  incidente: Number(process.env.MAX_TURNS_PER_SESSION ?? 15),
  arquitetura: Number(process.env.MAX_TURNS_PER_SESSION ?? 15),
  code_review: Number(process.env.MAX_TURNS_CODE_REVIEW ?? 12),
};

export const TETO_TURNOS_ENSINO = Number(process.env.MAX_TURNS_ENSINO ?? 20);
