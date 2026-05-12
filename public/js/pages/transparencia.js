// SGUA — Página de Transparência

function PgTransparencia(props) {
  var uns = props.uns || [], sols = props.sols || [];
  var ativos = uns.filter(function(u){return u.status==='ativo';}).length;
  var manut  = uns.filter(function(u){return u.status==='manutencao';}).length;
  var inat   = uns.filter(function(u){return u.status==='inativo';}).length;
  var aprv   = sols.filter(function(s){return (s.status||s.st)==='aprovada';}).length;
  var pend   = sols.filter(function(s){return (s.status||s.st)==='pendente';}).length;
  var rej    = sols.filter(function(s){return (s.status||s.st)==='rejeitada';}).length;
  var mediaUso = uns.length ? Math.round(uns.reduce(function(a,u){return a+(u.taxa_uso||u.taxaUso||0);},0)/uns.length) : 0;

  return h('div', { style:{ maxWidth:1000, margin:'0 auto', padding:'40px 24px' } },
    h('h1', { style:{ fontSize:24, fontWeight:800, color:C.cd, marginBottom:8 } }, '📊 Transparência'),
    h('p', { style:{ color:C.cm, marginBottom:32, fontSize:14 } }, 'Dados públicos sobre as unidades CIMA e UGAI do estado do Acre.'),

    h('h2', { style:{ fontSize:17, fontWeight:700, color:C.cd, marginBottom:16 } }, 'Unidades'),
    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:16, marginBottom:32 } },
      h(StatBox, { val:uns.length, label:'Total', bg:C.gx, color:C.g1 }),
      h(StatBox, { val:ativos, label:'Ativas', bg:C.gx, color:C.g2 }),
      h(StatBox, { val:manut, label:'Em Manutenção', bg:C.al, color:C.am }),
      h(StatBox, { val:inat, label:'Inativas', bg:C.rl, color:C.rm }),
      h(StatBox, { val:mediaUso+'%', label:'Média de Uso', bg:C.bl, color:C.b1 })
    ),

    h('h2', { style:{ fontSize:17, fontWeight:700, color:C.cd, marginBottom:16 } }, 'Solicitações'),
    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:16, marginBottom:32 } },
      h(StatBox, { val:sols.length, label:'Total', bg:C.gx, color:C.g1 }),
      h(StatBox, { val:aprv, label:'Aprovadas', bg:C.gx, color:C.g2 }),
      h(StatBox, { val:pend, label:'Pendentes', bg:C.al, color:C.am }),
      h(StatBox, { val:rej, label:'Rejeitadas', bg:C.rl, color:C.rm })
    ),

    h('h2', { style:{ fontSize:17, fontWeight:700, color:C.cd, marginBottom:16 } }, 'Distribuição por Tipo'),
    h(Card, null,
      h('table', null,
        h('thead', null, h('tr', null,
          h('th', null, 'Tipo'), h('th', null, 'Qtd'), h('th', null, 'Ativas'), h('th', null, 'Média Uso')
        )),
        h('tbody', null,
          ['CIMA','UGAI'].map(function(tipo) {
            var lista = uns.filter(function(u){return u.tipo===tipo;});
            var ativosT = lista.filter(function(u){return u.status==='ativo';}).length;
            var mediaT = lista.length ? Math.round(lista.reduce(function(a,u){return a+(u.taxa_uso||u.taxaUso||0);},0)/lista.length) : 0;
            return h('tr', { key:tipo },
              h('td', null, h('strong', null, tipo)),
              h('td', null, lista.length),
              h('td', null, ativosT),
              h('td', null, mediaT + '%')
            );
          })
        )
      )
    )
  );
}
