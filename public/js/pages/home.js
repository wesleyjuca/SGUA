// SGUA — Página Inicial

var PgHome = function(props) {
  var uns = props.uns || [], news = props.news || [], nav = props.nav, isMobile = props.isMobile;

  var ativas = uns.filter(function(u) { return u.status === 'active' || u.status === 'ativo'; });
  var destaques = news.filter(function(n) { return n.destaque; }).slice(0, 3);
  var recentes = news.filter(function(n) { return n.visivel !== false; }).slice(0, 4);
  var cimas = uns.filter(function(u) { return !/^UGAI/i.test(u.name || u.nome || ''); });
  var ugais = uns.filter(function(u) { return /^UGAI/i.test(u.name || u.nome || ''); });

  return h('div', null,
    // Hero
    h('section', { className: 'hero' },
      h('div', { style: { maxWidth: 640, margin: '0 auto' } },
        h('div', { style: { fontSize: 48, marginBottom: 12 } }, '🌿'),
        h('h1', { className: 'hero-title' }, 'CIMA & UGAI — SEMA/AC'),
        h('p', { className: 'hero-sub' }, 'Sistema de Gestão das Casas de Internação do Meio Ambiente e das Unidades de Gestão Ambiental Integrada do Acre'),
        h('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 } },
          h('button', { onClick: function() { nav('mapa'); }, style: { background: 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.5)', color: '#fff' } }, '🗺 Ver no Mapa'),
          h('button', { onClick: function() { nav('solicitacao'); }, style: { background: '#fff', color: C.g0 } }, '📋 Solicitar Uso')
        )
      )
    ),

    // Estatísticas
    h('section', { className: 'section' },
      h('div', { className: 'grid-4', style: { marginBottom: 8 } },
        h(StatCard, { value: uns.length, label: 'Unidades cadastradas', icon: '🏠', color: C.g2 }),
        h(StatCard, { value: ativas.length, label: 'Unidades ativas', icon: '✅', color: C.g1 }),
        h(StatCard, { value: cimas.length, label: 'CIMAs', icon: '🌲', color: '#1565c0' }),
        h(StatCard, { value: ugais.length, label: 'UGAIs', icon: '🌊', color: '#6a1b9a' })
      )
    ),

    // Mapa resumido
    uns.length > 0 && h('section', { className: 'section', style: { paddingTop: 0 } },
      h('h2', { className: 'section-title' }, '🗺 Localização das Unidades'),
      h('div', { className: 'card', style: { padding: 8 } },
        h(MapaLeaflet, { uns: uns, height: 340, onSelect: function(id) { nav('unidade', String(id)); } })
      ),
      h('div', { style: { textAlign: 'right', marginTop: 8 } },
        h('button', { className: 'ghost', onClick: function() { nav('mapa'); } }, 'Ver mapa completo →')
      )
    ),

    // Destaque + Notícias
    h('section', { className: 'section', style: { paddingTop: 0 } },
      h('div', { style: { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 20, alignItems: 'start' } },
        h('div', null,
          h('h2', { className: 'section-title' }, '📰 Notícias Recentes'),
          recentes.length === 0
            ? h(EmptyState, { icon: '📰', title: 'Sem notícias ainda', desc: 'As notícias aparecerão aqui quando forem cadastradas.' })
            : recentes.map(function(n) {
                return h('div', { key: n.id, className: 'news-card', onClick: function() { nav('noticias'); }, style: { cursor: 'pointer' } },
                  h('div', { className: 'news-card-title' }, n.titulo || n.title || ''),
                  h('p', { style: { fontSize: 13, color: C.cm, margin: '4px 0 8px' } }, Utils.truncate(n.resumo || n.conteudo || '', 120)),
                  h('div', { className: 'news-card-meta' },
                    h('span', null, Utils.fmtDate(n.data || n.created_at)),
                    n.categoria && h('span', null, n.categoria),
                    n.fonte && h('span', null, n.fonte)
                  )
                );
              }),
          recentes.length > 0 && h('div', { style: { marginTop: 12 } },
            h('button', { className: 'ghost', onClick: function() { nav('noticias'); } }, 'Ver todas as notícias →')
          )
        ),
        h('div', null,
          h('h2', { className: 'section-title' }, '🔗 Acesso Rápido'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            [
              { label: 'Unidades CIMA', id: 'cima', icon: '🌲' },
              { label: 'Unidades UGAI', id: 'ugai', icon: '🌊' },
              { label: 'Mapa Interativo', id: 'mapa', icon: '🗺' },
              { label: 'Transparência', id: 'transparencia', icon: '📊' },
              { label: 'Solicitar Uso de Unidade', id: 'solicitacao', icon: '📋' }
            ].map(function(item) {
              return h('button', { key: item.id, className: 'ghost w-full', style: { justifyContent: 'flex-start', gap: 10 }, onClick: function() { nav(item.id); } },
                h('span', null, item.icon), item.label
              );
            })
          )
        )
      )
    )
  );
};
