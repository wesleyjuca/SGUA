'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const GREEN = '#0f7a45';
const DARK  = '#232a31';
const GRAY  = '#63707c';
const LIGHT = '#f6f7f9';
const LINE  = '#dcdfe4';

function addCover(doc, title, subtitle, version) {
  doc.rect(0, 0, doc.page.width, 220).fill(GREEN);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(28).text(title, 48, 80, { width: 500 });
  if (subtitle) {
    doc.font('Helvetica').fontSize(13).text(subtitle, 48, 120, { width: 500 });
  }
  doc.fontSize(10).text(`Versão ${version} — ${new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}`, 48, 155);
  doc.fillColor(DARK);
  doc.moveDown(8);
}

function sectionTitle(doc, text) {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 6).fill(GREEN);
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(18).text(text, 48, 28);
  doc.fillColor(DARK).font('Helvetica').fontSize(11);
  doc.moveDown(0.5);
}

function subTitle(doc, text) {
  doc.moveDown(0.8);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13).text(text, 48);
  doc.font('Helvetica').fontSize(11);
  doc.moveDown(0.3);
}

function body(doc, text) {
  doc.fillColor(DARK).font('Helvetica').fontSize(11).text(text, 48, undefined, { width: 499, align: 'justify' });
  doc.moveDown(0.4);
}

function bullet(doc, items) {
  items.forEach((item) => {
    doc.fillColor(GREEN).text('•', 48, undefined, { continued: true, width: 16 });
    doc.fillColor(DARK).text(` ${item}`, { width: 483 });
  });
  doc.moveDown(0.3);
}

function infoBox(doc, text) {
  const y = doc.y;
  doc.rect(44, y, 507, 44).fill(LIGHT).stroke(LINE);
  doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(10).text(text, 54, y + 14, { width: 487 });
  doc.font('Helvetica').fontSize(11).fillColor(DARK);
  doc.moveDown(2);
}

// ─── MANUAL DE USO ────────────────────────────────────────────────────────────

function gerarManual() {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
  const out = path.join(DOCS, 'manual-de-uso.pdf');
  doc.pipe(fs.createWriteStream(out));

  addCover(doc, 'SGUA', 'Sistema de Gestão de Unidades Ambientais\nSEMA/AC — CIMA & UGAI', '5.0');

  // ── Visão Geral
  sectionTitle(doc, '1. Visão Geral do Sistema');
  body(doc, 'O SGUA (Sistema de Gestão de Unidades Ambientais) é uma aplicação web desenvolvida para a SEMA/AC (Secretaria de Estado do Meio Ambiente do Acre) com o objetivo de centralizar o controle das unidades ambientais CIMA e UGAI, seus usuários, ocupações, notícias e solicitações de uso.');
  body(doc, 'O sistema utiliza tecnologia moderna: backend Node.js + Express.js, banco de dados PostgreSQL hospedado no Supabase, e interface web responsiva com módulos especializados para cada área de gestão.');
  subTitle(doc, 'Arquitetura');
  bullet(doc, [
    'Backend: Node.js 18+ com Express.js',
    'Banco de dados: PostgreSQL (Supabase) — persistência em nuvem',
    'Frontend: SPA (Single Page Application) com módulos JavaScript puro',
    'Mapas: Leaflet.js com dados georreferenciados',
    'Feeds: Parser RSS/Atom com sincronização automática para o banco',
  ]);

  // ── Acesso e Navegação
  sectionTitle(doc, '2. Acesso e Navegação');
  body(doc, 'O sistema é acessado via navegador web. Não é necessária instalação de software no computador do usuário. Recomenda-se o uso de Google Chrome, Firefox ou Microsoft Edge em versão atualizada.');
  subTitle(doc, 'Barra de Navegação');
  body(doc, 'No topo da tela, abaixo do cabeçalho verde, encontra-se a barra de navegação com os seguintes módulos:');
  bullet(doc, [
    'Dashboard — visão geral e indicadores do sistema',
    'Unidades — gestão das unidades ambientais',
    'Mapa — visualização georreferenciada das unidades',
    'Usuários — cadastro e gestão de usuários',
    'Notícias — publicação e sincronização de feeds RSS',
    'Solicitações — gestão de pedidos de uso das unidades',
  ]);
  body(doc, 'O módulo ativo é destacado em verde na barra de navegação. Basta clicar no nome do módulo para acessá-lo.');

  // ── Dashboard
  sectionTitle(doc, '3. Módulo Dashboard');
  body(doc, 'O Dashboard exibe os principais indicadores do sistema em cartões de métricas (KPIs), permitindo uma visão rápida da situação atual das unidades ambientais.');
  subTitle(doc, 'Indicadores disponíveis');
  bullet(doc, [
    'Total de Usuários cadastrados no sistema',
    'Total de Unidades registradas',
    'Total de Notícias publicadas',
    'Total de Solicitações recebidas',
  ]);
  body(doc, 'Os dados são carregados automaticamente ao acessar o módulo e refletem o estado atual do banco de dados em tempo real.');

  // ── Unidades
  sectionTitle(doc, '4. Módulo Unidades');
  body(doc, 'O módulo de Unidades permite o cadastro completo e a gestão das unidades ambientais, incluindo dados de localização geográfica, capacidade de ocupação e controle de check-in/check-out.');
  subTitle(doc, 'Cadastrar nova unidade');
  bullet(doc, [
    'Preencha o campo "Nome" (obrigatório)',
    'Informe o endereço completo (opcional)',
    'Insira Latitude e Longitude para exibição no mapa (opcional)',
    'Defina a Capacidade máxima de ocupantes (0 = sem limite)',
    'Selecione o Status: Ativa ou Inativa',
    'Clique em "Criar unidade"',
  ]);
  subTitle(doc, 'Registrar Ocupação (Check-in)');
  body(doc, 'Para registrar a entrada de uma organização em uma unidade, clique no botão "Ocupar" na linha da unidade desejada. O sistema solicitará:');
  bullet(doc, [
    'Nome da Organização',
    'Tipo de Uso (ex.: Monitoramento, Fiscalização, Pesquisa)',
  ]);
  infoBox(doc, 'Atenção: unidades com status "Inativa" ou que já atingiram a capacidade máxima não aceitam novos registros de ocupação.');
  subTitle(doc, 'Excluir Unidade');
  body(doc, 'Clique em "Excluir" na linha da unidade. O sistema pedirá confirmação antes de remover o registro. A exclusão é permanente.');

  // ── Mapa
  sectionTitle(doc, '5. Módulo Mapa');
  body(doc, 'O mapa georreferenciado exibe todas as unidades que possuem coordenadas de latitude e longitude cadastradas, usando base cartográfica do OpenStreetMap.');
  subTitle(doc, 'Legenda');
  bullet(doc, [
    'Marcador verde — Unidade Ativa',
    'Marcador cinza — Unidade Inativa',
  ]);
  subTitle(doc, 'Interação');
  bullet(doc, [
    'Clique em um marcador para ver nome, endereço, status e barra de ocupação',
    'Use o botão "⊞ Ajustar vista" para centralizar o mapa em todas as unidades',
    'Utilize o scroll do mouse ou os botões +/- para zoom',
  ]);
  infoBox(doc, 'Dica: cadastre Latitude e Longitude nas unidades para que apareçam no mapa. As coordenadas do Acre variam entre Lat: -7° a -11° e Long: -66° a -74°.');

  // ── Usuários
  sectionTitle(doc, '6. Módulo Usuários');
  body(doc, 'O módulo de Usuários permite cadastrar as pessoas que utilizarão ou gerenciarão o sistema, definindo seus níveis de acesso.');
  subTitle(doc, 'Cadastrar usuário');
  bullet(doc, [
    'Nome completo (obrigatório)',
    'E-mail válido (obrigatório — usado como identificador único)',
    'Perfil: Visualizador, Gestor ou Admin',
  ]);
  subTitle(doc, 'Perfis de acesso');
  bullet(doc, [
    'Visualizador — acesso de leitura aos módulos',
    'Gestor — pode registrar ocupações e solicitações',
    'Admin — acesso completo, incluindo exclusão de registros',
  ]);

  // ── Notícias e Feeds
  sectionTitle(doc, '7. Módulo Notícias e Feeds RSS');
  body(doc, 'O módulo de Notícias centraliza conteúdo informativo em duas formas: publicação manual de notícias pelo gestor e sincronização automática de feeds RSS/Atom de fontes externas como SEMA/AC, MMA e INPE.');
  subTitle(doc, 'Sincronizar Feeds RSS');
  bullet(doc, [
    'Ative ou desative os feeds usando as caixas de seleção',
    'Clique em "🔄 Sincronizar Feeds"',
    'O sistema buscará os artigos mais recentes de cada fonte ativa',
    'Itens novos são salvos no banco (deduplicação automática por título + fonte)',
    'A tabela de notícias é atualizada automaticamente após a sincronização',
  ]);
  subTitle(doc, 'Publicar notícia manualmente');
  bullet(doc, [
    'Preencha Título (obrigatório)',
    'Selecione o Autor (opcional)',
    'Escreva o Conteúdo (obrigatório)',
    'Clique em "Publicar notícia"',
  ]);
  subTitle(doc, 'Tipos de notícia na tabela');
  body(doc, 'Cada notícia possui um badge indicando sua origem: RSS (importada de feed externo) ou Manual (publicada pelo gestor). Notícias RSS possuem link clicável para a fonte original.');

  // ── Solicitações
  sectionTitle(doc, '8. Módulo Solicitações');
  body(doc, 'O módulo de Solicitações gerencia pedidos externos de uso das unidades ambientais, seguindo um fluxo de trabalho com três estados: Pendente, Aprovada e Rejeitada.');
  subTitle(doc, 'Criar solicitação');
  bullet(doc, [
    'Selecione a Unidade desejada',
    'Informe o nome do Solicitante',
    'E-mail de contato (opcional)',
    'Tipo de Uso pretendido',
    'Observações adicionais (opcional)',
    'Clique em "Criar solicitação"',
  ]);
  subTitle(doc, 'Fluxo de aprovação');
  body(doc, 'Solicitações criadas entram automaticamente com status "Pendente". O gestor pode:');
  bullet(doc, [
    'Clicar "Aprovar" para aprovar o uso — status muda para "Aprovada" (verde)',
    'Clicar "Rejeitar" para negar o pedido — status muda para "Rejeitada" (vermelho)',
  ]);
  infoBox(doc, 'Após aprovação ou rejeição, os botões de ação são removidos e apenas o badge de status é exibido, evitando alterações acidentais.');

  // ── Deploy
  sectionTitle(doc, '9. Configuração e Deploy (Render.com)');
  body(doc, 'O sistema está configurado para deploy automático no Render.com, plataforma de hospedagem gratuita para aplicações Node.js.');
  subTitle(doc, 'Passos para publicar');
  bullet(doc, [
    '1. Acesse render.com e crie uma conta (gratuita)',
    '2. Clique em "New +" → "Web Service"',
    '3. Conecte o repositório GitHub: wesleyjuca/SGUA',
    '4. Selecione a branch "main"',
    '5. O Render detectará automaticamente o render.yaml',
    '6. Em "Environment Variables", adicione DATABASE_URL com a connection string do Supabase',
    '7. Clique em "Create Web Service" — o deploy inicia automaticamente',
  ]);
  subTitle(doc, 'Variáveis de ambiente obrigatórias');
  bullet(doc, [
    'DATABASE_URL — connection string PostgreSQL do Supabase',
    'PORT — opcional; o Render define automaticamente',
  ]);
  body(doc, 'Após o primeiro deploy, o Render fará deploy automático a cada push na branch main do repositório GitHub.');

  // Rodapé / fim
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 6).fill(GREEN);
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(16).text('Suporte e Contato', 48, 28);
  doc.fillColor(DARK).font('Helvetica').fontSize(11);
  doc.moveDown(1);
  body(doc, 'Para dúvidas, sugestões ou reportar problemas no sistema SGUA, entre em contato com a equipe técnica da SEMA/AC.');
  body(doc, 'Repositório do sistema: github.com/wesleyjuca/SGUA');
  body(doc, 'Banco de dados: Supabase (projeto vfcqgubduugncpjsgpqb)');

  doc.end();
  console.log(`✓ Manual gerado: ${out}`);
}

// ─── SUGESTÕES DE NOVAS FUNCIONALIDADES ───────────────────────────────────────

function gerarSugestoes() {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
  const out = path.join(DOCS, 'sugestoes-novas-funcionalidades.pdf');
  doc.pipe(fs.createWriteStream(out));

  addCover(doc, 'SGUA — Roadmap de Melhorias', 'Sugestões de Novas Funcionalidades\npara versões futuras do sistema', '5.0');

  function feature(num, titulo, descricao, itens, impacto) {
    sectionTitle(doc, `${num}. ${titulo}`);
    body(doc, descricao);
    if (itens && itens.length) {
      subTitle(doc, 'Escopo técnico');
      bullet(doc, itens);
    }
    if (impacto) {
      doc.moveDown(0.3);
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10).text(`Impacto: ${impacto}`);
      doc.fillColor(DARK).font('Helvetica').fontSize(11);
    }
  }

  feature(1, 'Autenticação e Controle de Acesso (RBAC)',
    'Atualmente o sistema não possui login. Qualquer pessoa com acesso à URL pode modificar dados. Implementar autenticação garante rastreabilidade e segurança dos dados ambientais.',
    [
      'Login com e-mail + senha (bcrypt para hash)',
      'Sessões via JWT (token no localStorage) ou cookies HttpOnly',
      'Middleware de autenticação em todas rotas da API',
      'Tabela sessions ou uso de Supabase Auth',
      'Tela de login antes de acessar qualquer módulo',
      'Logout com invalidação de token',
    ],
    'Crítico — impede acesso não autorizado a dados sensíveis'
  );

  feature(2, 'Dashboard com Gráficos e Análise de Dados',
    'O dashboard atual exibe apenas contagens. Adicionar gráficos históricos transforma o sistema em uma ferramenta de análise ambiental, permitindo identificar tendências de uso das unidades.',
    [
      'Biblioteca Chart.js (leve, sem dependências)',
      'Gráfico de linha: ocupação por unidade nos últimos 30/90 dias',
      'Gráfico de barras: solicitações por status por mês',
      'Gráfico de pizza: distribuição de tipo de uso (Monitoramento, Fiscalização, etc.)',
      'Endpoint GET /api/stats/occupancy?periodo=30d no backend',
      'Consulta SQL com GROUP BY DATE + unit_id na tabela occupancy_records',
    ],
    'Alto — transforma o sistema em ferramenta de tomada de decisão'
  );

  feature(3, 'Notificações em Tempo Real (Supabase Realtime)',
    'Gestores precisam saber imediatamente quando uma nova solicitação chega ou quando uma unidade atinge capacidade máxima. O Supabase Realtime oferece websockets nativos sem infraestrutura adicional.',
    [
      'Supabase Realtime: subscribe em tabelas requests e units',
      'Toast notifications no frontend (sem biblioteca — CSS puro)',
      'Badge numérico no link "Solicitações" da nav',
      'Notificação sonora opcional via Web Audio API',
      'Configurável: usuário escolhe quais alertas receber',
    ],
    'Alto — melhora a capacidade de resposta operacional'
  );

  feature(4, 'Exportação de Relatórios (CSV e PDF)',
    'Órgãos ambientais precisam prestar contas periodicamente. Exportar dados de ocupação, solicitações aprovadas e movimentação das unidades em formato CSV ou PDF facilita a geração de relatórios oficiais.',
    [
      'Botão "Exportar CSV" nas tabelas de Ocupação, Solicitações e Notícias',
      'Backend: endpoint GET /api/reports/occupancy.csv com pg COPY ou manual',
      'Relatório PDF mensal: totais por unidade, por organização, por tipo de uso',
      'Seletor de período (data início / data fim) no frontend',
      'Uso de pdfkit (já instalado como devDependency)',
    ],
    'Alto — atende requisito de transparência e prestação de contas'
  );

  feature(5, 'Histórico Completo de Ocupação por Unidade',
    'A tabela occupancy_records já existe no banco, mas o frontend só mostra registros ao clicar em uma unidade. Uma visão de histórico consolidado, com filtros e linha do tempo, agrega valor analítico.',
    [
      'Nova aba/página: "Histórico de Ocupação"',
      'Filtros: por unidade, período, organização, tipo de uso',
      'Paginação server-side (LIMIT + OFFSET no SQL)',
      'Indicadores: tempo médio de ocupação, organizações mais frequentes',
      'Exportação do histórico filtrado para CSV',
    ],
    'Médio — melhora a capacidade de análise histórica'
  );

  feature(6, 'Busca, Filtros e Paginação nas Tabelas',
    'Com crescimento dos dados (>100 registros), as tabelas atuais ficam lentas e difíceis de navegar. Adicionar busca em tempo real, filtros por coluna e paginação é essencial para escalabilidade.',
    [
      'Campo de busca global por texto (filtragem client-side para tabelas pequenas)',
      'Filtros por coluna: status, data, tipo',
      'Paginação: 25/50/100 itens por página com navegação',
      'Backend: suporte a parâmetros ?page=1&limit=50&search=texto',
      'Ordenação por colunas (clique no cabeçalho)',
    ],
    'Médio — imprescindível após 6 meses de uso com dados reais'
  );

  feature(7, 'PWA — Aplicativo Mobile Instalável',
    'Agentes de campo fazem check-in/check-out nas unidades usando smartphones. Transformar o SGUA em PWA (Progressive Web App) permite instalar o sistema na tela inicial do celular sem loja de apps.',
    [
      'manifest.json com nome, ícones e cores do app',
      'Service Worker para cache offline (sw.js)',
      'Estratégia cache-first para assets estáticos',
      'Network-first para chamadas de API',
      'Banner "Adicionar à tela inicial" no primeiro acesso',
      'Ícone 192x192 e 512x512 da SEMA/AC',
    ],
    'Alto — aumenta adoção por agentes de campo'
  );

  feature(8, 'Upload de Fotos das Unidades',
    'Registrar fotos das unidades ambientais facilita a identificação, o monitoramento de condições físicas e a documentação para relatórios. O Supabase Storage oferece armazenamento de arquivos nativo.',
    [
      'Campo file input na página de unidade',
      'Upload para Supabase Storage via API REST',
      'Tabela unit_photos: unit_id, url, caption, uploaded_at',
      'Galeria de fotos no card de cada unidade',
      'Tamanho máximo: 5MB por foto, formatos JPEG/PNG/WebP',
      'Thumbnail automático via Supabase Image Transformations',
    ],
    'Médio — melhora documentação e inspeção remota das unidades'
  );

  feature(9, 'Agendamento de Uso das Unidades (Calendário)',
    'Atualmente as solicitações não têm datas definidas. Um sistema de agendamento com calendário visual previne conflitos de uso e permite planejamento antecipado de expedições e operações.',
    [
      'Campos start_date e end_date na tabela requests',
      'Calendário mensal no frontend (FullCalendar.js ou CSS puro)',
      'Verificação de disponibilidade: impede sobreposição de períodos',
      'Endpoint GET /api/units/:id/schedule retorna ocupações futuras',
      'Notificação automática ao solicitante sobre aprovação + datas',
    ],
    'Alto — elimina conflitos de uso e melhora planejamento operacional'
  );

  feature(10, 'Log de Auditoria — Rastreabilidade de Ações',
    'Em sistemas de gestão ambiental, saber quem fez o quê e quando é requisito de compliance e transparência. Um log de auditoria registra todas as ações críticas: criação, edição e exclusão de registros.',
    [
      'Tabela audit_log: id, user_id, action, entity, entity_id, old_data, new_data, created_at',
      'Middleware de auditoria no Express (intercepta PUT/DELETE/POST)',
      'Interface de visualização: filtro por usuário, ação e período',
      'Retenção: registros mantidos por 2 anos (política ambiental)',
      'Exportação do log em CSV para auditorias externas',
    ],
    'Alto — requisito de transparência para órgão público ambiental'
  );

  // Resumo
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 6).fill(GREEN);
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(16).text('Priorização Recomendada', 48, 28);
  doc.fillColor(DARK).font('Helvetica').fontSize(11);
  doc.moveDown(1);

  const prioridades = [
    ['Crítica', '1. Autenticação (RBAC)', 'Segurança — sem login qualquer pessoa altera dados'],
    ['Alta', '3. Notificações em Tempo Real', 'Operacional — alerta imediato de novas solicitações'],
    ['Alta', '7. PWA Mobile', 'Adoção — agentes de campo usam smartphones'],
    ['Alta', '4. Exportação de Relatórios', 'Compliance — prestação de contas obrigatória'],
    ['Alta', '10. Log de Auditoria', 'Transparência — requisito de órgão público'],
    ['Média', '2. Dashboard com Gráficos', 'Analítica — tomada de decisão baseada em dados'],
    ['Média', '9. Agendamento (Calendário)', 'Planejamento — evita conflitos de uso'],
    ['Média', '6. Paginação e Filtros', 'Escalabilidade — necessário após 6 meses de uso'],
    ['Baixa', '5. Histórico de Ocupação', 'Análise histórica — relatório executivo'],
    ['Baixa', '8. Upload de Fotos', 'Documentação — inspeção visual remota'],
  ];

  prioridades.forEach(([nivel, nome, justificativa]) => {
    const cor = nivel === 'Crítica' ? '#c0392b' : nivel === 'Alta' ? '#0f7a45' : nivel === 'Média' ? '#e67e22' : GRAY;
    doc.fillColor(cor).font('Helvetica-Bold').fontSize(10).text(`[${nivel}]`, 48, undefined, { continued: true, width: 70 });
    doc.fillColor(DARK).font('Helvetica-Bold').text(` ${nome}`, { continued: true, width: 280 });
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(` — ${justificativa}`, { width: 200 });
    doc.moveDown(0.4);
  });

  doc.end();
  console.log(`✓ Sugestões geradas: ${out}`);
}

gerarManual();
gerarSugestoes();
