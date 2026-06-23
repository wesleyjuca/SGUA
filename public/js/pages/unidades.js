// SGUA — Páginas de Unidades (PgCima, PgUgai, PageUnidade)

function renderUnidadesList(uns, tipo, nav, isMobile) {
  var [busca, setBusca] = React.useState('');
  var filtradas = uns.filter(function(u) {
    var nome = (u.name || u.nome || '').toLowerCase();
    var mun = (u.address || u.municipio || '').toLowerCase();
    var q = busca.toLowerCase();
    return (!q || nome.includes(q) || mun.includes(q));
  });

  return h('div', null,
    h('div', { style: { background: C.g0, color: '#fff', padding: '32px 24px', textAlign: 'center' } },
      h('h1', { style: { fontSize: 26, fontWeight: 800, marginBottom: 8 } }, tipo === 'CIMA' ? '🌲 Casas de Internação do Meio Ambiente' : '🌊 Unidades de Gestão Ambiental Integrada'),
      h('p', { style: { fontSize: 15, opacity: .8 } }, 'Unidades da SEMA/AC em todo o estado do Acre')
    ),
    h('div', { className: 'section' },
      h('div', { style: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' } },
        h(SearchInput, { value: busca, onChange: setBusca, placeholder: 'Buscar por nome ou município…', maxWidth: 320 }),
        h('span', { style: { fontSize: 13, color: C.cm } }, filtradas.length + ' resultado' + (filtradas.length !== 1 ? 's' : ''))
      ),
      filtradas.length === 0
        ? h(EmptyState, { icon: '🔍', title: 'Nenhuma unidade encontrada', desc: busca ? 'Tente outro termo de busca.' : 'Nenhuma unidade cadastrada ainda.' })
        : h('div', { className: 'grid-3' },
            filtradas.map(function(u) {
              var d = Domain.formatUnidade(u);
              return h('div', { key: u.id, className: 'unit-card', onClick: function() { nav('unidade', String(u.id)); } },
                d.foto
                  ? h('img', { src: d.foto, alt: d.nome, className: 'unit-card-img', style: { display: 'block' }, onError: function(e) { e.target.style.display = 'none'; } })
                  : h('div', { className: 'unit-card-img', style: { background: C.g3, color: C.g1, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, tipo === 'CIMA' ? '🌲' : '🌊'),
                h('div', { className: 'unit-card-body' },
                  h('div', { className: 'unit-card-name' }, d.nome),
                  h('div', { className: 'unit-card-meta' },
                    d.municipio && h('span', null, '📍 ' + d.municipio),
                    h('br', null),
                    h(Badge, { color: Domain.statusColor(d.status) }, Domain.statusLabel(d.status)),
                    d.capacidade > 0 && h('span', { style: { marginLeft: 6, fontSize: 12, color: C.cm } }, d.taxa + '% uso')
                  )
                )
              );
            })
          )
    )
  );
}

var PgCima = function(props) {
  var uns = (props.uns || []).filter(function(u) { return !/^UGAI/i.test(u.name || u.nome || ''); });
  return renderUnidadesList(uns, 'CIMA', props.nav, props.isMobile);
};

var PgUgai = function(props) {
  var uns = (props.uns || []).filter(function(u) { return /^UGAI/i.test(u.name || u.nome || ''); });
  return renderUnidadesList(uns, 'UGAI', props.nav, props.isMobile);
};

var PageUnidade = function(props) {
  var id = props.id, uns = props.uns || [], nav = props.nav;
  var unidade = uns.find(function(u) { return String(u.id) === String(id); });

  if (!unidade) {
    return h('div', { className: 'section' },
      h(EmptyState, { icon: '🔍', title: 'Unidade não encontrada', desc: 'O ID informado não corresponde a nenhuma unidade.',
        action: h('button', { onClick: function() { nav('home'); } }, 'Voltar ao início') })
    );
  }

  var d = Domain.formatUnidade(unidade);
  var tipo = d.tipo;

  return h('div', null,
    h('div', { style: { background: C.g0, color: '#fff', padding: '24px', display: 'flex', alignItems: 'center', gap: 16 } },
      h('button', { style: { background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }, onClick: function() { nav(tipo === 'UGAI' ? 'ugai' : 'cima'); } }, '← Voltar'),
      h('div', null,
        h('h1', { style: { fontSize: 22, fontWeight: 800 } }, d.nome),
        d.municipio && h('p', { style: { fontSize: 14, opacity: .8, marginTop: 4 } }, '📍 ' + d.municipio)
      )
    ),
    h('div', { className: 'section' },
      h('div', { style: { display: 'grid', gridTemplateColumns: props.isMobile ? '1fr' : '1fr 1fr', gap: 20 } },
        h('div', null,
          d.foto && h('img', { src: d.foto, alt: d.nome, style: { width: '100%', borderRadius: 12, maxHeight: 280, objectFit: 'cover', marginBottom: 16 } }),
          h('div', { className: 'card' },
            h('div', { className: 'card-title' }, 'ℹ Informações'),
            h('table', { style: { width: '100%', fontSize: 14, borderCollapse: 'collapse' } },
              h('tbody', null,
                [
                  ['Tipo', tipo],
                  ['Status', h(Badge, { color: Domain.statusColor(d.status) }, Domain.statusLabel(d.status))],
                  d.capacidade > 0 && ['Capacidade', d.capacidade + ' vagas'],
                  d.capacidade > 0 && ['Ocupação', d.ocupacao + ' / ' + d.capacidade + ' (' + d.taxa + '%)'],
                  d.contato.nome && ['Responsável', d.contato.nome],
                  d.contato.email && ['E-mail', h('a', { href: 'mailto:' + d.contato.email }, d.contato.email)],
                  d.contato.tel && ['Telefone', d.contato.tel]
                ].filter(Boolean).map(function(row, i) {
                  return h('tr', { key: i },
                    h('td', { style: { padding: '8px 0', fontWeight: 600, color: C.cm, width: '40%', borderBottom: '1px solid ' + C.cl } }, row[0]),
                    h('td', { style: { padding: '8px 0', borderBottom: '1px solid ' + C.cl } }, row[1])
                  );
                })
              )
            )
          )
        ),
        h('div', null,
          d.descricao && h('div', { className: 'card' },
            h('div', { className: 'card-title' }, '📝 Descrição'),
            h('p', { style: { fontSize: 14, lineHeight: 1.7, color: '#374151' } }, d.descricao)
          ),
          (d.lat && d.lng) && h('div', { className: 'card', style: { padding: 8 } },
            h(MapaLeaflet, { uns: [unidade], height: 240 })
          ),
          h('div', { className: 'card' },
            h('div', { className: 'card-title' }, '📋 Ações'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              h('button', { className: 'w-full', onClick: function() { nav('solicitacao'); } }, '📋 Solicitar uso desta unidade'),
              h('button', { className: 'ghost w-full', onClick: function() { nav('mapa'); } }, '🗺 Ver no mapa')
            )
          )
        )
      )
    )
  );
};
