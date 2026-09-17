import { carregarSegredosDoVault } from "./secrets/vault.js";

// Ponto de entrada em produção. Carrega os segredos do Vault ANTES de importar
// qualquer módulo que leia process.env no topo — `db.ts` cria o pool do Postgres no
// momento do import, então o import precisa ser dinâmico e vir depois daqui.

await carregarSegredosDoVault();

if (process.argv[2] === "migrate") {
  await import("./migrations/run.js");
} else {
  await import("./index.js");
}
