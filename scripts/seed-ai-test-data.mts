import fs from "node:fs";
import path from "node:path";

type MentionDefinition = {
  typeId: string;
  typeLabel: string;
  color: string;
  name: string;
};

type ParagraphPart = string | MentionDefinition;

type SeedNote = {
  title: string;
  paragraphs: ParagraphPart[][];
};

const projectDirectory = process.cwd();
const dataDirectory = path.resolve(
  process.env.STAFF_CHIEF_AI_TEST_DATA_DIR ?? path.join(projectDirectory, ".local-data", "ai-test"),
);
const databasePath = path.join(dataDirectory, "staff-chief.db");

if (fs.existsSync(databasePath)) {
  throw new Error(
    `The isolated AI test database already exists at ${databasePath}. Move or remove that test directory before generating a fresh dataset.`,
  );
}

fs.mkdirSync(dataDirectory, { recursive: true });
process.env.STAFF_CHIEF_DATA_DIR = dataDirectory;

const repository = await import("../src/lib/db/repository");
const { getDatabase } = await import("../src/lib/db/client");

const customTypeIds = {
  supplier: repository.createObjectType({ name: "Fornecedor", icon: "▣", color: "#607D8B" }),
  decision: repository.createObjectType({ name: "Decisão", icon: "✓", color: "#B56A45" }),
  metric: repository.createObjectType({ name: "Métrica", icon: "↗", color: "#397A8C" }),
  client: repository.createObjectType({ name: "Cliente", icon: "◉", color: "#9A5D8F" }),
  location: repository.createObjectType({ name: "Local", icon: "⌖", color: "#4E8172" }),
};

const mentionDefinitions = {
  atlas: mention("type-project", "Projeto", "#D89B45", "Projeto Atlas"),
  ana: mention("type-person", "Pessoa", "#45A886", "Ana Costa"),
  bruno: mention("type-person", "Pessoa", "#45A886", "Bruno Lima"),
  cloudBridge: mention(customTypeIds.supplier, "Fornecedor", "#607D8B", "CloudBridge"),
  atlasLaunch: mention(customTypeIds.decision, "Decisão", "#B56A45", "Go-live em 15 de outubro"),
  atlasQuality: mention(customTypeIds.metric, "Métrica", "#397A8C", "Qualidade dos dados: 62%"),
  atlasPilot: mention("type-idea", "Ideia", "#8A73D6", "Piloto gradual"),

  horizon: mention("type-project", "Projeto", "#D89B45", "Projeto Horizonte"),
  marina: mention("type-person", "Pessoa", "#45A886", "Marina Alves"),
  rafael: mention("type-person", "Pessoa", "#45A886", "Rafael Souza"),
  recife: mention(customTypeIds.location, "Local", "#4E8172", "Recife"),
  responseTime: mention(customTypeIds.metric, "Métrica", "#397A8C", "Tempo de primeira resposta: 14h"),
  sixAnalysts: mention(customTypeIds.decision, "Decisão", "#B56A45", "Contratar seis analistas"),
  temporaryRotation: mention("type-idea", "Ideia", "#8A73D6", "Rotação interna temporária"),

  enterprise: mention("type-project", "Projeto", "#D89B45", "Projeto Enterprise"),
  camila: mention("type-person", "Pessoa", "#45A886", "Camila Rocha"),
  diego: mention("type-person", "Pessoa", "#45A886", "Diego Martins"),
  northstar: mention(customTypeIds.client, "Cliente", "#9A5D8F", "Northstar Labs"),
  enterprisePrice: mention(customTypeIds.decision, "Decisão", "#B56A45", "Preço de R$ 99 por usuário"),
  enterpriseMargin: mention(customTypeIds.metric, "Métrica", "#397A8C", "Margem bruta: 68%"),
  usageOnboarding: mention("type-idea", "Ideia", "#8A73D6", "Onboarding orientado por uso"),

  aurora: mention("type-project", "Projeto", "#D89B45", "Projeto Aurora"),
  laura: mention("type-person", "Pessoa", "#45A886", "Laura Mendes"),
  auroraSla: mention(customTypeIds.metric, "Métrica", "#397A8C", "SLA semanal: 98%"),
  weeklyReview: mention(customTypeIds.decision, "Decisão", "#B56A45", "Revisão toda segunda-feira"),
};

const testNotes: SeedNote[] = [
  {
    title: "[TESTE IA · ATLAS] Escopo, responsáveis e meta",
    paragraphs: [
      [mentionDefinitions.atlas, " deve entrar em produção em 15 de outubro de 2026, conforme ", mentionDefinitions.atlasLaunch, "."],
      [mentionDefinitions.ana, " responde pela migração dos dados. O orçamento aprovado é de R$ 180 mil e a meta de sucesso é atingir 80% de adoção em 30 dias."],
    ],
  },
  {
    title: "[TESTE IA · ATLAS] Dependência do fornecedor",
    paragraphs: [
      [mentionDefinitions.atlas, " depende da API da ", mentionDefinitions.cloudBridge, ". O contrato ainda não estava assinado em 18 de setembro de 2026."],
      [mentionDefinitions.bruno, " registrou que a credencial precisa chegar até 25 de setembro e que a importação completa está marcada para 30 de setembro."],
      ["O fornecedor informou que precisa de três semanas após a assinatura para liberar a integração. Não há plano alternativo documentado."],
    ],
  },
  {
    title: "[TESTE IA · ATLAS] Data comunicada para vendas",
    paragraphs: [
      [mentionDefinitions.bruno, " prometeu à equipe comercial que ", mentionDefinitions.atlas, " estará disponível em 1º de outubro de 2026."],
      ["A ata do comitê mantém ", mentionDefinitions.atlasLaunch, ". Ninguém foi designado para reconciliar as duas datas ou corrigir a comunicação."],
    ],
  },
  {
    title: "[TESTE IA · ATLAS] Qualidade da migração",
    paragraphs: [
      ["A amostra mais recente de ", mentionDefinitions.atlas, " indica ", mentionDefinitions.atlasQuality, "; o mínimo de aceite é 90%."],
      ["A limpeza deveria terminar em 5 de outubro de 2026. ", mentionDefinitions.ana, " informou que ainda não há responsável operacional nem capacidade reservada para executar o trabalho."],
    ],
  },
  {
    title: "[TESTE IA · ATLAS] Alternativa de piloto",
    paragraphs: [
      [mentionDefinitions.ana, " propôs um ", mentionDefinitions.atlasPilot, " de ", mentionDefinitions.atlas, " com dez agentes em 22 de setembro de 2026."],
      ["O piloto pode antecipar falhas e reduzir o risco do go-live, mas a aprovação de segurança e a agenda dos participantes continuam pendentes."],
      ["Follow-up: Ana deve confirmar segurança, participantes e critério de sucesso até sexta-feira, 11 de setembro de 2026."],
    ],
  },

  {
    title: "[TESTE IA · HORIZONTE] Plano de capacidade aprovado",
    paragraphs: [
      [mentionDefinitions.horizon, " prevê ", mentionDefinitions.sixAnalysts, " até 1º de novembro de 2026, sob responsabilidade de ", mentionDefinitions.marina, "."],
      ["O orçamento registrado é de R$ 480 mil. A meta é reduzir o tempo de primeira resposta para quatro horas."],
    ],
  },
  {
    title: "[TESTE IA · HORIZONTE] Restrição atualizada por Finanças",
    paragraphs: [
      ["Finanças informou que ", mentionDefinitions.horizon, " poderá contratar apenas três analistas neste trimestre, com teto de R$ 240 mil."],
      ["O registro de ", mentionDefinitions.sixAnalysts, " ainda aparece como aprovado. Não existe plano revisado de capacidade, prazo ou meta de atendimento."],
    ],
  },
  {
    title: "[TESTE IA · HORIZONTE] Preparação do recrutamento",
    paragraphs: [
      [mentionDefinitions.marina, " deveria publicar as vagas de ", mentionDefinitions.horizon, " até 12 de setembro de 2026."],
      ["Os perfis das funções, as faixas salariais e o painel de entrevistadores ainda não foram definidos. Nenhum responsável foi nomeado para cada pendência."],
    ],
  },
  {
    title: "[TESTE IA · HORIZONTE] Capacidade temporária em Recife",
    paragraphs: [
      [mentionDefinitions.rafael, " pode deslocar quatro pessoas de ", mentionDefinitions.recife, " para ", mentionDefinitions.horizon, " a partir de 10 de outubro de 2026."],
      ["A ", mentionDefinitions.temporaryRotation, " cobriria parte do intervalo até as contratações, mas exige aprovação dos gestores de origem e um plano de treinamento."],
    ],
  },
  {
    title: "[TESTE IA · HORIZONTE] Risco operacional e férias",
    paragraphs: [
      ["A equipe de ", mentionDefinitions.horizon, " está com 18% de horas extras e ", mentionDefinitions.responseTime, "."],
      ["Duas pessoas seniores estarão de férias entre 20 e 31 de outubro de 2026. Follow-up: ", mentionDefinitions.marina, " deve publicar um plano semanal de capacidade e contingência."],
    ],
  },

  {
    title: "[TESTE IA · ENTERPRISE] Decisão do comitê comercial",
    paragraphs: [
      ["O comitê de ", mentionDefinitions.enterprise, " aprovou ", mentionDefinitions.enterprisePrice, ", com mínimo de 200 licenças e lançamento em 5 de novembro de 2026."],
      [mentionDefinitions.camila, " é responsável pela política comercial e pela comunicação final ao time de vendas."],
    ],
  },
  {
    title: "[TESTE IA · ENTERPRISE] Proposta para cliente estratégico",
    paragraphs: [
      [mentionDefinitions.diego, " prometeu à ", mentionDefinitions.northstar, " o preço de R$ 79 por usuário, sem quantidade mínima, para ", mentionDefinitions.enterprise, "."],
      ["A proposta precisa ser enviada até 12 de setembro de 2026. A condição diverge da decisão vigente e não registra aprovação de exceção."],
    ],
  },
  {
    title: "[TESTE IA · ENTERPRISE] Pendências jurídicas e de segurança",
    paragraphs: [
      [mentionDefinitions.northstar, " solicitou um DPA e um questionário de segurança para contratar ", mentionDefinitions.enterprise, "."],
      ["O questionário vence em 8 de setembro de 2026, o DPA ainda não foi iniciado e nenhuma das duas entregas possui responsável formal."],
    ],
  },
  {
    title: "[TESTE IA · ENTERPRISE] Margem e alternativa de onboarding",
    paragraphs: [
      ["No preço aprovado, ", mentionDefinitions.enterprise, " apresenta ", mentionDefinitions.enterpriseMargin, ". A R$ 79, a projeção cai para 51%, abaixo da meta mínima de 60%."],
      [mentionDefinitions.usageOnboarding, " pode reduzir em 25% as horas de serviços profissionais e recuperar parte da margem, mas ainda não foi estimado nem testado."],
    ],
  },
  {
    title: "[TESTE IA · ENTERPRISE] Decisão executiva pendente",
    paragraphs: [
      ["A diretoria pediu uma recomendação comercial final para ", mentionDefinitions.enterprise, " até sexta-feira, 11 de setembro de 2026."],
      ["Não está claro se ", mentionDefinitions.camila, " ou ", mentionDefinitions.diego, " possui autoridade para aprovar a exceção da ", mentionDefinitions.northstar, "."],
      ["Follow-up: definir a autoridade, fechar a recomendação e agendar a conversa com o cliente."],
    ],
  },

  {
    title: "[CONTROLE IA · AURORA] Objetivo e governança",
    paragraphs: [
      [mentionDefinitions.aurora, " tem ", mentionDefinitions.laura, " como responsável, meta de SLA de 95% e orçamento aprovado."],
      ["A governança segue a decisão ", mentionDefinitions.weeklyReview, " às 9h, com pauta, participantes e suplente já definidos."],
    ],
  },
  {
    title: "[CONTROLE IA · AURORA] Resultado semanal",
    paragraphs: [
      [mentionDefinitions.aurora, " atingiu ", mentionDefinitions.auroraSla, ", acima da meta de 95%."],
      ["A fonte é o painel operacional atualizado na sexta-feira, 4 de setembro de 2026. ", mentionDefinitions.laura, " validou os números e não registrou bloqueios."],
    ],
  },
  {
    title: "[CONTROLE IA · AURORA] Dependências concluídas",
    paragraphs: [
      ["Os acessos do fornecedor e o treinamento de ", mentionDefinitions.aurora, " foram concluídos em 3 de setembro de 2026."],
      ["O registro de riscos foi revisado por ", mentionDefinitions.laura, ". Não há riscos altos abertos e todas as evidências estão anexadas ao registro interno."],
    ],
  },
  {
    title: "[CONTROLE IA · AURORA] Próxima entrega confirmada",
    paragraphs: [
      [mentionDefinitions.laura, " entregará o relatório semanal de ", mentionDefinitions.aurora, " em 8 de setembro de 2026."],
      ["A reunião já está agendada, o modelo do relatório está pronto e o suplente confirmou disponibilidade. Nenhuma ação adicional está pendente."],
    ],
  },
];

for (const note of testNotes) {
  repository.saveNote({
    title: note.title,
    contentJson: {
      type: "doc",
      content: note.paragraphs.map((paragraph) => ({
        type: "paragraph",
        content: paragraph.map((part) =>
          typeof part === "string"
            ? { type: "text", text: part }
            : {
                type: "mention",
                attrs: {
                  id: `new:ai-seed:${crypto.randomUUID()}`,
                  label: part.name,
                  typeId: part.typeId,
                  typeLabel: part.typeLabel,
                  color: part.color,
                  isNew: true,
                },
              },
        ),
      })),
    },
  });
}

const state = repository.getAppState();

function getObjectId(typeName: string, objectName: string) {
  const object = state.objects.find((item) => item.typeName === typeName && item.name === objectName);
  if (!object) throw new Error(`Seeded object not found: ${typeName}/${objectName}`);
  return object.id;
}

const confirmedRelationships = [
  ["Projeto", "Projeto Atlas", "Pessoa", "Ana Costa", "liderado por"],
  ["Projeto", "Projeto Atlas", "Fornecedor", "CloudBridge", "depende de"],
  ["Projeto", "Projeto Horizonte", "Pessoa", "Marina Alves", "liderado por"],
  ["Projeto", "Projeto Horizonte", "Local", "Recife", "pode receber apoio de"],
  ["Projeto", "Projeto Enterprise", "Pessoa", "Camila Rocha", "liderado por"],
  ["Projeto", "Projeto Enterprise", "Cliente", "Northstar Labs", "negociação com"],
  ["Projeto", "Projeto Aurora", "Pessoa", "Laura Mendes", "liderado por"],
] as const;

for (const [sourceType, sourceName, targetType, targetName, label] of confirmedRelationships) {
  repository.createRelationship({
    sourceObjectId: getObjectId(sourceType, sourceName),
    targetObjectId: getObjectId(targetType, targetName),
    label,
  });
}

const finalState = repository.getAppState();
const expectedNoteCount = testNotes.length;
if (finalState.metrics.notes !== expectedNoteCount) {
  throw new Error(`Seed verification failed: expected ${expectedNoteCount} notes, found ${finalState.metrics.notes}.`);
}

const expectedScenarioSizes = new Map([
  ["Projeto Atlas", 5],
  ["Projeto Horizonte", 5],
  ["Projeto Enterprise", 5],
  ["Projeto Aurora", 4],
]);

for (const [projectName, expectedCount] of expectedScenarioSizes) {
  const actualCount = finalState.notes.filter((note) =>
    note.mentions.some((object) => object.typeId === "type-project" && object.name === projectName),
  ).length;
  if (actualCount !== expectedCount) {
    throw new Error(`Seed verification failed: ${projectName} should have ${expectedCount} notes, found ${actualCount}.`);
  }
}

const database = getDatabase();
database.sqlite.pragma("wal_checkpoint(TRUNCATE)");
database.sqlite.close();

console.log(`Created isolated AI test database: ${databasePath}`);
console.log(`Seeded ${finalState.metrics.notes} notes, ${finalState.metrics.objects} objects, and ${confirmedRelationships.length} confirmed relationships.`);
console.log("Analysis scopes: Projeto Atlas, Projeto Horizonte, Projeto Enterprise, and Projeto Aurora (control scenario). ");

function mention(typeId: string, typeLabel: string, color: string, name: string): MentionDefinition {
  return { typeId, typeLabel, color, name };
}
