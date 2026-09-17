import { pool } from "../db.js";
import { seedCenarios } from "./data.js";
import { seedTrilhas } from "./trilhas.js";

async function seedCenariosSeNecessario() {
  const { rows } = await pool.query("SELECT count(*)::int AS total FROM cenarios");
  if (rows[0].total > 0) {
    console.log("[seed] cenarios já populados, pulando");
    return;
  }

  for (const cenario of seedCenarios) {
    await pool.query(
      "INSERT INTO cenarios (dominio, modo, variaveis) VALUES ($1, $2, $3)",
      [cenario.dominio, cenario.modo, JSON.stringify(cenario.variaveis)],
    );
  }
  console.log(`[seed] ${seedCenarios.length} cenários inseridos`);
}

async function seedTrilhasSeNecessario() {
  const { rows } = await pool.query("SELECT count(*)::int AS total FROM trilhas");
  if (rows[0].total > 0) {
    console.log("[seed] trilhas já populadas, pulando");
    return;
  }

  for (const trilha of seedTrilhas) {
    const { rows: trilhaRows } = await pool.query(
      "INSERT INTO trilhas (dominio, nome, descricao) VALUES ($1, $2, $3) RETURNING id",
      [trilha.dominio, trilha.nome, trilha.descricao],
    );
    const trilhaId = trilhaRows[0].id;

    const idPorChave = new Map<string, string>();
    for (const topico of trilha.topicos) {
      const { rows: topicoRows } = await pool.query(
        `INSERT INTO topicos
           (trilha_id, nome, nivel, ordem, objetivos_aprendizagem, conceitos_introduzidos, criterios_dominio)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          trilhaId,
          topico.nome,
          topico.nivel,
          topico.ordem,
          JSON.stringify(topico.objetivosAprendizagem),
          JSON.stringify(topico.conceitosIntroduzidos),
          JSON.stringify(topico.criteriosDominio),
        ],
      );
      idPorChave.set(topico.chave, topicoRows[0].id);
    }

    for (const topico of trilha.topicos) {
      const topicoId = idPorChave.get(topico.chave)!;
      for (const chavePreRequisito of topico.preRequisitos) {
        const preRequisitoId = idPorChave.get(chavePreRequisito);
        if (!preRequisitoId) continue;
        await pool.query(
          "INSERT INTO topico_pre_requisitos (topico_id, pre_requisito_id) VALUES ($1, $2)",
          [topicoId, preRequisitoId],
        );
      }
    }
  }
  console.log(`[seed] ${seedTrilhas.length} trilha(s) inserida(s)`);
}

export async function runSeed() {
  await seedCenariosSeNecessario();
  await seedTrilhasSeNecessario();
}
