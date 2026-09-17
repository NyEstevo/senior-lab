import { Router } from "express";
import { pool } from "../db.js";
import {
  buildAulaPrompt,
  buildRevisaoPrompt,
  buildSystemPrompt,
  calibracaoParaNivel,
  extrairAvaliacaoIncidente,
  extrairFechamentoTopico,
  INSTRUCAO_ENCERRAMENTO,
  removerMarcadorAvaliacao,
} from "../agent/prompt.js";
import { AgentError, chamarAgente, type AgentOptions } from "../agent/client.js";
import { topicosComStatus } from "./trilhas.js";
import {
  TETO_TURNOS,
  TETO_TURNOS_ENSINO,
  type Dominio,
  type Mensagem,
  type Modo,
  type Nivel,
  type TipoSessao,
} from "../types.js";

export const router = Router();

const MODOS: Modo[] = ["incidente", "code_review", "arquitetura"];
const TIPOS_SESSAO: TipoSessao[] = ["aula", "simulacao", "revisao"];

async function carregarHistorico(sessaoId: string): Promise<Mensagem[]> {
  const { rows } = await pool.query(
    "SELECT role, conteudo FROM mensagens WHERE sessao_id = $1 ORDER BY criado_em",
    [sessaoId],
  );
  return rows.map((r) => ({ role: r.role, content: r.conteudo }));
}

async function salvarMensagem(sessaoId: string, role: "user" | "assistant", conteudo: string) {
  await pool.query(
    "INSERT INTO mensagens (sessao_id, role, conteudo) VALUES ($1, $2, $3)",
    [sessaoId, role, conteudo],
  );
}

// Permite que o usuário informe sua própria chave/modelo Anthropic pelo modal do
// frontend (headers enviados em toda chamada, ver frontend/src/api.ts); sem eles,
// chamarAgente cai no padrão do servidor (env).
function opcoesAgente(req: import("express").Request): AgentOptions | undefined {
  const apiKey = req.header("x-anthropic-api-key")?.trim();
  const model = req.header("x-anthropic-model")?.trim();
  if (!apiKey && !model) return undefined;
  return { apiKey: apiKey || undefined, model: model || undefined };
}

function tratarErroAgente(err: unknown, res: import("express").Response) {
  if (err instanceof AgentError) {
    res.status(err.httpStatus).json({ erro: err.code });
    return;
  }
  console.error(err);
  res.status(502).json({ erro: "agente_indisponivel" });
}

async function conceitosJaEnsinados(trilhaId: string, usuarioId: string): Promise<string[]> {
  const topicos = await topicosComStatus(trilhaId, usuarioId);
  return topicos
    .filter((t) => t.status === "concluido")
    .flatMap((t) => t.conceitosIntroduzidos);
}

// POST /api/sessions
router.post("/sessions", async (req, res) => {
  const { usuarioId, tipoSessao, topicoId, modo } = req.body ?? {};
  const tipo: TipoSessao = tipoSessao ?? "simulacao";

  if (!usuarioId || !topicoId || !TIPOS_SESSAO.includes(tipo)) {
    return res.status(400).json({ erro: "campos_obrigatorios_ausentes" });
  }
  if (tipo === "simulacao" && !MODOS.includes(modo)) {
    return res.status(400).json({ erro: "modo_invalido" });
  }

  await pool.query("INSERT INTO usuarios (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [usuarioId]);

  const { rows: topicoRows } = await pool.query(
    `SELECT t.id, t.trilha_id, t.nome, t.nivel, t.objetivos_aprendizagem,
            t.conceitos_introduzidos, t.criterios_dominio, tr.dominio
     FROM topicos t JOIN trilhas tr ON tr.id = t.trilha_id
     WHERE t.id = $1`,
    [topicoId],
  );
  if (topicoRows.length === 0) return res.status(404).json({ erro: "topico_nao_encontrado" });
  const topicoRow = topicoRows[0];
  const topico = {
    id: topicoRow.id as string,
    trilhaId: topicoRow.trilha_id as string,
    nome: topicoRow.nome as string,
    nivel: topicoRow.nivel as Nivel,
    objetivosAprendizagem: topicoRow.objetivos_aprendizagem as string[],
    conceitosIntroduzidos: topicoRow.conceitos_introduzidos as string[],
    criteriosDominio: topicoRow.criterios_dominio as string[],
    dominio: topicoRow.dominio as Dominio,
  };

  const topicos = await topicosComStatus(topico.trilhaId, usuarioId);
  const statusAtual = topicos.find((t) => t.id === topico.id)!;

  if (statusAtual.status === "bloqueado") {
    return res.status(409).json({
      erro: "pre_requisito_faltante",
      preRequisitoFaltanteId: statusAtual.preRequisitoFaltanteId,
    });
  }
  if (tipo !== "aula" && statusAtual.status !== "concluido") {
    return res.status(409).json({ erro: "topico_nao_concluido" });
  }

  let systemPrompt: string;
  let cenarioId: string | null = null;
  let cenarioResumo: { dominio: Dominio; modo: Modo; variaveis: Record<string, string> } | null = null;

  if (tipo === "aula") {
    systemPrompt = buildAulaPrompt(topico);
  } else if (tipo === "revisao") {
    const nivel = statusAtual.nivelDemonstrado ?? topico.nivel;
    systemPrompt = buildRevisaoPrompt(topico, nivel);
  } else {
    const { rows: cenarioRows } = await pool.query(
      "SELECT id, variaveis FROM cenarios WHERE dominio = $1 AND modo = $2 ORDER BY random() LIMIT 1",
      [topico.dominio, modo],
    );
    if (cenarioRows.length === 0) return res.status(500).json({ erro: "falha_ao_gerar_cenario" });
    const cenario = cenarioRows[0];
    cenarioId = cenario.id;

    const nivel = statusAtual.nivelDemonstrado ?? topico.nivel;
    const conceitosDisponiveis = await conceitosJaEnsinados(topico.trilhaId, usuarioId);

    systemPrompt = buildSystemPrompt(modo as Modo, {
      ...cenario.variaveis,
      nivel: String(nivel),
      topico_nome: topico.nome,
      conceitos_disponiveis: conceitosDisponiveis.join(", ") || "nenhum ainda",
      ...calibracaoParaNivel(nivel),
    });
    cenarioResumo = { dominio: topico.dominio, modo: modo as Modo, variaveis: cenario.variaveis };
  }

  const { rows: sessaoRows } = await pool.query(
    `INSERT INTO sessoes (usuario_id, cenario_id, topico_id, tipo_sessao, system_prompt)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [usuarioId, cenarioId, topico.id, tipo, systemPrompt],
  );
  const sessaoId = sessaoRows[0].id;

  if (tipo === "aula") {
    await pool.query(
      `INSERT INTO progresso_topico (usuario_id, topico_id, status)
       VALUES ($1, $2, 'em_andamento')
       ON CONFLICT (usuario_id, topico_id) DO NOTHING`,
      [usuarioId, topico.id],
    );
  }

  const kickoff = "[sistema] Inicie a sessão conforme as instruções de abertura do seu system prompt.";
  try {
    const resposta = await chamarAgente(systemPrompt, [{ role: "user", content: kickoff }], opcoesAgente(req));
    await salvarMensagem(sessaoId, "user", kickoff);
    await salvarMensagem(sessaoId, "assistant", resposta.conteudo);

    res.status(201).json({
      sessaoId,
      tipoSessao: tipo,
      topico: { id: topico.id, nome: topico.nome, nivel: topico.nivel },
      cenario: cenarioResumo,
      mensagemInicial: resposta.conteudo,
    });
  } catch (err) {
    tratarErroAgente(err, res);
  }
});

// POST /api/sessions/:id/turns
router.post("/sessions/:id/turns", async (req, res) => {
  const { id } = req.params;
  const { mensagem } = req.body ?? {};

  const { rows } = await pool.query(
    "SELECT id, status, system_prompt, cenario_id, tipo_sessao, topico_id, usuario_id FROM sessoes WHERE id = $1",
    [id],
  );
  if (rows.length === 0) return res.status(404).json({ erro: "sessao_nao_encontrada" });
  const sessao = rows[0];
  if (sessao.status !== "active") {
    return res.status(409).json({ erro: "sessao_encerrada" });
  }

  let teto = TETO_TURNOS_ENSINO;
  if (sessao.tipo_sessao === "simulacao") {
    const { rows: cenarioRows } = await pool.query("SELECT modo FROM cenarios WHERE id = $1", [
      sessao.cenario_id,
    ]);
    const modo: Modo = cenarioRows[0].modo;
    teto = TETO_TURNOS[modo];
  }

  const { rows: countRows } = await pool.query(
    "SELECT count(*)::int AS total FROM mensagens WHERE sessao_id = $1",
    [id],
  );
  const turnosAtuais = Math.floor(countRows[0].total / 2);
  if (turnosAtuais >= teto) {
    return res.status(422).json({ erro: "teto_de_turnos_atingido" });
  }

  if (!mensagem || typeof mensagem !== "string") {
    return res.status(400).json({ erro: "mensagem_invalida" });
  }

  await salvarMensagem(id, "user", mensagem);

  try {
    const historico = await carregarHistorico(id);
    const resposta = await chamarAgente(sessao.system_prompt, historico, opcoesAgente(req));
    await salvarMensagem(id, "assistant", resposta.conteudo);

    // A conclusão do tópico (critério do agente) é detectada dentro do turno
    // normal, sem precisar de nenhuma chamada extra — "Encerrar" (endpoint
    // /end) é uma decisão do aluno, tratada à parte, sem custo de API.
    let fechamentoTopico: { concluido: true; nivelDemonstrado: number; lacunas: string[] } | undefined;
    if (sessao.tipo_sessao === "aula") {
      const fechamento = extrairFechamentoTopico(resposta.conteudo);
      if (fechamento) {
        await pool.query(
          `INSERT INTO progresso_topico (usuario_id, topico_id, status, nivel_demonstrado, tentativas, lacunas_identificadas, atualizado_em)
           VALUES ($1, $2, 'concluido', $3, 1, $4, now())
           ON CONFLICT (usuario_id, topico_id) DO UPDATE
             SET status = 'concluido',
                 nivel_demonstrado = EXCLUDED.nivel_demonstrado,
                 tentativas = progresso_topico.tentativas + 1,
                 lacunas_identificadas = EXCLUDED.lacunas_identificadas,
                 atualizado_em = now()`,
          [sessao.usuario_id, sessao.topico_id, fechamento.nivelDemonstrado, JSON.stringify(fechamento.lacunas)],
        );
        await pool.query("UPDATE sessoes SET status = 'completed', encerrado_em = now() WHERE id = $1", [id]);
        fechamentoTopico = {
          concluido: true,
          nivelDemonstrado: fechamento.nivelDemonstrado,
          lacunas: fechamento.lacunas,
        };
      }
    }

    res.status(200).json({
      role: "assistant",
      conteudo: resposta.conteudo,
      truncado: resposta.truncado,
      turnoLimiteAtingido: turnosAtuais + 1 >= teto,
      fechamentoTopico,
    });
  } catch (err) {
    tratarErroAgente(err, res);
  }
});

// POST /api/sessions/:id/end
router.post("/sessions/:id/end", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT id, status, system_prompt, cenario_id, tipo_sessao, topico_id, usuario_id FROM sessoes WHERE id = $1",
    [id],
  );
  if (rows.length === 0) return res.status(404).json({ erro: "sessao_nao_encontrada" });
  const sessao = rows[0];
  if (sessao.status !== "active") {
    return res.status(409).json({ erro: "sessao_ja_encerrada" });
  }

  if (sessao.tipo_sessao === "aula") {
    // "Encerrar" é uma decisão do aluno, não do agente — vira uma escrita
    // direta no banco, sem chamar a API. A conclusão do tópico já é detectada
    // dentro de POST /turns (a cada resposta normal do agente); se este ponto
    // foi alcançado é porque o aluno saiu antes disso acontecer. O tópico
    // continua 'em_andamento' (nunca perde progresso) e pode ser retomado.
    await pool.query(
      `INSERT INTO progresso_topico (usuario_id, topico_id, status, tentativas, atualizado_em)
       VALUES ($1, $2, 'em_andamento', 1, now())
       ON CONFLICT (usuario_id, topico_id) DO UPDATE
         SET tentativas = progresso_topico.tentativas + 1,
             atualizado_em = now()`,
      [sessao.usuario_id, sessao.topico_id],
    );
    await pool.query("UPDATE sessoes SET status = 'encerrada', encerrado_em = now() WHERE id = $1", [id]);

    return res.status(200).json({ fechamentoTopico: { concluido: false } });
  }

  await salvarMensagem(id, "user", INSTRUCAO_ENCERRAMENTO);

  try {
    const historico = await carregarHistorico(id);
    const resposta = await chamarAgente(sessao.system_prompt, historico, opcoesAgente(req));
    await salvarMensagem(id, "assistant", resposta.conteudo);

    // A causa raiz do cenário existia no servidor antes da sessão começar. O
    // veredito do agente é gravado ao lado dela, nunca no lugar dela — assim
    // a avaliação é verificável contra o que o cenário definia, não só contra
    // o texto livre. Cenários sem root_cause (code_review, arquitetura) ficam
    // com as colunas nulas.
    let causaRaizEsperada: string | null = null;
    if (sessao.cenario_id) {
      const { rows: cenarioRows } = await pool.query(
        "SELECT variaveis->>'root_cause' AS root_cause FROM cenarios WHERE id = $1",
        [sessao.cenario_id],
      );
      causaRaizEsperada = cenarioRows[0]?.root_cause ?? null;
    }
    const veredito = causaRaizEsperada ? extrairAvaliacaoIncidente(resposta.conteudo) : null;
    if (causaRaizEsperada && !veredito) {
      console.warn(`[sessions] avaliação de incidente sem marcador [AVALIACAO] (sessão ${id})`);
    }

    await pool.query(
      `INSERT INTO avaliacoes (sessao_id, conteudo, causa_raiz_esperada, causa_raiz_encontrada, hipotese_final)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, resposta.conteudo, causaRaizEsperada, veredito?.causaRaizEncontrada ?? null, veredito?.hipoteseFinal ?? null],
    );
    await pool.query("UPDATE sessoes SET status = 'completed', encerrado_em = now() WHERE id = $1", [id]);

    if (sessao.tipo_sessao === "simulacao") {
      await pool.query(
        `INSERT INTO progresso_topico (usuario_id, topico_id, status, tentativas, atualizado_em)
         VALUES ($1, $2, 'concluido', 1, now())
         ON CONFLICT (usuario_id, topico_id) DO UPDATE
           SET tentativas = progresso_topico.tentativas + 1,
               atualizado_em = now()`,
        [sessao.usuario_id, sessao.topico_id],
      );
    }

    res.status(200).json({
      avaliacao: removerMarcadorAvaliacao(resposta.conteudo),
      veredito: veredito
        ? { causaRaizEncontrada: veredito.causaRaizEncontrada, hipoteseFinal: veredito.hipoteseFinal, causaRaizEsperada }
        : null,
    });
  } catch (err) {
    tratarErroAgente(err, res);
  }
});

// POST /api/sessions/:id/resume
// Retomar é decisão do aluno, assim como encerrar — escrita direta no banco,
// sem chamar o agente. Só uma sessão 'encerrada' (aluno saiu sem concluir)
// pode ser retomada; 'completed' (tópico já dominado) fica como está.
router.post("/sessions/:id/resume", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query("SELECT id, status FROM sessoes WHERE id = $1", [id]);
  if (rows.length === 0) return res.status(404).json({ erro: "sessao_nao_encontrada" });
  if (rows[0].status !== "encerrada") {
    return res.status(409).json({ erro: "sessao_nao_pode_ser_retomada" });
  }

  await pool.query("UPDATE sessoes SET status = 'active', encerrado_em = NULL WHERE id = $1", [id]);
  res.status(200).json({ status: "active" });
});

// GET /api/sessions/:id
router.get("/sessions/:id", async (req, res) => {
  const { id } = req.params;

  const { rows: sessaoRows } = await pool.query(
    `SELECT s.id, s.status, s.tipo_sessao, s.criado_em, s.encerrado_em,
            COALESCE(c.dominio, tr.dominio) AS dominio, c.modo, t.nome AS topico_nome, t.id AS topico_id
     FROM sessoes s
     LEFT JOIN cenarios c ON c.id = s.cenario_id
     LEFT JOIN topicos t ON t.id = s.topico_id
     LEFT JOIN trilhas tr ON tr.id = t.trilha_id
     WHERE s.id = $1`,
    [id],
  );
  if (sessaoRows.length === 0) return res.status(404).json({ erro: "sessao_nao_encontrada" });

  const { rows: mensagens } = await pool.query(
    "SELECT role, conteudo, criado_em FROM mensagens WHERE sessao_id = $1 ORDER BY criado_em",
    [id],
  );
  const { rows: avaliacaoRows } = await pool.query(
    "SELECT conteudo FROM avaliacoes WHERE sessao_id = $1",
    [id],
  );

  res.status(200).json({
    sessao: sessaoRows[0],
    mensagens,
    avaliacao: avaliacaoRows[0]?.conteudo ?? null,
  });
});

// GET /api/users/:id/sessions
router.get("/users/:id/sessions", async (req, res) => {
  const { id } = req.params;

  const { rows: usuarioRows } = await pool.query("SELECT id FROM usuarios WHERE id = $1", [id]);
  if (usuarioRows.length === 0) return res.status(404).json({ erro: "usuario_nao_encontrado" });

  const { rows } = await pool.query(
    `SELECT s.id, COALESCE(c.dominio, tr.dominio) AS dominio, c.modo, s.tipo_sessao AS "tipoSessao",
            t.nome AS "topicoNome", s.status, s.criado_em AS "criadoEm"
     FROM sessoes s
     LEFT JOIN cenarios c ON c.id = s.cenario_id
     LEFT JOIN topicos t ON t.id = s.topico_id
     LEFT JOIN trilhas tr ON tr.id = t.trilha_id
     WHERE s.usuario_id = $1
     ORDER BY s.criado_em DESC`,
    [id],
  );

  res.status(200).json({ sessoes: rows });
});
