// SGUA — Página de Transparência

var PgTransparencia = function(props) {
  var uns = props.uns || [], news = props.news || [];

  function exportXLSX(data, name) {
    var ws = XLSX.utils.json_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, name + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  function exportUnidades() {
    var data = uns.map(function(u) {
      var d = Domain.formatUnidade(u);
      return {
        ID: d.id, Nome: d.nome, Tipo: d.tipo, Município: d.municipio,
        Status: Domain.statusLabel(d.status), Capacidade: d.capacidade,
        Ocupação: d.ocupacao, 'Taxa de Uso (%)': d.taxa, Descrição: d.descricao
      };
    });
    exportXLSX(data, 'SGUA_Unidades');
  }

  function exportNoticias() {
    var data = (news || []).filter(function(n) { return n.visivel !== false; }).map(function(n) {
      return {
        ID: n.id, Título: n.titulo || n.title, Categoria: n.categoria || n.category,
        Fonte: n.fonte || n.source, Data: Utils.fmtDate(n.data || n.created_at),
        Destaque: n.destaque ? 'Sim' : 'Não', Tipo: n.is_rss ? 'RSS' : 'Manual'
      };
    });
    exportXLSX(data, 'SGUA_Noticias');
  }

  var ativas = uns.filter(function(u) { return u.status === 'active' || u.status === 'ativo'; });
  var cimas = uns.filter(function(u) { return !/^UGAI/i.test(u.name || u.nome || ''); });
  var ugais = uns.filter(function(u) { return /^UGAI/i.test(u.name || u.nome || ''); });

  return h('div', null,
    h('div', { style: { background: C.g0, color: '#fff', padding: '32px 24px', textAlign: 'center' } },
      h('h1', { style: { fontSize: 26, fontWeight: 800, marginBottom: 8 } }, '📊 Transparência'),
      h('p', { style: { fontSize: 15, opacity: .8 } }, 'Dados públicos do sistema de gestão de unidades da SEMA/AC')
    ),
    h('div', { className: 'section' },
      h('div', { className: 'grid-4', style: { marginBottom: 24 } },
        h(StatCard, { value: uns.length, label: 'Total de unidades', icon: '🏠', color: C.g2 }),
        h(StatCard, { value: ativas.length, label: 'Unidades ativas', icon: '✅', color: C.g1 }),
        h(StatCard, { value: cimas.length, label: 'CIMAs', icon: '🌲', color: '#1565c0' }),
        h(StatCard, { value: ugais.length, label: 'UGAIs', icon: '🌊', color: '#6a1b9a' })
      ),

      h('div', { className: 'grid-2' },
        h('div', { className: 'card' },
          h('div', { className: 'card-title' }, '🏠 Unidades'),
          h('p', { style: { fontSize: 14, color: C.cm, marginBottom: 16 } }, 'Lista completa de todas as unidades cadastradas no sistema, com localização, capacidade e status.'),
          h('button', { className: 'w-full', onClick: exportUnidades }, '📥 Baixar XLSX — Unidades (' + uns.length + ')'),
          h('hr', { className: 'divider' }),
          h('div', { className: 'table-wrap' },
            h('table', null,
              h('thead', null, h('tr', null,
                h('th', null, 'Nome'), h('th', null, 'Tipo'), h('th', null, 'Status'), h('th', null, 'Capacidade')
              )),
              h('tbody', null,
                uns.slice(0, 10).map(function(u) {
                  var d = Domain.formatUnidade(u);
                  return h('tr', { key: u.id },
                    h('td', null, d.nome),
                    h('td', null, h(Badge, { color: 'blue' }, d.tipo)),
                    h('td', null, h(Badge, { color: Domain.statusColor(d.status) }, Domain.statusLabel(d.status))),
                    h('td', null, d.capacidade || '∞')
                  );
                }),
                uns.length > 10 && h('tr', null, h('td', { colSpan: 4, style: { textAlign: 'center', color: C.cm, fontSize: 13 } }, '… e mais ' + (uns.length - 10) + ' no arquivo Excel'))
              )
            )
          )
        ),

        h('div', { className: 'card' },
          h('div', { className: 'card-title' }, '📰 Notícias'),
          h('p', { style: { fontSize: 14, color: C.cm, marginBottom: 16 } }, 'Publicações recentes sobre meio ambiente, fiscalização e programas da SEMA/AC.'),
          h('button', { className: 'w-full', onClick: exportNoticias }, '📥 Baixar XLSX — Notícias (' + news.length + ')'),
          h('hr', { className: 'divider' }),
          h('div', { className: 'table-wrap' },
            h('table', null,
              h('thead', null, h('tr', null,
                h('th', null, 'Título'), h('th', null, 'Categoria'), h('th', null, 'Data')
              )),
              h('tbody', null,
                news.slice(0, 10).map(function(n) {
                  return h('tr', { key: n.id },
                    h('td', null, Utils.truncate(n.titulo || n.title || '', 60)),
                    h('td', null, n.categoria || n.category || 'Geral'),
                    h('td', null, Utils.fmtDate(n.data || n.created_at))
                  );
                }),
                news.length > 10 && h('tr', null, h('td', { colSpan: 3, style: { textAlign: 'center', color: C.cm, fontSize: 13 } }, '… e mais ' + (news.length - 10) + ' no arquivo Excel'))
              )
            )
          )
        )
      )
    )
  );
};
