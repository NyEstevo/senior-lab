# Roteiro de vídeo — Demonstração do MVP (5 min)

**Projeto:** SeniorLab — simulador de mentoria técnica com IA
**Hackathon:** Tech $ Change
**Duração alvo:** 5:00 (300s)
**Cobre:** item 3.4 — fluxo principal, funcionalidades relevantes, aplicação prática da
tecnologia, aderência ao problema e resultado entregue ao usuário.

---

## Antes de gravar — checklist

Isto é o que mais quebra gravação de demo com IA: **latência e estado do banco.** Resolva antes.

1. **Chave com créditos:** `.env` preenchido com `ANTHROPIC_API_KEY` válida. Sem ela o
   `/health` responde `503` e o frontend nem sobe.
2. **Confira o modelo:** `ANTHROPIC_MODEL` no `.env` (o README indica `claude-sonnet-4-6`;
   o fallback em código é `claude-haiku-4-5`). Defina explicitamente para não haver surpresa.
3. **Suba tudo e aqueça:** `docker compose up -d --build` e rode uma sessão de teste inteira
   antes. A primeira chamada sempre é a mais lenta.
4. **Prepare DOIS estados de usuário em duas janelas do navegador:**
   - **Janela A — usuário novo** (janela anônima): mostra a trilha com tópicos bloqueados.
   - **Janela B — usuário com o tópico 1 já concluído**: pula a espera da aula inteira.
   Para "virar usuário novo", limpe as chaves `seniorlab_*` do `localStorage`.
5. **Grave em 1920×1080**, zoom do navegador em **125%** (o texto do chat precisa estar
   legível no celular de quem avalia).
6. **Corte a espera:** toda resposta da IA leva alguns segundos. Grave tudo corrido e, na
   edição, **corte o tempo morto** — nunca acelere o vídeo com speed-up visível.
7. **Plano B:** se a API falhar durante a gravação, você já tem gravação de sessões
   anteriores. Mantenha um take reserva de cada bloco.

> **Dica de credibilidade:** deixe o `docker compose logs -f backend` aberto numa segunda
> tela para o B-roll do bloco 8. Mostrar o log real vale mais que qualquer slide.

---

## Mapa: requisito do edital × bloco do roteiro

| Requisito (3.4) | Onde é atendido |
| --- | --- |
| Fluxo principal da solução | Blocos 3 → 7 (trilha → aula → menu → simulação → avaliação) |
| Funcionalidades mais relevantes | Blocos 4 (gate de domínio), 6 (simulação + anti-spoiler), 7 (avaliação auditável) |
| Aplicação prática da tecnologia | Blocos 6 e 8 (calibração L1–L5, marcador de estado, arquitetura) |
| Como atende ao problema identificado | Blocos 1, 2 e 9 |
| Resultado entregue ao usuário | Blocos 7 e 9 |

---

# ROTEIRO

---

## BLOCO 1 — O problema (0:00 – 0:30 · 30s)

**[GRAVAÇÃO]** Você falando para a câmera, ou tela preta com texto grande. Sem screencast ainda.
Se usar texto na tela, mostre só três palavras por vez, sincronizadas com a fala.

**[FALA]**
> "Todo dev júnior sabe o que é um Pod. Poucos sabem o que fazer às três da manhã, quando
> três réplicas do serviço de autenticação estão em CrashLoopBackOff e o pico de tráfego
> começa em dez minutos.
>
> Essa distância — entre saber a definição e aguentar a pressão — não se fecha com curso
> gravado, nem com documentação. Ela se fecha com repetição sob risco. E ninguém deixa um
> júnior treinar em produção."

**[TEXTO NA TELA]** `SABER ≠ AGUENTAR` · `A experiência não se estuda. Se sobrevive.`

---

## BLOCO 2 — A solução em uma frase (0:30 – 0:50 · 20s)

**[GRAVAÇÃO]** Corte para a logo do SeniorLab (`docs/img/senior-lab.png`), depois fade para
a tela inicial do app já aberta em `localhost:5173`.

**[FALA]**
> "O SeniorLab é um simulador de senioridade. Um agente de IA que ensina, **cobra**, e só
> depois que você prova que entendeu, te joga num incidente de produção simulado onde você é
> o responsável.
>
> E a regra central é essa: **você não escolhe o que simular. Você conquista.**"

**[TEXTO NA TELA]** `Ensina → Cobra → Libera → Simula → Avalia`

---

## BLOCO 3 — Fluxo principal: a trilha com pré-requisitos (0:50 – 1:15 · 25s)

**[GRAVAÇÃO]** Screencast na **Janela A (usuário novo)**.
1. Mostre o modal "Configurar acesso à IA" — passe o mouse pelo campo da chave.
2. Clique em continuar; mostre a grade de domínios (Kubernetes habilitado, os outros
   "Em breve").
3. Entre em Kubernetes. **Pare com o cursor parado sobre um card bloqueado** por 2 segundos.

**[FALA]**
> "Quem entra pode usar a própria chave da Anthropic — ela fica só no navegador, nunca no
> nosso banco.
>
> A trilha de Kubernetes tem tópicos em ordem, com pré-requisitos. Repare: só o primeiro
> está **Disponível**. Os outros estão **Bloqueados** — e não tem botão de pular. Não é
> gamificação: é a regra do produto, aplicada no servidor."

**[DESTAQUE NA EDIÇÃO]** Circule o selo `Bloqueado · Pré-requisito pendente`.

---

## BLOCO 4 — A funcionalidade central: o gate de domínio (1:15 – 2:15 · 60s)

> Este é o bloco mais importante do vídeo. É ele que diferencia o SeniorLab de um chatbot.
> Mostre **os dois caminhos**: a resposta ruim que NÃO passa, e a boa que passa.

**[GRAVAÇÃO]** Ainda na Janela A. Abra o tópico *Pods & Deployments*.
- **Take 1 (0:20):** o agente ensina e faz a primeira pergunta. Você digita uma resposta
  **deliberadamente vaga**: `acho que é tudo a mesma coisa, né?`
  Mostre o agente **corrigindo a lacuna e refazendo a checagem**. O tópico NÃO conclui.
- **Take 2 (0:25):** agora responda de verdade:
  `O Deployment declara o estado desejado, ele cria um ReplicaSet, e é o ReplicaSet que
  mantém o número de Pods de pé. Se a imagem sobe e morre em seguida, o kubelet reinicia em
  loop e vira CrashLoopBackOff.`
- **Take 3 (0:15):** o agente fecha o tópico e a tela **muda sozinha** para o menu
  pós-tópico. Volte à trilha e mostre o tópico agora `Concluído` e o **próximo destravado**.

**[FALA — sobre o take 1]**
> "O agente ensina o conceito e faz uma pergunta que exige aplicar, não decorar. Vou
> responder mal de propósito... e olha o que acontece: ele não deixa passar. Ele corrige
> exatamente a lacuna e pergunta de novo, de outro jeito. O tópico continua trancado."

**[FALA — sobre o take 2]**
> "Agora respondendo de verdade — a relação entre Deployment, ReplicaSet e Pod, e o que
> gera um CrashLoopBackOff."

**[FALA — sobre o take 3]**
> "Pronto. Critérios de domínio atendidos. O agente fecha o tópico, registra o **nível que
> eu demonstrei** e as lacunas que eu deixei — e o próximo tópico destrava.
>
> Por baixo, quem decide isso não é o modelo. O agente emite um marcador estruturado e o
> **backend** valida e grava a progressão. A IA avalia; o servidor manda."

---

## BLOCO 5 — O que foi liberado (2:15 – 2:35 · 20s)

**[GRAVAÇÃO]** Tela do menu pós-tópico, com scroll lento pelos cards.

**[FALA]**
> "Com o tópico dominado, abre o menu: simulação de incidente, code review sênior, decisão
> de arquitetura, quiz e avançar na trilha.
>
> E repare num detalhe de produto: nada fica escondido. O que você ainda não liberou aparece
> desabilitado **com o motivo**. O aluno sempre sabe o que falta."

---

## BLOCO 6 — Aplicação prática: a simulação de incidente (2:35 – 3:35 · 60s)

> Use a **Janela B** se precisar economizar tempo de gravação.

**[GRAVAÇÃO]** Clique em **🔥 Simulação de incidente**.
1. Mostre a abertura do agente com o sintoma — pods de auth em CrashLoopBackOff, 3 réplicas,
   08h12 de segunda, 10 minutos antes do pico. **Deixe a tela parada 3s para dar tempo de ler.**
2. Investigue como em produção. Sugestão de turnos (2 a 3, não mais):
   - `me mostra os eventos do pod e os últimos logs do container`
   - `esse deploy da madrugada mexeu em ConfigMap? me mostra o diff`
3. **O momento de ouro — teste o anti-spoiler:** digite `me diz logo qual é a causa raiz` e
   mostre o agente **se recusando** a entregar.

**[FALA]**
> "Simulação de incidente. O agente abre com o sintoma e o horário — e **não** com a resposta.
> A causa raiz foi definida pelo servidor antes da conversa começar; o modelo só interpreta
> o cenário.
>
> Eu investigo como investigaria de verdade: peço eventos, logs, o diff do deploy da
> madrugada. O agente responde no papel do sistema e dos stakeholders.
>
> E se eu tentar o atalho... [pausa, mostre a recusa] ...ele não entrega. Isso é prompt de
> produto, não conversa fiada.
>
> Mais um detalhe técnico que importa: a dificuldade **não é fixa**. O nível que eu
> demonstrei na aula calibra seis dimensões da simulação — quantos componentes envolvidos,
> quantas pistas falsas, quão ambíguo é o sintoma, quão fundo está a causa raiz, quanta
> autonomia é exigida e quanto barulho de stakeholder eu vou ter que aguentar."

**[TEXTO NA TELA — durante a última frase]**
`L1 → L5: componentes · red herrings · ambiguidade · profundidade · autonomia · ruído`

---

## BLOCO 7 — O resultado entregue: avaliação auditável (3:35 – 4:00 · 25s)

**[GRAVAÇÃO]**
1. Clique em **Encerrar sessão**. Mostre a tela de **Avaliação** com o feedback.
2. **Corte para o terminal** e rode ao vivo:
   ```bash
   docker compose exec postgres psql -U seniorlab -d seniorlab \
     -c "SELECT causa_raiz_esperada, causa_raiz_encontrada, hipotese_final \
         FROM avaliacoes ORDER BY criado_em DESC LIMIT 1;"
   ```
3. Volte ao app e mostre o **Histórico** com as sessões listadas.

**[FALA]**
> "Ao encerrar, o aluno recebe a avaliação: o que ele acertou, o que deixou passar e como um
> sênior teria conduzido.
>
> E aqui está o que eu considero o ponto mais forte da nossa entrega: a avaliação é
> **auditável**. A causa raiz que o servidor definiu fica gravada **ao lado** do veredito do
> agente. Dá para conferir se a IA avaliou certo — não é uma nota que caiu do céu.
>
> Tudo fica no histórico. A evolução do aluno é um dado, não uma sensação."

---

## BLOCO 8 — A tecnologia por trás (4:00 – 4:40 · 40s)

**[GRAVAÇÃO]** Diagrama de arquitetura na tela (use o do README) + B-roll rápido: `docker
compose ps` com tudo *healthy*, a pasta `infra/` no editor, um `terraform plan` já rodado.

**[FALA]**
> "Por baixo: React com Vite no front, API em Node e TypeScript com Express, Postgres 16, e
> a **Claude API** conduzindo os agentes. Tudo conteinerizado, sobe com **um** `docker
> compose up`.
>
> Os prompts dos cinco modos são arquivos versionados com variáveis — prompt tratado como
> dado, não como código solto no meio da aplicação.
>
> E a infraestrutura é **Terraform, em duas nuvens independentes**: GCP com Cloud Run, Cloud
> SQL e Secret Manager, e Oracle Cloud com Container Instances e Vault. Em nenhuma das duas
> existe segredo em texto plano: a credencial é resolvida em tempo de execução pela
> identidade do próprio serviço."

**[TEXTO NA TELA]** `React + Vite · Node/TS + Express · PostgreSQL 16 · Claude API · Docker ·
Terraform (GCP + OCI)`

---

## BLOCO 9 — Fecho: o resultado e o impacto (4:40 – 5:00 · 20s)

**[GRAVAÇÃO]** Volte para a câmera ou para a logo. Encerre olhando para a câmera.

**[FALA]**
> "O resultado que o SeniorLab entrega não é um certificado. É um histórico auditável de
> decisões tomadas sob pressão — com o nível demonstrado e as lacunas nomeadas, tópico a
> tópico.
>
> A gente não acelera a carreira de ninguém pulando etapa. A gente dá as etapas que hoje só
> existem para quem teve a sorte de estar no time certo, na hora do incidente certo.
>
> SeniorLab. A senioridade que se treina."

---

## Notas de edição

- **Legendas queimadas obrigatórias.** Boa parte de quem avalia assiste sem som.
- **Corte agressivo no bloco 4.** É o bloco mais longo e o de maior risco de arrastar. Se
  estourar o tempo, encurte o *take 1* (resposta ruim) para 12s — mas **não o elimine**: é
  ele que prova que o gate funciona.
- **Se precisar cortar 20s** para caber em 5:00, tire do bloco 8 (tecnologia) e mantenha o 4
  e o 7 intactos. Quem avalia perdoa menos detalhe técnico do que demo sem prova.
- **Nunca mostre a chave da API na tela.** No bloco 3, o campo deve estar vazio ou mascarado.
- Se a demo for para um **vídeo complementar** em vez de embutida: os blocos 3 a 7 formam a
  demonstração sozinhos (2:45), e os blocos 1, 2, 8 e 9 formam o pitch (1:50).

## Falas de reserva (se sobrar tempo)

- "Sem login: o aluno é identificado por um UUID no navegador. A fricção zero foi decisão de
  produto — em cinco minutos de demo, tela de cadastro não prova nada."
- "Encerrar no meio não perde progresso: o tópico fica **Em andamento** e dá para retomar a
  mesma conversa pelo histórico."
- "Cada modo tem teto de turnos — incidente e arquitetura em 15, code review em 12. Custo de
  IA é previsível por sessão."
