// SGUA — Admin: Dashboard

function AdminDash(props) {
  var uns = props.uns||[], news = props.news||[], sols = props.sols||[], users = props.users||[];
  var ativos = uns.filter(function(u){return u.status==='ativo';}).length;
  var pendentes = sols.filter(function(s){return (s.status||s.st)==='pendente';}).length;
  var alertas = uns.filter(function(u){return (u.taxa_uso||u.taxaUso||0) >= 80;});

  return h('div', { style:{ display:'flex', flexDirection:'column', gap:24 } },
    h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd } }, 'Dashboard'),

    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:16 } },
      h(StatBox, { val:uns.length,    label:'Unidades',           bg:C.gx, color:C.g1 }),
      h(StatBox, { val:ativos,        label:'Ativas',             bg:C.gx, color:C.g2 }),
      h(StatBox, { val:pendentes,     label:'Solicitações Pend.', bg:C.al, color:C.am }),
      h(StatBox, { val:news.length,   label:'Notícias',           bg:C.bl, color:C.b1 }),
      h(StatBox, { val:users.length,  label:'Usuários',           bg:C.px, color:C.pm })
    ),

    alertas.length > 0 && h(Card, { style:{ border:'1px solid '+C.al } },
      h('h3', { style:{ color:C.am, fontWeight:700, marginBottom:12 } }, '⚠ Unidades com alta ocupação (≥ 80%)'),
      alertas.map(function(u) {
        return h('div', { key:u.id, style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid '+C.cx } },
          h('span', { style:{ fontWeight:600 } }, u.nome),
          h('div', { style:{ display:'flex', gap:10, alignItems:'center' } },
            h(Bar, { pct:u.taxa_uso||u.taxaUso||0 }),
            h('span', { style:{ fontWeight:700, color:C.rm, minWidth:36 } }, (u.taxa_uso||u.taxaUso||0) + '%')
          )
        );
      })
    ),

    pendentes > 0 && h(Card, { style:{ border:'1px solid '+C.gl } },
      h('h3', { style:{ color:C.g1, fontWeight:700, marginBottom:4 } }, '📋 ' + pendentes + ' solicitação(ões) pendente(s)'),
      h('p', { style:{ color:C.cm, fontSize:13 } }, 'Acesse a aba Solicitações para aprovar ou rejeitar.')
    )
  );
}
