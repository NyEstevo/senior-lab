export interface TopicoSeed {
  chave: string;
  nome: string;
  nivel: 1 | 2 | 3 | 4 | 5;
  ordem: number;
  objetivosAprendizagem: string[];
  conceitosIntroduzidos: string[];
  criteriosDominio: string[];
  preRequisitos: string[]; // chaves de outros tópicos da mesma trilha
}

export interface TrilhaSeed {
  dominio: "backend" | "kubernetes";
  nome: string;
  descricao: string;
  topicos: TopicoSeed[];
}

export const seedTrilhas: TrilhaSeed[] = [
  {
    dominio: "kubernetes",
    nome: "Kubernetes: do iniciante ao especialista",
    descricao:
      "Trilha progressiva sobre Kubernetes, do primeiro Pod até troubleshooting de control plane multi-cluster.",
    topicos: [
      {
        chave: "pods-deployments",
        nome: "Pods & Deployments",
        nivel: 1,
        ordem: 1,
        objetivosAprendizagem: [
          "Criar e inspecionar um Pod",
          "Entender o ciclo de vida de um Pod (Pending, Running, CrashLoopBackOff, etc.)",
          "Explicar a relação entre Deployment, ReplicaSet e Pod",
        ],
        conceitosIntroduzidos: ["Pod", "Deployment", "ReplicaSet"],
        criteriosDominio: [
          "Explica corretamente o papel de cada camada (Deployment → ReplicaSet → Pod)",
          "Descreve o que causa um CrashLoopBackOff em termos gerais",
        ],
        preRequisitos: [],
      },
      {
        chave: "services-networking",
        nome: "Services & Networking básico",
        nivel: 1,
        ordem: 2,
        objetivosAprendizagem: [
          "Expor um Deployment via Service",
          "Diferenciar ClusterIP, NodePort e LoadBalancer",
          "Entender DNS interno do cluster (nome.namespace.svc.cluster.local)",
        ],
        conceitosIntroduzidos: ["Service (ClusterIP/NodePort)", "DNS interno do cluster"],
        criteriosDominio: [
          "Explica quando usar ClusterIP vs. NodePort",
          "Descreve como um Pod encontra outro serviço pelo nome",
        ],
        preRequisitos: ["pods-deployments"],
      },
      {
        chave: "configmaps-secrets",
        nome: "ConfigMaps & Secrets",
        nivel: 2,
        ordem: 3,
        objetivosAprendizagem: [
          "Separar configuração de imagem usando ConfigMap",
          "Montar ConfigMap/Secret como variável de ambiente ou volume",
          "Entender por que Secret não é, por si só, criptografia forte",
        ],
        conceitosIntroduzidos: ["ConfigMap", "Secret", "volumeMounts"],
        criteriosDominio: [
          "Explica a diferença entre ConfigMap e Secret e quando usar cada um",
          "Descreve pelo menos uma forma de consumir um ConfigMap no Pod",
        ],
        preRequisitos: ["services-networking"],
      },
    ],
  },
];
