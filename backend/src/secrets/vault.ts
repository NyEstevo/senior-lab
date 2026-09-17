import * as common from "oci-common";
import * as secrets from "oci-secrets";

// Lê os segredos do OCI Vault no boot, usando a identidade do próprio Container
// Instance (resource principal) — sem credencial estática na imagem nem valor
// sensível em variável de ambiente (ADR-OCI-05 do plano de infraestrutura).
//
// Em desenvolvimento local, nenhuma das variáveis de OCID está definida e a função
// não faz nada: o backend segue lendo DATABASE_URL/ANTHROPIC_API_KEY do .env.

async function lerSegredo(client: secrets.SecretsClient, secretId: string): Promise<string> {
  const resposta = await client.getSecretBundle({ secretId });
  const conteudo = resposta.secretBundle.secretBundleContent;

  if (!conteudo?.content) {
    throw new Error(`Secret ${secretId} veio sem conteúdo do Vault`);
  }

  return Buffer.from(conteudo.content, "base64").toString("utf8");
}

export async function carregarSegredosDoVault(): Promise<void> {
  const databaseSecretId = process.env.DATABASE_SECRET_OCID;
  const anthropicSecretId = process.env.ANTHROPIC_SECRET_OCID;

  if (!databaseSecretId && !anthropicSecretId) {
    return;
  }

  const provider = common.ResourcePrincipalAuthenticationDetailsProvider.builder();
  const client = new secrets.SecretsClient({ authenticationDetailsProvider: provider });

  if (databaseSecretId) {
    process.env.DATABASE_URL = await lerSegredo(client, databaseSecretId);
  }

  if (anthropicSecretId) {
    process.env.ANTHROPIC_API_KEY = await lerSegredo(client, anthropicSecretId);
  }

  console.log("[secrets] segredos carregados do OCI Vault");
}
