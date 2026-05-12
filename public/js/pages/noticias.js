// SGUA — Página pública de notícias

function PgNoticias(props) {
  var news = props.news || [];
  var uns = props.uns || [];
  var [busca, setBusca] = React.useState('');
  var [cat, setCat] = React.useState('');

  var visiveis = news.filter(function(n){ return n.visivel !== false; });

  var categorias = React.useMemo(function() {
    var cats = [];
    visiveis.forEach(function(n){ if (n.categoria && cats.indexOf(n.categoria) === -1) cats.push(n.categoria); });
    return cats.sort();
  }, [visiveis]);

  var filtered = React.useMemo(function() {
    return visiveis.filter(function(n) {
      var matchCat = !cat || n.categoria === cat;
      var matchBusca = !busca || (n.titulo||'').toLowerCase().includes(busca.toLowerCase()) || (n.resumo||'').toLowerCase().includes(busca.toLowerCase());
      return matchCat && matchBusca;
    });
  }, [visiveis, cat, busca]);

  return h('div', { style:{ maxWidth:900, margin:'0 auto', padding:'32px 24px' } },
    h('h1', { style:{ fontSize:26, fontWeight:800, color:C.cd, marginBottom:8 } }, 'Notícias'),
    h('p', { style:{ color:C.cm, marginBottom:24 } }, 'Acompanhe as novidades da SEMA/AC.'),

    h('div', { style:{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:28 } },
      h('input', { type:'text', value:busca, onChange:function(e){setBusca(e.target.value);}, placeholder:'Buscar notícias…', style:{ flex:1, minWidth:200 } }),
      h('select', { value:cat, onChange:function(e){setCat(e.target.value);}, style:{ padding:'8px 12px', border:'1px solid '+C.cl, borderRadius:8, fontSize:13, width:'auto' } },
        h('option', { value:'' }, 'Todas as categorias'),
        categorias.map(function(c){ return h('option', { key:c, value:c }, c); })
      )
    ),

    filtered.length === 0 && h('p', { style:{ color:C.cm, padding:'20px 0' } }, 'Nenhuma notícia encontrada.'),

    h('div', { style:{ display:'flex', flexDirection:'column', gap:20 } },
      filtered.map(function(n) {
        var unNome = uns.find(function(u){ return String(u.id) === String(n.unidade); });
        return h(Card, { key:n.id, p:20 },
          h('div', { style:{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 } },
            n.destaque && h(Pill, { bg:C.al, color:C.am }, '⭐ Destaque'),
            n.categoria && h(Pill, { bg:C.gx, color:C.g2 }, n.categoria),
            h('span', { style:{ fontSize:12, color:C.cm } }, formatData(n.data))
          ),
          h('h2', { style:{ fontSize:18, fontWeight:700, color:C.cd, marginBottom:8 } }, n.titulo),
          n.resumo && h('p', { style:{ color:C.cm, fontSize:14, lineHeight:1.6, marginBottom:10 } }, n.resumo),
          h('div', { style:{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:C.cm } },
            n.autor && h('span', null, '✍ ' + n.autor),
            n.fonte && h('span', null, '📰 ' + n.fonte),
            unNome && h('span', null, '🏛 ' + unNome.nome)
          )
        );
      })
    )
  );
}
