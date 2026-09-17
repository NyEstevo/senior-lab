<div align="center">
  <br/>
  <hr style="border: none; border-top: 1px solid #ED145B; width: 100%; margin: 0 auto"/>
</div>

![/.github/LOGO-FIAP.png](/.github/LOGO-FIAP.png)

# SeniorLab - Tech 4 Challenge

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
