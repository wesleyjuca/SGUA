// SGUA — Admin: Painel principal (shell + sidebar + tabs)

function AdminPanel(props) {
  var curUser = props.curUser, onLogout = props.onLogout;
  var uns = props.uns, setUns = props.setUns;
  var news = props.news, setNews = props.setNews;
  var feeds = props.feeds, setFeeds = props.setFeeds;
  var sols = props.sols, setSols = props.setSols;
  var users = props.users, setUsers = props.setUsers;
  var secs = props.secs, setSecs = props.setSecs;
  var toast2 = props.toast2;
  var isMobile = props.isMobile;
  var [atab, setAtab] = React.useState('dash');

  function canDo(k) {
    if (!curUser) return false;
    return curUser.perfil === 'admin' || !!(curUser.permissoes && curUser.permissoes[k]);
  }

  var tabs = [
    { id:'dash',  label:'📊 Dashboard',     show:true },
    { id:'uns',   label:'🏛 Unidades',       show:canDo('units') },
    { id:'news',  label:'📰 Notícias',       show:canDo('news') },
    { id:'feeds', label:'📡 Feeds RSS',      show:canDo('feeds') },
    { id:'sols',  label:'📋 Solicitações',   show:true },
    { id:'users', label:'👥 Usuários',       show:canDo('users') },
    { id:'cfg',   label:'⚙ Configurações',  show:canDo('cfg') },
    { id:'rel',   label:'📄 Relatórios',    show:canDo('rel') }
  ].filter(function(t){return t.show;});

  async function salvarCfg(key, val) {
    var novo = Object.assign({}, secs, { [key]: val });
    setSecs(novo);
    await API.Configuracoes.update({ [key]: val });
    toast2('Configuração salva!', C.g1);
  }

  var sidebar = h('div', { style:{ width:isMobile?'100%':220, background:C.g0, display:'flex', flexDirection:'column', flexShrink:0 } },
    h('div', { style:{ padding:'16px', borderBottom:'1px solid rgba(255,255,255,.1)' } },
      h('div', { style:{ color:'#fff', fontWeight:700, fontSize:15 } }, curUser && curUser.nome),
      h('div', { style:{ color:'rgba(255,255,255,.5)', fontSize:12, marginTop:2 } }, curUser && curUser.perfil)
    ),
    h('div', { style:{ flex:1, overflowY:'auto', padding:'8px' } },
      tabs.map(function(t) {
        return h('button', { key:t.id, onClick:function(){setAtab(t.id);}, style:{ display:'block', width:'100%', textAlign:'left', padding:'9px 12px', border:'none', borderRadius:8, background:atab===t.id?C.g2:'transparent', color:atab===t.id?'#fff':'rgba(255,255,255,.7)', cursor:'pointer', fontSize:14, marginBottom:2, fontWeight:atab===t.id?600:400 } }, t.label);
      })
    ),
    h('div', { style:{ padding:'12px', borderTop:'1px solid rgba(255,255,255,.1)' } },
      h('button', { onClick:onLogout, style:{ width:'100%', padding:'8px', border:'1px solid rgba(255,255,255,.2)', borderRadius:8, background:'transparent', color:'rgba(255,255,255,.7)', cursor:'pointer', fontSize:13 } }, 'Sair')
    )
  );

  var content = h('div', { style:{ flex:1, overflowY:'auto', padding:'28px 24px' } },
    atab==='dash'  && h(AdminDash,  { uns:uns, news:news, sols:sols, users:users }),
    atab==='uns'   && h(AdminUnidades, { uns:uns, setUns:setUns, toast2:toast2, canDo:canDo }),
    atab==='news'  && h(AdminNoticias, { news:news, setNews:setNews, toast2:toast2, canDo:canDo }),
    atab==='feeds' && h(AdminFeeds, { feeds:feeds, setFeeds:setFeeds, toast2:toast2 }),
    atab==='sols'  && h(AdminSols,  { sols:sols, setSols:setSols, uns:uns, toast2:toast2, canDo:canDo }),
    atab==='users' && h(AdminUsers, { users:users, setUsers:setUsers, toast2:toast2, curUser:curUser }),
    atab==='rel'   && h(AdminRelatorios, { uns:uns, news:news, sols:sols }),
    atab==='cfg'   && h('div', null,
      h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd, marginBottom:20 } }, 'Configurações da Home'),
      h(Card, null,
        h('div', { style:{ display:'flex', flexDirection:'column', gap:14 } },
          [['hero','Hero banner'],['alert','Alertas'],['bloco','Estatísticas'],['mapa','Mapa'],['news','Notícias'],['acesso','Acesso rápido']].map(function(item) {
            return h('div', { key:item[0], style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid '+C.cl } },
              h('span', { style:{ fontWeight:600 } }, item[1]),
              h('label', { style:{ display:'flex', gap:6, alignItems:'center', cursor:'pointer' } },
                h('input', { type:'checkbox', checked:!!(secs&&secs[item[0]]), onChange:function(e){salvarCfg(item[0],e.target.checked);} }),
                (secs&&secs[item[0]]) ? 'Visível' : 'Oculto'
              )
            );
          })
        )
      )
    )
  );

  return h('div', { style:{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden', flexDirection:isMobile?'column':'row' } },
    sidebar,
    content
  );
}
