import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ApiError,
  criarSessao,
  encerrarSessao,
  enviarTurno,
  getConfigAgente,
  listarSessoes,
  listarTopicos,
  listarTrilhas,
  obterMenuTopico,
  obterSessao,
  retomarSessao,
  salvarConfigAgente,
  type MenuTopico,
  type SessaoResumo,
  type TipoSessao,
  type Topico,
} from "./api.js";

type Tela = "dominios" | "carregando" | "trilha" | "chat" | "menu" | "avaliacao" | "encerrado" | "historico";

interface DominioCard {
  chave: string;
  emoji: string;
  titulo: string;
  descricao: string;
  disponivel: boolean;
}

const DOMINIOS: DominioCard[] = [
  { chave: "kubernetes", emoji: "☸️", titulo: "Kubernetes", descricao: "Cluster, orquestração e infra sob pressão.", disponivel: true },
  { chave: "docker", emoji: "🐳", titulo: "Docker", descricao: "Containers, imagens e build eficiente.", disponivel: false },
  { chave: "backend", emoji: "🧩", titulo: "Backend", descricao: "Sistemas distribuídos, APIs e falhas em produção.", disponivel: false },
  { chave: "frontend", emoji: "🎨", titulo: "Frontend", descricao: "Interfaces, performance e estado no client.", disponivel: false },
  { chave: "platform-engineering", emoji: "🛠️", titulo: "Platform Engineering", descricao: "Plataformas internas, self-service e developer experience.", disponivel: false },
  { chave: "monitoramento", emoji: "📊", titulo: "Monitoramento", descricao: "Observabilidade, alertas e SLOs.", disponivel: false },
];

const MODOS_SIMULACAO = [
  { valor: "incidente", chave: "simulacao_incidente" as const, emoji: "🔥", titulo: "Simulação de incidente" },
  { valor: "code_review", chave: "simulacao_code_review" as const, emoji: "🧑‍💻", titulo: "Code review" },
  { valor: "arquitetura", chave: "simulacao_arquitetura" as const, emoji: "📐", titulo: "Decisão de arquitetura" },
];

const STATUS_LABEL: Record<string, string> = {
  bloqueado: "Bloqueado",
  disponivel: "Disponível",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function Prose({ texto }: { texto: string }) {
  const limpo = texto.replace(/\[FECHAMENTO_TOPICO[^\]]*\]/, "").trim();
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{limpo}</ReactMarkdown>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img">
        <title>Concluída</title>
        <path d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === "active") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img">
        <title>Em andamento</title>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 7.5-2" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img">
      <title>Encerrada</title>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function getUsuarioId(): string {
  const chave = "seniorlab_usuario_id";
  let id = localStorage.getItem(chave);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(chave, id);
  }
  return id;
}

const CHAVE_CONFIG_DECIDIDA = "seniorlab_config_agente_decidida";

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ModalConfigAgente({
  apiKeyInicial,
  modelInicial,
  onSalvar,
  onUsarPadrao,
  onFechar,
  permiteFechar,
}: {
  apiKeyInicial: string;
  modelInicial: string;
  onSalvar: (apiKey: string, model: string) => void;
  onUsarPadrao: (model: string) => void;
  onFechar: () => void;
  permiteFechar: boolean;
}) {
  const [apiKey, setApiKey] = useState(apiKeyInicial);
  const [model, setModel] = useState(modelInicial);

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2 className="screen-title">Configurar acesso à IA</h2>
        <p className="screen-subtitle">
          Informe sua própria chave da API Anthropic e o modelo que quer usar para
          consumir seus próprios créditos. Se deixar em branco, o SeniorLab usa a chave e
          o modelo padrão já configurados no servidor.
        </p>
        <div className="field">
          <label htmlFor="config-api-key">Chave da API Anthropic (opcional)</label>
          <input
            id="config-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
        <div className="field">
          <label htmlFor="config-model">Modelo (opcional)</label>
          <input
            id="config-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ex.: claude-sonnet-4-6"
          />
        </div>
        {!apiKey.trim() && (
          <p className="erro-banner">
            Sem uma chave própria, esta sessão usa a chave e os créditos padrão do
            servidor. O uso da API Anthropic gera custos e os créditos são limitados —
            se esgotarem, a ferramenta pode parar de responder até serem repostos.
          </p>
        )}
        <div className="toolbar toolbar-actions">
          <button onClick={() => onSalvar(apiKey.trim(), model.trim())}>Salvar</button>
          <button className="secondary" onClick={() => onUsarPadrao(model.trim())}>
            Continuar sem chave própria
          </button>
          {permiteFechar && (
            <button className="secondary" onClick={onFechar}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [usuarioId] = useState(getUsuarioId);
  const [tela, setTela] = useState<Tela>("dominios");
  const [trilhaId, setTrilhaId] = useState<string | null>(null);
  const [trilhaNome, setTrilhaNome] = useState("");
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [topicoAtual, setTopicoAtual] = useState<Topico | null>(null);
  const [tipoSessaoAtual, setTipoSessaoAtual] = useState<TipoSessao>("aula");
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<ChatMsg[]>([]);
  const [entrada, setEntrada] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avaliacaoTexto, setAvaliacaoTexto] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTopico | null>(null);
  const [sessoes, setSessoes] = useState<SessaoResumo[]>([]);
  const [limiteAtingido, setLimiteAtingido] = useState(false);
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [configAgente, setConfigAgente] = useState(getConfigAgente);
  const [modalConfigAberto, setModalConfigAberto] = useState(
    () => !localStorage.getItem(CHAVE_CONFIG_DECIDIDA),
  );
  const [avisoCustoVisivel, setAvisoCustoVisivel] = useState(() => !getConfigAgente().apiKey);

  function confirmarConfigAgente(apiKey: string, model: string) {
    salvarConfigAgente({ apiKey, model });
    localStorage.setItem(CHAVE_CONFIG_DECIDIDA, "1");
    setConfigAgente({ apiKey, model });
    setAvisoCustoVisivel(!apiKey);
    setModalConfigAberto(false);
  }

  function usarConfigPadrao(model: string) {
    confirmarConfigAgente("", model);
  }

  function mensagemErro(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 0) return "Sem conexão com o backend. Verifique se os containers estão de pé.";
      if (err.erro === "pre_requisito_faltante") return "Esse tópico ainda tem pré-requisito pendente.";
      if (err.erro === "topico_nao_concluido") return "Conclua o tópico (aula) antes de tentar esse modo.";
      return `Erro (${err.status}): ${err.erro}`;
    }
    return "Erro inesperado.";
  }

  async function abrirDominio(dominio: DominioCard) {
    if (!dominio.disponivel) return;
    setErro(null);
    setTela("carregando");
    try {
      const { trilhas } = await listarTrilhas();
      const trilha = trilhas.find((t) => t.dominio === dominio.chave);
      if (!trilha) {
        setErro("Nenhuma trilha cadastrada ainda para esse domínio.");
        setTela("dominios");
        return;
      }
      setTrilhaId(trilha.id);
      setTrilhaNome(trilha.nome);
      const { topicos: lista } = await listarTopicos(trilha.id, usuarioId);
      setTopicos(lista);
      setTela("trilha");
    } catch (err) {
      setErro(mensagemErro(err));
      setTela("dominios");
    }
  }

  async function iniciarSessao(topico: Topico, tipoSessao: TipoSessao, modo?: string) {
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await criarSessao({ usuarioId, tipoSessao, topicoId: topico.id, modo });
      setSessaoId(resposta.sessaoId);
      setTopicoAtual(topico);
      setTipoSessaoAtual(tipoSessao);
      setMensagens([{ role: "assistant", content: resposta.mensagemInicial }]);
      setLimiteAtingido(false);
      setSomenteLeitura(false);
      setTela("chat");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  async function enviar() {
    if (!sessaoId || !entrada.trim()) return;
    setErro(null);
    setCarregando(true);
    const texto = entrada;
    setEntrada("");
    setMensagens((m) => [...m, { role: "user", content: texto }]);
    try {
      const resposta = await enviarTurno(sessaoId, texto);
      setMensagens((m) => [...m, { role: "assistant", content: resposta.conteudo }]);
      if (resposta.turnoLimiteAtingido) setLimiteAtingido(true);

      if (resposta.fechamentoTopico?.concluido && topicoAtual && trilhaId) {
        const { topicos: lista } = await listarTopicos(trilhaId, usuarioId);
        setTopicos(lista);
        const atualizado = lista.find((t) => t.id === topicoAtual.id) ?? topicoAtual;
        await abrirMenu(atualizado);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setLimiteAtingido(true);
        setErro("Teto de turnos atingido. Encerre a sessão para continuar.");
      } else {
        setErro(mensagemErro(err));
      }
    } finally {
      setCarregando(false);
    }
  }

  async function abrirMenu(topico: Topico) {
    setErro(null);
    try {
      const menuResposta = await obterMenuTopico(topico.id, usuarioId);
      setMenu(menuResposta);
      setTopicoAtual(topico);
      setTela("menu");
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function encerrar() {
    if (!sessaoId) return;
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await encerrarSessao(sessaoId);

      if (tipoSessaoAtual === "aula") {
        // "Encerrar" é decisão do aluno — vira uma escrita direta no banco,
        // sem passar pelo agente. A conclusão (critério do agente) só
        // acontece durante a conversa normal (ver enviar()); se chegou até
        // aqui é porque o aluno saiu antes disso, então nunca fica "concluído".
        setAvaliacaoTexto(null);
        setTela("encerrado");
      } else {
        setAvaliacaoTexto(resposta.avaliacao ?? null);
        setTela("avaliacao");
      }
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  async function avancarProximoTopico() {
    if (!menu?.modos.avancar.proximoTopicoId || !trilhaId) return voltarTrilha();
    setErro(null);
    try {
      const { topicos: lista } = await listarTopicos(trilhaId, usuarioId);
      setTopicos(lista);
      const proximo = lista.find((t) => t.id === menu.modos.avancar.proximoTopicoId);
      setTela("trilha");
      if (proximo) setTopicoAtual(proximo);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function voltarTrilha() {
    setErro(null);
    if (!trilhaId) {
      setTela("dominios");
      return;
    }
    try {
      const { topicos: lista } = await listarTopicos(trilhaId, usuarioId);
      setTopicos(lista);
      setTela("trilha");
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  function voltarDominios() {
    setErro(null);
    setTela("dominios");
  }

  async function abrirHistorico() {
    setErro(null);
    setTela("historico");
    try {
      const resposta = await listarSessoes(usuarioId);
      setSessoes(resposta.sessoes);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function abrirSessao(id: string) {
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await obterSessao(id);
      const { sessao, mensagens: historico, avaliacao: avaliacaoSalva } = resposta;

      let msgs: ChatMsg[] = historico
        .filter((m) => !(m.role === "user" && m.conteudo.startsWith("[sistema]")))
        .map((m) => ({ role: m.role, content: m.conteudo }));
      if (avaliacaoSalva && msgs.length > 0 && msgs[msgs.length - 1].content === avaliacaoSalva) {
        msgs = msgs.slice(0, -1);
      }

      setSessaoId(sessao.id);
      setTipoSessaoAtual(sessao.tipo_sessao);
      setMensagens(msgs);
      setAvaliacaoTexto(avaliacaoSalva);
      setLimiteAtingido(false);
      setSomenteLeitura(sessao.status !== "active");
      setTela(avaliacaoSalva ? "avaliacao" : "chat");
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  async function retomar(id: string) {
    setErro(null);
    setCarregando(true);
    try {
      await retomarSessao(id);
      await abrirSessao(id);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div>
      {modalConfigAberto && (
        <ModalConfigAgente
          apiKeyInicial={configAgente.apiKey}
          modelInicial={configAgente.model}
          onSalvar={confirmarConfigAgente}
          onUsarPadrao={usarConfigPadrao}
          onFechar={() => setModalConfigAberto(false)}
          permiteFechar={!!localStorage.getItem(CHAVE_CONFIG_DECIDIDA)}
        />
      )}

      <header className="app-header">
        <h1>Senior<span style={{ color: "var(--accent)" }}>Lab</span></h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="icon-btn"
            title="Configurar chave/modelo da IA"
            aria-label="Configurar chave e modelo da IA"
            onClick={() => setModalConfigAberto(true)}
          >
            <GearIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled
            title="Login — em breve"
            aria-label="Login (em breve)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
          </button>
        </div>
      </header>

      {avisoCustoVisivel && !modalConfigAberto && (
        <div className="erro-banner">
          Você está usando a chave e os créditos padrão do servidor. O uso da API
          Anthropic gera custos e os créditos são limitados — se esgotarem, a ferramenta
          pode parar de responder.{" "}
          <button
            type="button"
            className="secondary"
            style={{ marginLeft: 8 }}
            onClick={() => setModalConfigAberto(true)}
          >
            Configurar minha chave
          </button>{" "}
          <button
            type="button"
            className="secondary"
            style={{ marginLeft: 4 }}
            onClick={() => setAvisoCustoVisivel(false)}
          >
            Dispensar
          </button>
        </div>
      )}

      {erro && <div className="erro-banner">{erro}</div>}

      {tela !== "dominios" && tela !== "carregando" && (
        <div className="toolbar">
          <button className="secondary" onClick={voltarDominios}>🏠 Domínios</button>
          {tela !== "trilha" && (
            <button className="secondary" onClick={voltarTrilha}>Voltar à trilha</button>
          )}
          <button className="secondary" onClick={abrirHistorico}>Histórico</button>
        </div>
      )}

      {tela === "carregando" && <p>Carregando trilha...</p>}

      {tela === "dominios" && (
        <div className="screen">
          <h2 className="screen-title">Escolha uma trilha</h2>
          <p className="screen-subtitle">
            Kubernetes já está pronta para a demonstração. As demais trilhas chegam em seguida.
          </p>
          <div className="option-grid option-grid-2">
            {DOMINIOS.map((d) => (
              <button
                key={d.chave}
                type="button"
                className={`option-card ${d.disponivel ? "selected" : ""}`}
                disabled={!d.disponivel}
                onClick={() => abrirDominio(d)}
              >
                <span className="option-card-title">
                  <span className="option-card-icon">{d.emoji}</span> {d.titulo}
                </span>
                <span className="option-card-desc">{d.descricao}</span>
                {!d.disponivel && <span className="option-card-desc">Em breve</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {tela === "trilha" && (
        <div className="screen">
          <h2 className="screen-title">{trilhaNome}</h2>
          <p className="screen-subtitle">Conclua um tópico para liberar o próximo e desbloquear os modos de simulação.</p>
          <div className="option-grid option-grid-2">
            {topicos.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`option-card ${t.status === "bloqueado" ? "" : "selected"}`}
                disabled={t.status === "bloqueado" || carregando}
                onClick={() => (t.status === "concluido" ? abrirMenu(t) : iniciarSessao(t, "aula"))}
              >
                <span className="option-card-title">
                  L{t.nivel} · {t.nome}
                </span>
                <span className="option-card-desc">{STATUS_LABEL[t.status]}</span>
                {t.status === "bloqueado" && (
                  <span className="option-card-desc">Pré-requisito pendente</span>
                )}
              </button>
            ))}
          </div>
          <button className="secondary" onClick={abrirHistorico}>Ver histórico</button>
        </div>
      )}

      {tela === "chat" && (
        <div className="screen">
          <h2 className="screen-title">{topicoAtual?.nome}</h2>
          <div className="chat">
            {mensagens.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === "assistant" ? <Prose texto={m.content} /> : m.content}
              </div>
            ))}
            {carregando && <div className="msg assistant">…</div>}
          </div>
          {somenteLeitura ? (
            <p className="screen-subtitle">Esta sessão já foi encerrada — modo somente leitura.</p>
          ) : (
            <>
              {limiteAtingido && (
                <div className="erro-banner">Teto de turnos atingido. Encerre a sessão para continuar.</div>
              )}
              <div className="chat-input">
                <textarea
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  placeholder="Digite sua mensagem..."
                  disabled={carregando || limiteAtingido}
                />
                <button onClick={enviar} disabled={carregando || limiteAtingido || !entrada.trim()}>
                  Enviar
                </button>
              </div>
              <div className="toolbar toolbar-actions">
                <button onClick={encerrar} disabled={carregando}>Encerrar sessão</button>
              </div>
            </>
          )}
        </div>
      )}

      {tela === "menu" && menu && topicoAtual && (
        <div className="screen">
          <h2 className="screen-title">Tópico concluído: {topicoAtual.nome}</h2>
          <p className="screen-subtitle">O que você quer fazer agora?</p>

          <div className="menu-group">
            <p className="menu-group-label">Praticar em simulação</p>
            <div className="option-grid option-grid-2">
              {MODOS_SIMULACAO.map((m) => {
                const opcao = menu.modos[m.chave];
                return (
                  <button
                    key={m.valor}
                    type="button"
                    className="option-card"
                    disabled={!opcao.disponivel || carregando}
                    onClick={() => iniciarSessao(topicoAtual, "simulacao", m.valor)}
                  >
                    <span className="option-card-title">{m.emoji} {m.titulo}</span>
                    {!opcao.disponivel && <span className="option-card-desc">{opcao.motivo}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="menu-group">
            <p className="menu-group-label">Outras opções</p>
            <div className="option-grid option-grid-2">
              <button
                type="button"
                className="option-card"
                disabled={!menu.modos.revisao.disponivel || carregando}
                onClick={() => iniciarSessao(topicoAtual, "revisao")}
              >
                <span className="option-card-title">📝 Quiz / revisão rápida</span>
              </button>
              <button
                type="button"
                className="option-card"
                disabled={carregando}
                onClick={() => iniciarSessao(topicoAtual, "aula")}
              >
                <span className="option-card-title">🔎 Aprofundar no tópico atual</span>
              </button>
              <button
                type="button"
                className="option-card"
                disabled={!menu.modos.avancar.disponivel || carregando}
                onClick={avancarProximoTopico}
              >
                <span className="option-card-title">➡️ Avançar para o próximo tópico</span>
                {!menu.modos.avancar.disponivel && (
                  <span className="option-card-desc">{menu.modos.avancar.motivo}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {tela === "avaliacao" && avaliacaoTexto && (
        <div className="screen">
          <h2 className="screen-title">Avaliação</h2>
          <div className="avaliacao">
            <Prose texto={avaliacaoTexto} />
          </div>
          <div className="toolbar toolbar-actions">
            <button onClick={() => (topicoAtual ? abrirMenu(topicoAtual) : voltarTrilha())}>
              Voltar ao menu do tópico
            </button>
          </div>
        </div>
      )}

      {tela === "encerrado" && (
        <div className="screen">
          <h2 className="screen-title">Sessão encerrada</h2>
          <p className="screen-subtitle">
            Você encerrou antes de concluir "{topicoAtual?.nome}" — o tópico continua em andamento,
            sem perda de progresso. Pode retomar quando quiser.
          </p>
          {avaliacaoTexto && (
            <div className="avaliacao">
              <Prose texto={avaliacaoTexto} />
            </div>
          )}
          <div className="toolbar toolbar-actions">
            <button onClick={() => topicoAtual && iniciarSessao(topicoAtual, "aula")} disabled={carregando}>
              🔁 Retomar tópico
            </button>
            <button className="secondary" onClick={voltarTrilha}>Voltar à trilha</button>
          </div>
        </div>
      )}

      {tela === "historico" && (
        <div className="screen">
          <h2 className="screen-title">Trilha de evolução</h2>
          {sessoes.length === 0 && <p className="screen-subtitle">Nenhuma sessão ainda.</p>}
          <div className="sessao-lista">
            {sessoes.map((s) => (
              <div key={s.id} className="sessao-item">
                <button
                  type="button"
                  className="sessao-item-main"
                  onClick={() => abrirSessao(s.id)}
                  disabled={carregando}
                >
                  {s.topicoNome ?? s.dominio} · {s.modo ?? s.tipoSessao}
                </button>
                <div className="sessao-item-status">
                  <StatusIcon status={s.status} />
                  {s.status === "encerrada" && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      title="Retomar sessão"
                      aria-label="Retomar sessão"
                      onClick={() => retomar(s.id)}
                      disabled={carregando}
                    >
                      <ReloadIcon />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button className="secondary" onClick={voltarTrilha}>Voltar</button>
        </div>
      )}
    </div>
  );
}
