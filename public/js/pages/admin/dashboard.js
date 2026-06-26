// SGUA — Admin Dashboard

var AdminDashboard = function(props) {
  var uns = props.uns || [], news = props.news || [], sols = props.sols || [], users = props.users || [];

  var ativas = uns.filter(function(u) { return u.status === 'active'; }).length;
  var pendentes = sols.filter(function(s) { return s.status === 'pending'; }).length;
  var newsRecentes = news.slice(0, 5);
  var solsRecentes = sols.slice(0, 5);

  return h('div', null,
    h('div', { className: 'grid-4', style: { marginBottom: 20 } },
      h(StatCard, { value: uns.length, label: 'Unidades', icon: '🏠', color: C.g2 }),
      h(StatCard, { value: ativas, label: 'Ativas', icon: '✅', color: C.g1 }),
      h(StatCard, { value: pendentes, label: 'Solicitações pendentes', icon: '⏳', color: C.ym }),
      h(StatCard, { value: news.length, label: 'Notícias', icon: '📰', color: '#1565c0' })
    ),

    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } },
      h('div', { className: 'card' },
        h('div', { className: 'flex-between', style: { marginBottom: 12 } },
          h('div', { className: 'card-title', style: { margin: 0 } }, '📰 Últimas Notícias'),
          h('button', { className: 'sm ghost', onClick: function() { props.setTab('noticias'); } }, 'Ver todas')
        ),
        newsRecentes.length === 0
          ? h(EmptyState, { icon: '📰', title: 'Sem notícias', desc: 'Cadastre a primeira notícia.' })
          : newsRecentes.map(function(n) {
              return h('div', { key: n.id, style: { padding: '8px 0', borderBottom: '1px solid ' + C.cl } },
                h('div', { style: { fontSize: 14, fontWeight: 600 } }, Utils.truncate(n.titulo || n.title || '', 60)),
                h('div', { style: { fontSize: 12, color: C.cm, marginTop: 2 } }, Utils.fmtDate(n.data || n.created_at) + (n.categoria ? ' · ' + n.categoria : ''))
              );
            })
      ),

      h('div', { className: 'card' },
        h('div', { className: 'flex-between', style: { marginBottom: 12 } },
          h('div', { className: 'card-title', style: { margin: 0 } }, '📋 Solicitações Recentes'),
          h('button', { className: 'sm ghost', onClick: function() { props.setTab('solicitacoes'); } }, 'Ver todas')
        ),
        solsRecentes.length === 0
          ? h(EmptyState, { icon: '📋', title: 'Sem solicitações', desc: 'Nenhuma solicitação recebida ainda.' })
          : solsRecentes.map(function(s) {
              return h('div', { key: s.id, style: { padding: '8px 0', borderBottom: '1px solid ' + C.cl, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                h('div', null,
                  h('div', { style: { fontSize: 14, fontWeight: 600 } }, s.requester_name || s.sol || ''),
                  h('div', { style: { fontSize: 12, color: C.cm } }, s.usage_type || s.ev || '')
                ),
                h(Badge, { color: Domain.requestStatusColor(s.status) }, Domain.requestStatusLabel(s.status))
              );
            })
      )
    ),

    h('div', { className: 'card', style: { marginTop: 20 } },
      h('div', { className: 'flex-between', style: { marginBottom: 12 } },
        h('div', { className: 'card-title', style: { margin: 0 } }, '🏠 Unidades'),
        h('button', { className: 'sm ghost', onClick: function() { props.setTab('unidades'); } }, 'Gerenciar')
      ),
      h('div', { className: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'Nome'), h('th', null, 'Status'), h('th', null, 'Capacidade'), h('th', null, 'Ocupação'), h('th', null, 'Taxa')
          )),
          h('tbody', null,
            uns.slice(0, 8).map(function(u) {
              var taxa = Domain.taxaUso(u);
              return h('tr', { key: u.id },
                h('td', null, h('strong', null, u.name || u.nome || '')),
                h('td', null, h(Badge, { color: Domain.statusColor(u.status) }, Domain.statusLabel(u.status))),
                h('td', null, u.capacity || '∞'),
                h('td', null, u.current_occupancy || 0),
                h('td', null, u.capacity > 0 ? h('span', { style: { color: Domain.taxaUsoColor(taxa) } }, taxa + '%') : '—')
              );
            })
          )
        )
      )
    )
  );
};
