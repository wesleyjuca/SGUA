// SGUA — Página Notícias (pública)

var PgNoticias = function(props) {
  var news = (props.news || []).filter(function(n) { return n.visivel !== false; });
  var [busca, setBusca] = React.useState('');
  var [cat, setCat] = React.useState('');
  var [page, setPage] = React.useState(1);
  var PAGE_SIZE = 10;

  var cats = ['Geral', 'Fiscalização', 'Legislação', 'Parceria', 'Programa REM', 'Evento', 'Capacitação', 'Gestão', 'Monitoramento'];

  var filtradas = news.filter(function(n) {
    var q = busca.toLowerCase();
    var titulo = (n.titulo || n.title || '').toLowerCase();
    var matchQ = !q || titulo.includes(q) || (n.resumo || '').toLowerCase().includes(q);
    var matchCat = !cat || (n.categoria || n.category || '') === cat;
    return matchQ && matchCat;
  });

  var pages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  var slice = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function resetPage() { setPage(1); }

  return h('div', null,
    h('div', { style: { background: C.g0, color: '#fff', padding: '32px 24px', textAlign: 'center' } },
      h('h1', { style: { fontSize: 26, fontWeight: 800, marginBottom: 8 } }, '📰 Notícias'),
      h('p', { style: { fontSize: 15, opacity: .8 } }, 'Informações sobre meio ambiente, gestão e fiscalização ambiental')
    ),
    h('div', { className: 'section' },
      h('div', { style: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' } },
        h(SearchInput, { value: busca, onChange: function(v) { setBusca(v); resetPage(); }, placeholder: 'Buscar notícias…', maxWidth: 280 }),
        h('select', { value: cat, onChange: function(e) { setCat(e.target.value); resetPage(); }, style: { width: 'auto', minWidth: 160 } },
          h('option', { value: '' }, 'Todas as categorias'),
          cats.map(function(c) { return h('option', { key: c, value: c }, c); })
        ),
        h('span', { style: { fontSize: 13, color: C.cm } }, filtradas.length + ' notícia' + (filtradas.length !== 1 ? 's' : ''))
      ),
      slice.length === 0
        ? h(EmptyState, { icon: '📰', title: 'Nenhuma notícia encontrada', desc: busca || cat ? 'Tente outros filtros.' : 'As notícias aparecerão aqui em breve.' })
        : h('div', null,
            slice.map(function(n) {
              var titulo = n.titulo || n.title || '';
              var resumo = n.resumo || (n.conteudo || '').replace(/<[^>]+>/g, '').slice(0, 150);
              return h('article', { key: n.id, className: 'news-card' },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 } },
                  h('h2', { style: { fontSize: 16, fontWeight: 700, marginBottom: 6, flex: 1 } },
                    n.link
                      ? h('a', { href: n.link, target: '_blank', rel: 'noreferrer noopener', style: { color: C.g0, textDecoration: 'none' } }, titulo)
                      : titulo
                  ),
                  n.destaque && h(Badge, { color: 'yellow' }, '⭐ Destaque'),
                  n.is_rss && h(Badge, { color: 'blue' }, 'RSS')
                ),
                resumo && h('p', { style: { fontSize: 13, color: C.cm, margin: '4px 0 8px', lineHeight: 1.6 } }, resumo),
                h('div', { className: 'news-card-meta' },
                  h('span', null, '📅 ' + Utils.fmtDate(n.data || n.created_at)),
                  (n.categoria || n.category) && h('span', null, '🏷 ' + (n.categoria || n.category)),
                  (n.fonte || n.source) && h('span', null, '🔗 ' + (n.fonte || n.source))
                )
              );
            }),
            h(Pagination, { page: page, pages: pages, onChange: setPage })
          )
    )
  );
};
