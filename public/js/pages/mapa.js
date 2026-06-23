// SGUA — Página Mapa

var PgMapa = function(props) {
  var uns = props.uns || [], nav = props.nav;
  var [filtro, setFiltro] = React.useState('');
  var [tipo, setTipo] = React.useState('');

  var filtradas = uns.filter(function(u) {
    var nome = (u.name || u.nome || '').toLowerCase();
    var mun = (u.address || u.municipio || '').toLowerCase();
    var q = filtro.toLowerCase();
    var matchQ = !q || nome.includes(q) || mun.includes(q);
    var matchTipo = !tipo || (tipo === 'UGAI' ? /^ugai/i.test(u.name || u.nome) : !/^ugai/i.test(u.name || u.nome));
    return matchQ && matchTipo;
  });

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
    h('div', { style: { background: C.g0, color: '#fff', padding: '20px 24px' } },
      h('h1', { style: { fontSize: 22, fontWeight: 800, marginBottom: 4 } }, '🗺 Mapa das Unidades'),
      h('p', { style: { fontSize: 14, opacity: .8 } }, 'Clique em um marcador para ver detalhes da unidade')
    ),
    h('div', { style: { background: '#fff', padding: '12px 20px', borderBottom: '1px solid ' + C.cl, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' } },
      h(SearchInput, { value: filtro, onChange: setFiltro, placeholder: 'Filtrar unidades…' }),
      h('select', { value: tipo, onChange: function(e) { setTipo(e.target.value); }, style: { width: 'auto', minWidth: 120 } },
        h('option', { value: '' }, 'Todos os tipos'),
        h('option', { value: 'CIMA' }, 'CIMA'),
        h('option', { value: 'UGAI' }, 'UGAI')
      ),
      h('span', { style: { fontSize: 13, color: C.cm } }, filtradas.length + ' unidade' + (filtradas.length !== 1 ? 's' : '') + ' exibida' + (filtradas.length !== 1 ? 's' : ''))
    ),
    h('div', { style: { flex: 1, minHeight: 'calc(100vh - 180px)' } },
      h(MapaLeaflet, { uns: filtradas, height: 'calc(100vh - 180px)', onSelect: function(id) { nav('unidade', String(id)); } })
    )
  );
};
