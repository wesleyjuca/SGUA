// SGUA — Admin Relatórios

var AdminRelatorios = function(props) {
  var uns = props.uns || [], news = props.news || [], sols = props.sols || [], users = props.users || [];

  function exportXLSX(data, name) {
    var ws = XLSX.utils.json_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    XLSX.writeFile(wb, name + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  var relatorios = [
    {
      icon: '🏠', title: 'Unidades', desc: 'Todas as unidades com status, capacidade, ocupação e contatos.',
      count: uns.length, color: C.g2,
      fn: function() {
        exportXLSX(uns.map(function(u) {
          var d = Domain.formatUnidade(u);
          return { ID: d.id, Nome: d.nome, Tipo: d.tipo, Município: d.municipio, Status: Domain.statusLabel(d.status), Capacidade: d.capacidade, Ocupação: d.ocupacao, 'Taxa (%)': d.taxa, Responsável: d.contato.nome, Email: d.contato.email, Telefone: d.contato.tel, Descrição: d.descricao };
        }), 'SGUA_Unidades');
      }
    },
    {
      icon: '📰', title: 'Notícias', desc: 'Todas as notícias com título, categoria, fonte e data.',
      count: news.length, color: '#1565c0',
      fn: function() {
        exportXLSX(news.map(function(n) {
          return { ID: n.id, Título: n.titulo || n.title, Categoria: n.categoria || n.category, Fonte: n.fonte || n.source, Data: Utils.fmtDate(n.data || n.created_at), Destaque: n.destaque ? 'Sim' : 'Não', Visível: n.visivel !== false ? 'Sim' : 'Não', Tipo: n.is_rss ? 'RSS' : 'Manual', Link: n.link || '' };
        }), 'SGUA_Noticias');
      }
    },
    {
      icon: '📋', title: 'Solicitações', desc: 'Todas as solicitações de uso com status e informações do solicitante.',
      count: sols.length, color: C.ym,
      fn: function() {
        exportXLSX(sols.map(function(s) {
          return { ID: s.id, Solicitante: s.requester_name || s.sol, Email: s.requester_email || '', 'Tipo de Uso': s.usage_type || s.ev, Status: Domain.requestStatusLabel(s.status), Data: Utils.fmtDate(s.created_at || s.dt), Obs: s.notes || '' };
        }), 'SGUA_Solicitacoes');
      }
    },
    {
      icon: '👥', title: 'Usuários', desc: 'Lista de usuários do sistema com perfis e datas de criação.',
      count: users.length, color: '#6a1b9a',
      fn: function() {
        exportXLSX(users.map(function(u) {
          return { ID: u.id, Nome: u.name || u.nome, Email: u.email, Perfil: Domain.roleLabel(u.role), Criado: Utils.fmtDate(u.created_at) };
        }), 'SGUA_Usuarios');
      }
    }
  ];

  return h('div', null,
    h('div', { className: 'admin-topbar' },
      h('h1', { className: 'admin-page-title' }, '📊 Relatórios e Exportação')
    ),
    h('p', { style: { color: C.cm, marginBottom: 20, fontSize: 14 } }, 'Exporte os dados do sistema em formato Excel (XLSX) para análise e prestação de contas.'),
    h('div', { className: 'grid-2' },
      relatorios.map(function(r) {
        return h('div', { key: r.title, className: 'card', style: { borderLeft: '4px solid ' + r.color } },
          h('div', { className: 'flex-between', style: { marginBottom: 12 } },
            h('div', null,
              h('div', { style: { fontSize: 20, marginBottom: 4 } }, r.icon),
              h('div', { className: 'card-title', style: { margin: 0 } }, r.title)
            ),
            h('div', { style: { fontSize: 24, fontWeight: 800, color: r.color } }, r.count)
          ),
          h('p', { style: { fontSize: 13, color: C.cm, marginBottom: 16 } }, r.desc),
          h('button', { className: 'w-full', style: { background: r.color }, onClick: r.fn }, '📥 Exportar ' + r.title + ' (.xlsx)')
        );
      })
    ),
    h('div', { className: 'card', style: { marginTop: 4 } },
      h('div', { className: 'card-title' }, '📋 Exportar Completo'),
      h('p', { style: { fontSize: 13, color: C.cm, marginBottom: 16 } }, 'Exporte todos os dados em um único arquivo com múltiplas abas.'),
      h('button', { className: 'w-full', onClick: function() {
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(uns.map(function(u) { var d = Domain.formatUnidade(u); return { ID: d.id, Nome: d.nome, Tipo: d.tipo, Status: Domain.statusLabel(d.status), Capacidade: d.capacidade, Ocupação: d.ocupacao }; })), 'Unidades');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(news.map(function(n) { return { Título: n.titulo || n.title, Categoria: n.categoria, Data: Utils.fmtDate(n.data || n.created_at) }; })), 'Noticias');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sols.map(function(s) { return { Solicitante: s.requester_name, Status: Domain.requestStatusLabel(s.status), Data: Utils.fmtDate(s.created_at) }; })), 'Solicitacoes');
        XLSX.writeFile(wb, 'SGUA_Completo_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      } }, '📥 Exportar Tudo (todas as abas)')
    )
  );
};
