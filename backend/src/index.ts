// Precisa vir antes das rotas: faz o Express 4 encaminhar erros de handlers async
// para o middleware de erro no fim do arquivo. Sem isso, um erro de banco em qualquer
// rota vira unhandledRejection e o Node derruba o processo inteiro.
import "express-async-errors";
import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import { chaveAnthropicOk, verificarChaveAnthropic } from "./agent/health.js";
import { router as sessionsRouter } from "./routes/sessions.js";
import { router as trilhasRouter } from "./routes/trilhas.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
  } catch {
    return res.status(503).json({ status: "error", db: "error" });
  }

  if (!chaveAnthropicOk()) {
    return res.status(503).json({ status: "error", db: "ok", erro: "chave_anthropic_ausente" });
  }

  res.status(200).json({ status: "ok", db: "ok" });
});

app.use("/api", sessionsRouter);
app.use("/api", trilhasRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[erro]", err);
  res.status(500).json({ erro: "erro_interno" });
});

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`[backend] ouvindo na porta ${PORT}`);
});

verificarChaveAnthropic();
