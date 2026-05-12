// SGUA — Componentes UI reutilizáveis
var h = React.createElement;

// ─── Primitivos ──────────────────────────────────────────────────────────
function Pill(props) {
  var bg = props.bg || C.gx, color = props.color || C.g1;
  return h('span', { style:{ background:bg, color:color, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:600, whiteSpace:'nowrap', display:'inline-block' } }, props.children);
}

function Bar(props) {
  var pct = Math.min(100, Math.max(0, Number(props.pct) || 0));
  var bg = pct >= 80 ? C.rm : pct >= 50 ? C.am : C.g3;
  return h('div', { style:{ background:C.cl, borderRadius:8, height:props.h||8, overflow:'hidden', minWidth:60 } },
    h('div', { style:{ width:pct+'%', background:bg, height:'100%', transition:'width .3s', borderRadius:8 } })
  );
}

function Card(props) {
  return h('div', { style:Object.assign({ background:'#fff', borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,.08)', padding:props.p||20 }, props.style||{}) }, props.children);
}

function StatBox(props) {
  return h('div', { style:{ background:props.bg||C.gx, borderRadius:12, padding:'16px 20px', display:'flex', flexDirection:'column', gap:4 } },
    h('div', { style:{ fontSize:22, fontWeight:700, color:props.color||C.g1 } }, props.val),
    h('div', { style:{ fontSize:12, color:C.cm } }, props.label)
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────
function Modal(props) {
  if (!props.open) return null;
  return h('div', {
    style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
    onClick: function(e){ if(e.target===e.currentTarget && props.onClose) props.onClose(); }
  },
    h('div', { style:{ background:'#fff', borderRadius:16, boxShadow:'0 8px 40px rgba(0,0,0,.18)', width:'100%', maxWidth:props.maxWidth||560, maxHeight:'90vh', overflowY:'auto', display:'flex', flexDirection:'column' } },
      h('div', { style:{ padding:'18px 24px', borderBottom:'1px solid '+C.cl, display:'flex', alignItems:'center', justifyContent:'space-between' } },
        h('div', { style:{ fontWeight:700, fontSize:16 } }, props.title),
        props.onClose && h('button', { onClick:props.onClose, style:{ background:'none', border:'none', fontSize:20, color:C.cm, cursor:'pointer', lineHeight:1 } }, '×')
      ),
      h('div', { style:{ padding:24, flex:1 } }, props.children)
    )
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────
function Toast(props) {
  if (!props.msg) return null;
  return h('div', { style:{ position:'fixed', bottom:24, right:24, background:props.bg||C.g1, color:'#fff', padding:'12px 20px', borderRadius:12, boxShadow:'0 4px 16px rgba(0,0,0,.2)', zIndex:9999, maxWidth:340, fontSize:14, fontWeight:500 } },
    props.msg
  );
}

// ─── Confirm ─────────────────────────────────────────────────────────────
function Confirm(props) {
  if (!props.open) return null;
  return h('div', { style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' } },
    h('div', { style:{ background:'#fff', borderRadius:14, padding:28, maxWidth:360, width:'90%', boxShadow:'0 6px 30px rgba(0,0,0,.15)' } },
      h('div', { style:{ fontWeight:600, fontSize:16, marginBottom:8 } }, props.title || 'Confirmar'),
      h('div', { style:{ color:C.cm, fontSize:14, marginBottom:20 } }, props.msg || 'Tem certeza?'),
      h('div', { style:{ display:'flex', gap:10, justifyContent:'flex-end' } },
        h('button', { onClick:props.onCancel, style:{ padding:'8px 18px', border:'1px solid '+C.cl, borderRadius:8, background:'#fff', fontWeight:500 } }, 'Cancelar'),
        h('button', { onClick:props.onConfirm, style:{ padding:'8px 18px', border:'none', borderRadius:8, background:C.rm, color:'#fff', fontWeight:600 } }, props.confirmLabel || 'Excluir')
      )
    )
  );
}

// ─── Navbar ──────────────────────────────────────────────────────────────
function Navbar(props) {
  var go = props.go, curUser = props.curUser, onLogin = props.onLogin, onLogout = props.onLogout, isMobile = props.isMobile;
  var items = [
    { id:'home',    label:'Início' },
    { id:'cima',    label:'CIMA' },
    { id:'ugai',    label:'UGAI' },
    { id:'mapa',    label:'🗺 Mapa' },
    { id:'noticias',label:'Notícias' },
    { id:'sol',     label:'Solicitação' },
    { id:'transp',  label:'Transparência' }
  ];
  return h('nav', { style:{ position:'sticky', top:0, zIndex:100, background:C.g1, boxShadow:'0 2px 8px rgba(0,0,0,.12)' } },
    h('div', { style:{ maxWidth:1200, margin:'0 auto', padding:'0 16px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 } },
      h('button', { onClick:function(){go('home');}, style:{ background:'none', border:'none', color:'#fff', fontWeight:800, fontSize:18, cursor:'pointer', whiteSpace:'nowrap' } }, '🌿 SGUA'),
      !isMobile && h('div', { style:{ display:'flex', gap:4 } },
        items.map(function(item) {
          return h('button', { key:item.id, onClick:function(){go(item.id);}, style:{ background:'none', border:'none', color:'rgba(255,255,255,.85)', padding:'6px 10px', borderRadius:8, fontSize:13, cursor:'pointer' } }, item.label);
        })
      ),
      h('div', { style:{ display:'flex', gap:8, alignItems:'center' } },
        curUser
          ? h(React.Fragment, null,
              !isMobile && h('span', { style:{ color:'rgba(255,255,255,.7)', fontSize:13 } }, curUser.nome),
              h('button', { onClick:function(){go('admin');}, style:{ background:C.g3, border:'none', color:'#fff', padding:'6px 14px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' } }, 'Admin'),
              h('button', { onClick:onLogout, style:{ background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.2)', color:'#fff', padding:'6px 14px', borderRadius:8, fontSize:13, cursor:'pointer' } }, 'Sair')
            )
          : h('button', { onClick:onLogin, style:{ background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.2)', color:'#fff', padding:'6px 14px', borderRadius:8, fontSize:13, cursor:'pointer' } }, 'Admin')
      )
    )
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────
function Footer() {
  return h('footer', { style:{ background:C.g0, color:'rgba(255,255,255,.5)', textAlign:'center', padding:'24px 16px', fontSize:12, marginTop:40 } },
    '© 2026 SEMA/AC — Governo do Estado do Acre · Sistema de Gestão CIMA & UGAI'
  );
}

// ─── Paginação ────────────────────────────────────────────────────────────
function Pagination(props) {
  var page = props.page, total = props.total, pageSize = props.pageSize || PAGE_SIZE;
  var pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return h('div', { className:'pagination' },
    h('button', { onClick:function(){props.onChange(page-1);}, disabled:page===1 }, '← Anterior'),
    h('span', null, 'Página ' + page + ' de ' + pages),
    h('button', { onClick:function(){props.onChange(page+1);}, disabled:page===pages }, 'Próxima →')
  );
}

// ─── Formulário de unidade (FmUn) ─────────────────────────────────────────
function FmUn(props) {
  var sf = props.sf, setSf = props.setSf, onSave = props.onSave, onClose = props.onClose, loading = props.loading;
  var mudar = function(k) { return function(e) { setSf(function(p){return Object.assign({},p,{[k]:e.target.type==='checkbox'?e.target.checked:e.target.value});}); }; };
  var row = function() { return { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }; };
  var lbl = function(label) { return h('label', { style:{ fontSize:13, fontWeight:600, display:'block', marginBottom:4, color:C.cd } }, label); };
  var inp = function(k, type, placeholder, extra) {
    if (type === 'textarea') return h('textarea', Object.assign({ value:sf[k]||'', onChange:mudar(k), placeholder:placeholder||'', rows:3, style:{resize:'vertical'} }, extra||{}));
    if (type === 'checkbox') return h('input', { type:'checkbox', checked:!!sf[k], onChange:mudar(k) });
    if (type === 'select') return h('select', { value:sf[k]||'', onChange:mudar(k) }, (extra||[]).map(function(o){return h('option',{key:o.value,value:o.value},o.label);}));
    return h('input', Object.assign({ type:type||'text', value:sf[k]||'', onChange:mudar(k), placeholder:placeholder||'' }, extra||{}));
  };

  return h('div', { style:{ display:'flex', flexDirection:'column', gap:14 } },
    h('div', { style:row() },
      h('div', null, lbl('Tipo *'), inp('tipo','select','',[{value:'',label:'Selecione'},{value:'CIMA',label:'CIMA'},{value:'UGAI',label:'UGAI'}])),
      h('div', null, lbl('Status *'), inp('status','select','',[{value:'ativo',label:'Ativo'},{value:'manutencao',label:'Manutenção'},{value:'inativo',label:'Inativo'}]))
    ),
    h('div', null, lbl('Nome *'), inp('nome','text','Nome da unidade')),
    h('div', { style:row() },
      h('div', null, lbl('Município *'), inp('municipio','text','Município')),
      h('div', null, lbl('Regional'), inp('regional','text','Regional'))
    ),
    h('div', { style:row() },
      h('div', null, lbl('Latitude'), inp('lat','number','Ex: -9.97')),
      h('div', null, lbl('Longitude'), inp('lng','number','Ex: -67.82'))
    ),
    h('div', { style:row() },
      h('div', null, lbl('Taxa de Uso (%)'), inp('taxaUso','number','0-100')),
      h('div', null, lbl('Capacidade'), inp('capacidade','number','Pessoas'))
    ),
    h('div', { style:row() },
      h('div', null, lbl('Quartos'), inp('quartos','number','')),
      h('div', null, lbl('Salas'), inp('salas','number',''))
    ),
    h('div', { style:{ display:'flex', gap:20 } },
      h('label', { style:{ display:'flex', gap:6, alignItems:'center', fontSize:14 } }, inp('cozinha','checkbox'), 'Cozinha'),
      h('label', { style:{ display:'flex', gap:6, alignItems:'center', fontSize:14 } }, inp('auditorio','checkbox'), 'Auditório'),
      h('label', { style:{ display:'flex', gap:6, alignItems:'center', fontSize:14 } }, inp('visivel','checkbox'), 'Visível')
    ),
    h('div', null, lbl('Decreto'), inp('decreto','text','Nº do decreto')),
    h('div', null, lbl('Descrição'), inp('descricao','textarea','Descrição da unidade')),
    h('div', null, lbl('Histórico'), inp('historia','textarea','Histórico')),
    h('div', { style:{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 } },
      h('button', { onClick:onClose, disabled:loading, style:{ padding:'9px 20px', border:'1px solid '+C.cl, borderRadius:8, background:'#fff', cursor:'pointer' } }, 'Cancelar'),
      h('button', { onClick:onSave, disabled:loading, style:{ padding:'9px 20px', border:'none', borderRadius:8, background:C.g2, color:'#fff', fontWeight:600, cursor:'pointer' } }, loading ? 'Salvando…' : 'Salvar')
    )
  );
}

// ─── Formulário de notícia (FmNw) ─────────────────────────────────────────
function FmNw(props) {
  var sf = props.sf, setSf = props.setSf, onSave = props.onSave, onClose = props.onClose, loading = props.loading;
  var mudar = function(k) { return function(e) { setSf(function(p){return Object.assign({},p,{[k]:e.target.type==='checkbox'?e.target.checked:e.target.value});}); }; };
  var lbl = function(l) { return h('label', { style:{ fontSize:13, fontWeight:600, display:'block', marginBottom:4 } }, l); };

  return h('div', { style:{ display:'flex', flexDirection:'column', gap:14 } },
    h('div', null, lbl('Título *'), h('input', { type:'text', value:sf.titulo||'', onChange:mudar('titulo'), placeholder:'Título da notícia' })),
    h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 } },
      h('div', null, lbl('Data *'), h('input', { type:'date', value:sf.data||'', onChange:mudar('data') })),
      h('div', null, lbl('Categoria'), h('input', { type:'text', value:sf.categoria||'', onChange:mudar('categoria') }))
    ),
    h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 } },
      h('div', null, lbl('Autor'), h('input', { type:'text', value:sf.autor||'', onChange:mudar('autor') })),
      h('div', null, lbl('Unidade relacionada'), h('input', { type:'text', value:sf.unidade||'', onChange:mudar('unidade') }))
    ),
    h('div', null, lbl('Resumo'), h('textarea', { value:sf.resumo||'', onChange:mudar('resumo'), rows:2, placeholder:'Resumo' })),
    h('div', null, lbl('Conteúdo completo'), h('textarea', { value:sf.conteudo||'', onChange:mudar('conteudo'), rows:4, placeholder:'Texto completo...' })),
    h('div', null, lbl('Fonte / URL'), h('input', { type:'text', value:sf.fonte||'', onChange:mudar('fonte'), placeholder:'https://...' })),
    h('div', { style:{ display:'flex', gap:20 } },
      h('label', { style:{ display:'flex', gap:6, alignItems:'center', fontSize:14 } }, h('input', { type:'checkbox', checked:!!sf.visivel, onChange:mudar('visivel') }), 'Visível'),
      h('label', { style:{ display:'flex', gap:6, alignItems:'center', fontSize:14 } }, h('input', { type:'checkbox', checked:!!sf.destaque, onChange:mudar('destaque') }), 'Destaque')
    ),
    h('div', { style:{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 } },
      h('button', { onClick:onClose, disabled:loading, style:{ padding:'9px 20px', border:'1px solid '+C.cl, borderRadius:8, background:'#fff', cursor:'pointer' } }, 'Cancelar'),
      h('button', { onClick:onSave, disabled:loading, style:{ padding:'9px 20px', border:'none', borderRadius:8, background:C.g2, color:'#fff', fontWeight:600, cursor:'pointer' } }, loading ? 'Salvando…' : 'Salvar')
    )
  );
}

// ─── Formulário de usuário (FmUser) ──────────────────────────────────────
function FmUser(props) {
  var sf = props.sf, setSf = props.setSf, onSave = props.onSave, onClose = props.onClose, loading = props.loading, isEdit = props.isEdit;
  var mudar = function(k) { return function(e) { setSf(function(p){return Object.assign({},p,{[k]:e.target.type==='checkbox'?e.target.checked:e.target.value});}); }; };
  var lbl = function(l) { return h('label', { style:{ fontSize:13, fontWeight:600, display:'block', marginBottom:4 } }, l); };

  return h('div', { style:{ display:'flex', flexDirection:'column', gap:14 } },
    h('div', null, lbl('Nome *'), h('input', { type:'text', value:sf.nome||'', onChange:mudar('nome'), placeholder:'Nome completo' })),
    h('div', null, lbl('Email *'), h('input', { type:'email', value:sf.email||'', onChange:mudar('email'), placeholder:'email@exemplo.com' })),
    h('div', null, lbl(isEdit ? 'Nova Senha (deixe vazio para manter)' : 'Senha *'), h('input', { type:'password', value:sf.senha||'', onChange:mudar('senha'), placeholder:isEdit ? 'Nova senha...' : 'Senha inicial' })),
    h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 } },
      h('div', null, lbl('Perfil'), h('select', { value:sf.perfil||'viewer', onChange:mudar('perfil') },
        h('option', { value:'admin' }, 'Administrador'),
        h('option', { value:'gestor' }, 'Gestor'),
        h('option', { value:'viewer' }, 'Visitante')
      )),
      h('div', null, lbl('Situação'), h('select', { value:sf.ativo===false?'0':'1', onChange:function(e){setSf(function(p){return Object.assign({},p,{ativo:e.target.value==='1'});});} },
        h('option', { value:'1' }, 'Ativo'),
        h('option', { value:'0' }, 'Inativo')
      ))
    ),
    h('div', { style:{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 } },
      h('button', { onClick:onClose, disabled:loading, style:{ padding:'9px 20px', border:'1px solid '+C.cl, borderRadius:8, background:'#fff', cursor:'pointer' } }, 'Cancelar'),
      h('button', { onClick:onSave, disabled:loading, style:{ padding:'9px 20px', border:'none', borderRadius:8, background:C.g2, color:'#fff', fontWeight:600, cursor:'pointer' } }, loading ? 'Salvando…' : 'Salvar')
    )
  );
}
