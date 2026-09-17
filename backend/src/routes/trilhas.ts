import { Router } from "express";
import { pool } from "../db.js";
import type { Nivel, StatusTopicoEfetivo } from "../types.js";

export const router = Router();

export interface TopicoComStatus {
  id: string;
  nome: string;
  nivel: Nivel;
  ordem: number;
  objetivosAprendizagem: string[];
  conceitosIntroduzidos: string[];
  criteriosDominio: string[];
  status: StatusTopicoEfetivo;
  nivelDemonstrado: Nivel | null;
  preRequisitoFaltanteId: string | null;
}

export async function topicosComStatus(
  trilhaId: string,
  usuarioId: string,
): Promise<TopicoComStatus[]> {
  const { rows: topicos } = await pool.query(
    `SELECT id, nome, nivel, ordem, objetivos_aprendizagem, conceitos_introduzidos, criterios_dominio
     FROM topicos WHERE trilha_id = $1 ORDER BY ordem`,
    [trilhaId],
  );

  const { rows: preRequisitos } = await pool.query(
    `SELECT pr.topico_id, pr.pre_requisito_id
     FROM topico_pre_requisitos pr
     JOIN topicos t ON t.id = pr.topico_id
     WHERE t.trilha_id = $1`,
    [trilhaId],
  );
  const preRequisitosPorTopico = new Map<string, string[]>();
  for (const row of preRequisitos) {
    const lista = preRequisitosPorTopico.get(row.topico_id) ?? [];
    lista.push(row.pre_requisito_id);
    preRequisitosPorTopico.set(row.topico_id, lista);
  }

  const { rows: progresso } = await pool.query(
    `SELECT p.topico_id, p.status, p.nivel_demonstrado
     FROM progresso_topico p
     JOIN topicos t ON t.id = p.topico_id
     WHERE t.trilha_id = $1 AND p.usuario_id = $2`,
    [trilhaId, usuarioId],
  );
  const progressoPorTopico = new Map<string, { status: string; nivelDemonstrado: number | null }>();
  for (const row of progresso) {
    progressoPorTopico.set(row.topico_id, {
      status: row.status,
      nivelDemonstrado: row.nivel_demonstrado,
    });
  }

  return topicos.map((topico) => {
    const progressoDoTopico = progressoPorTopico.get(topico.id);

    let status: StatusTopicoEfetivo;
    let preRequisitoFaltanteId: string | null = null;

    if (progressoDoTopico?.status === "concluido") {
      status = "concluido";
    } else if (progressoDoTopico?.status === "em_andamento") {
      status = "em_andamento";
    } else {
      const preRequisitosDoTopico = preRequisitosPorTopico.get(topico.id) ?? [];
      const faltante = preRequisitosDoTopico.find(
        (id) => progressoPorTopico.get(id)?.status !== "concluido",
      );
      if (faltante) {
        status = "bloqueado";
        preRequisitoFaltanteId = faltante;
      } else {
        status = "disponivel";
      }
    }

    return {
      id: topico.id,
      nome: topico.nome,
      nivel: topico.nivel,
      ordem: topico.ordem,
      objetivosAprendizagem: topico.objetivos_aprendizagem,
      conceitosIntroduzidos: topico.conceitos_introduzidos,
      criteriosDominio: topico.criterios_dominio,
      status,
      nivelDemonstrado: (progressoDoTopico?.nivelDemonstrado as Nivel | null) ?? null,
      preRequisitoFaltanteId,
    };
  });
}

// GET /api/trilhas
router.get("/trilhas", async (_req, res) => {
  const { rows } = await pool.query("SELECT id, dominio, nome, descricao FROM trilhas ORDER BY nome");
  res.status(200).json({ trilhas: rows });
});

// GET /api/trilhas/:id/topicos?usuarioId=...
router.get("/trilhas/:id/topicos", async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.query.usuarioId;

  if (!usuarioId || typeof usuarioId !== "string") {
    return res.status(400).json({ erro: "usuarioId_obrigatorio" });
  }

  const { rows: trilhaRows } = await pool.query("SELECT id FROM trilhas WHERE id = $1", [id]);
  if (trilhaRows.length === 0) return res.status(404).json({ erro: "trilha_nao_encontrada" });

  await pool.query("INSERT INTO usuarios (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [usuarioId]);

  const topicos = await topicosComStatus(id, usuarioId);
  res.status(200).json({ topicos });
});

// GET /api/topicos/:id/menu?usuarioId=...
// Catálogo de modos pós-tópico (R3): nunca omite uma opção, só marca como bloqueada.
router.get("/topicos/:id/menu", async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.query.usuarioId;

  if (!usuarioId || typeof usuarioId !== "string") {
    return res.status(400).json({ erro: "usuarioId_obrigatorio" });
  }

  const { rows: topicoRows } = await pool.query(
    "SELECT id, trilha_id, ordem FROM topicos WHERE id = $1",
    [id],
  );
  if (topicoRows.length === 0) return res.status(404).json({ erro: "topico_nao_encontrado" });
  const topico = topicoRows[0];

  const topicos = await topicosComStatus(topico.trilha_id, usuarioId);
  const atual = topicos.find((t) => t.id === id)!;
  const proximo = topicos.find((t) => t.ordem === topico.ordem + 1) ?? null;

  const concluido = atual.status === "concluido";

  res.status(200).json({
    modos: {
      simulacao_incidente: { disponivel: concluido, motivo: concluido ? null : "tópico ainda não concluído" },
      simulacao_code_review: { disponivel: concluido, motivo: concluido ? null : "tópico ainda não concluído" },
      simulacao_arquitetura: { disponivel: concluido, motivo: concluido ? null : "tópico ainda não concluído" },
      revisao: { disponivel: concluido, motivo: concluido ? null : "tópico ainda não concluído" },
      aprofundar: { disponivel: true, motivo: null },
      avancar: proximo
        ? { disponivel: concluido, motivo: concluido ? null : "conclua o tópico atual primeiro", proximoTopicoId: proximo.id }
        : { disponivel: false, motivo: "não há próximo tópico na trilha" },
    },
  });
});
