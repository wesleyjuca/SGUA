// SGUA — Páginas CIMA, UGAI e detalhe de unidade

function PainelOcupacao(props) {
  var un = props.un, onRefresh = props.onRefresh;
  var [nome, setNome] = React.useState('');
  var [tipo, setTipo] = React.useState('');
  var [loading, setLoading] = React.useState(false);
  var [err, setErr] = React.useState('');
  var orgaos = un.orgaosPresentes || [];
  var ativos = orgaos.filter(function(o){return o.ativo;});

  async function registrar() {
    setErr('');
    var res = await approveUso(un.id, { nome:nome, tipo:tipo });
    if (!res.ok) { setErr(res.err); return; }
    setNome(''); setTipo('');
    if (onRefresh) onRefresh();
  }

  async function remover(orgId) {
    setLoading(true);
    await leaveUso(un.id, orgId);
    setLoading(false);
    if (onRefresh) onRefresh();
  }

  return h('div', { style:{ display:'flex', flexDirection:'column', gap:16 } },
    h('div', { style:{ display:'flex', gap:12 } },
      h(StatBox, { val:ativos.length, label:'Órgãos ativos', bg:C.gx, color:C.g1 }),
      h(StatBox, { val:orgaos.filter(function(o){return !o.ativo;}).length, label:'Histórico', bg:C.cx, color:C.cm })
    ),

    h(Card, { p:16 },
      h('h3', { style:{ fontWeight:700, marginBottom:12, color:C.cd } }, '+ Registrar Órgão'),
      err && h('div', { style:{ background:C.rl, color:C.rm, borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:13 } }, err),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:10, alignItems:'end' } },
        h('div', null,
          h('label', { style:{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 } }, 'Órgão / Organização *'),
          h('input', { type:'text', value:nome, onChange:function(e){setNome(e.target.value);}, placeholder:'Nome do órgão' })
        ),
        h('div', null,
          h('label', { style:{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 } }, 'Tipo de uso *'),
          h('input', { type:'text', value:tipo, onChange:function(e){setTipo(e.target.value);}, placeholder:'Ex: Administrativo' })
        ),
        h('button', { onClick:registrar, disabled:!nome||!tipo, style:{ background:C.g2, color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' } }, 'Registrar')
      )
    ),

    ativos.length > 0 && h(Card, { p:16 },
      h('h3', { style:{ fontWeight:700, marginBottom:12, color:C.cd } }, 'Órgãos Presentes'),
      ativos.map(function(o) {
        return h('div', { key:o.id, style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid '+C.cl } },
          h('div', null,
            h('div', { style:{ fontWeight:600, fontSize:14 } }, o.nome),
            h('div', { style:{ fontSize:12, color:C.cm } }, o.tipo + ' · Desde ' + formatData(o.data_entrada))
          ),
          h('button', { onClick:function(){remover(o.id);}, disabled:loading, style:{ background:C.rl, color:C.rm, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer' } }, 'Desocupar')
        );
      })
    ),

    orgaos.filter(function(o){return !o.ativo;}).length > 0 && h('details', null,
      h('summary', { style:{ cursor:'pointer', fontSize:13, color:C.cm, padding:'8px 0' } }, 'Ver histórico de ocupações'),
      h('div', { style:{ marginTop:8 } },
        orgaos.filter(function(o){return !o.ativo;}).map(function(o) {
          return h('div', { key:o.id, style:{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid '+C.cx, fontSize:13, color:C.cm } },
            h('span', null, o.nome + ' (' + o.tipo + ')'),
            h('span', null, formatData(o.data_entrada) + ' → ' + formatData(o.data_saida))
          );
        })
      )
    )
  );
}

function PageUnidade(props) {
  var id = props.id, uns = props.uns, nav = props.nav, curUser = props.curUser;
  var [aba, setAba] = React.useState('sobre');
  var seed = uns && uns.find(function(u){ return String(u.id) === String(id); });
  var [unidade, setUnidade] = React.useState(seed || null);
  var [loading, setLoading] = React.useState(!seed);

  React.useEffect(function() {
    if (!id) return;
    async function load() {
      setLoading(true);
      var r = await API.Unidades.get(id);
      if (r.ok) setUnidade(r.unidade);
      setLoading(false);
    }
    load();
  }, [id]);

  function onBack() { window.history.back(); }

  async function refresh() {
    var r = await API.Unidades.get(id);
    if (r.ok) setUnidade(r.unidade);
  }

  if (loading) return h('div', { style:{ padding:40, textAlign:'center', color:C.cm } }, 'Carregando…');
  if (!unidade) return h('div', { style:{ padding:40, textAlign:'center', color:C.cm } }, 'Unidade não encontrada.');

  var tabs = ['sobre','história','mapa','estrutura','ocupação'];
  var lat = unidade.lat || (unidade.coords && unidade.coords.lat);
  var lng = unidade.lng || (unidade.coords && unidade.coords.lng);
  var cor = unidade.tipo === 'CIMA' ? C.g1 : C.b1;

  return h('div', { style:{ maxWidth:1000, margin:'0 auto', padding:'24px 16px' } },
    h('button', { onClick:onBack, style:{ background:'none', border:'none', color:C.cm, fontSize:14, cursor:'pointer', marginBottom:16, display:'flex', alignItems:'center', gap:6 } }, '← Voltar'),

    h('div', { style:{ background:cor, color:'#fff', borderRadius:16, padding:'28px 32px', marginBottom:24 } },
      h('div', { style:{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' } },
        h('div', { style:{ flex:1 } },
          h(Pill, { bg:'rgba(255,255,255,.2)', color:'#fff' }, unidade.tipo),
          h('h1', { style:{ fontSize:26, fontWeight:800, margin:'8px 0 4px' } }, unidade.nome),
          h('div', { style:{ opacity:.8, fontSize:14 } }, unidade.municipio + (unidade.regional ? ' · ' + unidade.regional : ''))
        ),
        h('div', { style:{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' } },
          h(Pill, { bg:'rgba(255,255,255,.15)', color:'#fff' }, unidade.status === 'ativo' ? '✅ Ativo' : unidade.status === 'manutencao' ? '🔧 Manutenção' : '❌ Inativo'),
          h('div', { style:{ fontSize:13, opacity:.8 } }, 'Uso: ' + (unidade.taxa_uso||unidade.taxaUso||0) + '%'),
          h(Bar, { pct:unidade.taxa_uso||unidade.taxaUso||0, h:6 })
        )
      )
    ),

    h('div', { style:{ display:'flex', gap:4, marginBottom:20, flexWrap:'wrap' } },
      tabs.map(function(tab) {
        return h('button', { key:tab, onClick:function(){setAba(tab);}, style:{ padding:'7px 16px', border:'none', borderRadius:20, background:aba===tab?cor:'#fff', color:aba===tab?'#fff':C.cm, fontWeight:aba===tab?700:500, cursor:'pointer', fontSize:13, boxShadow:aba===tab?'none':'0 0 0 1px '+C.cl } }, tab.charAt(0).toUpperCase()+tab.slice(1));
      })
    ),

    aba === 'sobre' && h(Card, null,
      h('p', { style:{ color:C.cm, lineHeight:1.7 } }, unidade.descricao || 'Sem descrição cadastrada.'),
      unidade.decreto && h('p', { style:{ marginTop:12, fontSize:13 } }, h('strong', null, 'Decreto: '), unidade.decreto)
    ),

    aba === 'história' && h(Card, null,
      h('p', { style:{ color:C.cm, lineHeight:1.7 } }, unidade.historia || 'Histórico não cadastrado.')
    ),

    aba === 'mapa' && lat && lng && h(MapView, { units:[unidade], singleUnit:unidade, height:400 }),
    aba === 'mapa' && (!lat || !lng) && h('p', { style:{ color:C.cm } }, 'Coordenadas não cadastradas.'),

    aba === 'estrutura' && h(Card, null,
      h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:12 } },
        h(StatBox, { val:unidade.quartos||0, label:'Quartos' }),
        h(StatBox, { val:unidade.salas||0, label:'Salas' }),
        h(StatBox, { val:unidade.cozinha?'Sim':'Não', label:'Cozinha' }),
        h(StatBox, { val:unidade.auditorio?'Sim':'Não', label:'Auditório' }),
        h(StatBox, { val:unidade.capacidade||'—', label:'Capacidade' })
      )
    ),

    aba === 'ocupação' && h(PainelOcupacao, { un:unidade, onRefresh:refresh })
  );
}

function GridUnidades(props) {
  var uns = props.uns, tipo = props.tipo, nav = props.nav;
  var filtered = uns.filter(function(u){ return u.tipo === tipo; });
  var cor = tipo === 'CIMA' ? C.g1 : C.b1;
  var bgLight = tipo === 'CIMA' ? C.gx : C.bl;

  if (!filtered.length) return h('div', { style:{ padding:'40px 24px', textAlign:'center', color:C.cm } }, 'Nenhuma unidade cadastrada.');

  return h('div', { style:{ maxWidth:1200, margin:'0 auto', padding:'32px 24px' } },
    h('h1', { style:{ fontSize:24, fontWeight:800, color:C.cd, marginBottom:24 } }, tipo === 'CIMA' ? '🏛 Unidades CIMA' : '🏢 Unidades UGAI'),
    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:20 } },
      filtered.map(function(u) {
        var uso = u.taxa_uso || u.taxaUso || 0;
        return h(Card, { key:u.id, style:{ cursor:'pointer', transition:'box-shadow .2s' },
          onClick:function(){nav('unidade', u.id);} },
          h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 } },
            h(Pill, { bg:bgLight, color:cor }, u.tipo),
            h(Pill, {
              bg:u.status==='ativo'?C.gx:u.status==='manutencao'?C.al:C.rl,
              color:u.status==='ativo'?C.g2:u.status==='manutencao'?C.am:C.rm
            }, u.status)
          ),
          h('h3', { style:{ fontWeight:700, fontSize:16, color:C.cd, marginBottom:4 } }, u.nome),
          h('div', { style:{ fontSize:13, color:C.cm, marginBottom:12 } }, u.municipio),
          h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 } },
            h('span', { style:{ fontSize:12, color:C.cm } }, 'Taxa de uso'),
            h('span', { style:{ fontWeight:700, color:uso>=80?C.rm:uso>=50?C.am:C.g2 } }, uso + '%')
          ),
          h(Bar, { pct:uso }),
          h('div', { style:{ marginTop:12, fontSize:12, color:C.cm } }, '👥 ' + (u.ocupacaoAtual||0) + ' órgão(s) ativo(s)')
        );
      })
    )
  );
}

function PgCima(props) {
  return h(GridUnidades, Object.assign({}, props, { tipo: 'CIMA' }));
}

function PgUgai(props) {
  return h(GridUnidades, Object.assign({}, props, { tipo: 'UGAI' }));
}
