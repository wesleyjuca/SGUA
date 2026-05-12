// SGUA — Página Home

function SecNoticias(props) {
  var news = (props.news || []).filter(function(n) { return n.visivel !== false; }).slice(0, 6);
  if (!news.length) return null;
  return h('section', { style:{ padding:'32px 0' } },
    h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd, marginBottom:20 } }, '📰 Notícias Recentes'),
    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 } },
      news.map(function(n) {
        return h(Card, { key:n.id, p:16 },
          n.destaque && h(Pill, { bg:C.al, color:C.am }, '⭐ Destaque'),
          h('div', { style:{ fontWeight:700, fontSize:15, marginTop:8, color:C.cd } }, n.titulo),
          h('div', { style:{ color:C.cm, fontSize:13, marginTop:6, lineHeight:1.5 } }, n.resumo),
          h('div', { style:{ display:'flex', justifyContent:'space-between', marginTop:12, fontSize:12, color:C.cm } },
            h('span', null, n.categoria),
            h('span', null, formatData(n.data))
          )
        );
      })
    )
  );
}

function PgHome(props) {
  var uns = props.uns || [], news = props.news || [], secs = props.secs || {}, go = props.go;
  var ativos = uns.filter(function(u) { return u.status === 'ativo'; }).length;
  var cimas  = uns.filter(function(u) { return u.tipo === 'CIMA'; }).length;
  var ugais  = uns.filter(function(u) { return u.tipo === 'UGAI'; }).length;
  var mediaUso = uns.length ? Math.round(uns.reduce(function(a, u) { return a + (u.taxa_uso || u.taxaUso || 0); }, 0) / uns.length) : 0;

  return h('div', null,
    secs.hero !== false && h('div', { style:{ background:'linear-gradient(135deg,'+C.g1+','+C.g3+')', color:'#fff', padding:'60px 24px', textAlign:'center' } },
      h('h1', { style:{ fontSize:32, fontWeight:800, marginBottom:12 } }, '🌿 SEMA/AC — CIMA & UGAI'),
      h('p', { style:{ fontSize:16, opacity:.85, maxWidth:540, margin:'0 auto' } }, 'Sistema de Gestão das Unidades de Conservação e Apoio Ambiental do Estado do Acre')
    ),

    h('div', { style:{ maxWidth:1200, margin:'0 auto', padding:'32px 24px' } },
      secs.bloco !== false && h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:16, marginBottom:32 } },
        h(StatBox, { val:uns.length, label:'Total de Unidades', bg:C.gx, color:C.g1 }),
        h(StatBox, { val:ativos, label:'Unidades Ativas', bg:C.gx, color:C.g2 }),
        h(StatBox, { val:cimas, label:'CIMA', bg:C.bl, color:C.b1 }),
        h(StatBox, { val:ugais, label:'UGAI', bg:C.tl, color:C.t1 }),
        h(StatBox, { val:mediaUso+'%', label:'Média de Uso', bg:C.al, color:C.am })
      ),

      secs.acesso !== false && h('div', { style:{ marginBottom:32 } },
        h('h2', { style:{ fontSize:18, fontWeight:700, marginBottom:16, color:C.cd } }, 'Acesso Rápido'),
        h('div', { style:{ display:'flex', gap:12, flexWrap:'wrap' } },
          [['cima','🏛 Unidades CIMA',C.g1],['ugai','🏢 Unidades UGAI',C.b1],['mapa','🗺 Ver no Mapa',C.am],['sol','📋 Solicitação',C.pm]].map(function(item) {
            return h('button', { key:item[0], onClick:function(){go(item[0]);}, style:{ background:item[2], color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontWeight:600, cursor:'pointer' } }, item[1]);
          })
        )
      ),

      secs.mapa !== false && h('div', { style:{ marginBottom:32 } },
        h('h2', { style:{ fontSize:18, fontWeight:700, marginBottom:12, color:C.cd } }, '🗺 Localização das Unidades'),
        h(MapView, { units:uns, compact:true })
      ),

      secs.news !== false && h(SecNoticias, { news:news })
    )
  );
}
