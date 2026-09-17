# SeniorLab

Simulador de mentoria técnica (incidente em produção, code review sênior,
decisão de arquitetura) usando a Claude API. Ver `docs/0001-plano-mvp-seniorlab.md`
para o plano completo.

## Setup

```bash
cp .env.example .env
# preencher ANTHROPIC_API_KEY no .env

docker compose up -d

docker compose ps
# espera-se: postgres, backend e frontend "healthy"/"Up"

curl -s localhost:3000/health
# {"status":"ok","db":"ok"}
```

Abra `http://localhost:5173`.

## Smoke test completo

Ver seção 5.9 do plano (`docs/0001-plano-mvp-seniorlab.md`).
