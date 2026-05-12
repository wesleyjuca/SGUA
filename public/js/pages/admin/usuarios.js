// SGUA — Admin: Gerenciamento de Usuários

function AdminUsers(props) {
  var users = props.users||[], setUsers = props.setUsers, toast2 = props.toast2, curUser = props.curUser;
  var [modal, setModal] = React.useState(false);
  var [sf, setSf] = React.useState({});
  var [loading, setLoading] = React.useState(false);
  var [conf, setConf] = React.useState(null);

  function abrirNovo() { setSf({ perfil:'viewer', ativo:true }); setModal('novo'); }
  function abrirEditar(u) { setSf(Object.assign({},u,{senha:''})); setModal('editar'); }

  async function salvar() {
    var rules = USER_RULES.slice();
    if (modal === 'novo') rules.push({ field:'senha', label:'Senha', required:true });
    var errs = validateFields(sf, rules);
    if (errs.length) { toast2(errs.join(' | '), C.rm); return; }
    setLoading(true);
    var r = modal==='novo' ? await API.Usuarios.create(sf) : await API.Usuarios.update(sf.id, sf);
    setLoading(false);
    if (!r.ok) { toast2(r.error||'Erro ao salvar', C.rm); return; }
    if (modal==='novo') setUsers(function(p){return p.concat([r.usuario]);});
    else setUsers(function(p){return p.map(function(u){return u.id===r.usuario.id?r.usuario:u;});});
    setModal(false);
    toast2(modal==='novo'?'Usuário criado!':'Usuário atualizado!', C.g1);
  }

  async function excluir(u) {
    setConf(null);
    var r = await API.Usuarios.remove(u.id);
    if (!r.ok) { toast2(r.error||'Erro ao excluir', C.rm); return; }
    setUsers(function(p){return p.filter(function(x){return x.id!==u.id;});});
    toast2('Usuário removido.', C.g1);
  }

  var corPerfil = { admin:[C.px,C.pm], gestor:[C.gx,C.g1], viewer:[C.cx,C.cm] };

  return h('div', null,
    h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 } },
      h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd } }, 'Usuários (' + users.length + ')'),
      h('button', { onClick:abrirNovo, style:{ background:C.g2, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:600, cursor:'pointer' } }, '+ Novo Usuário')
    ),
    h('table', null,
      h('thead', null, h('tr', null,
        h('th', null,'Nome'), h('th', null,'Email'), h('th', null,'Perfil'), h('th', null,'Situação'), h('th', null,'Ações')
      )),
      h('tbody', null,
        users.map(function(u) {
          var cores = corPerfil[u.perfil]||corPerfil.viewer;
          return h('tr', { key:u.id },
            h('td', null, h('strong', null, u.nome)),
            h('td', null, u.email),
            h('td', null, h(Pill, { bg:cores[0], color:cores[1] }, u.perfil)),
            h('td', null, h(Pill, { bg:u.ativo?C.gx:C.rl, color:u.ativo?C.g2:C.rm }, u.ativo?'Ativo':'Inativo')),
            h('td', null, h('div', { style:{display:'flex',gap:6} },
              h('button', { onClick:function(){abrirEditar(u);}, style:{padding:'4px 10px',border:'1px solid '+C.cl,borderRadius:6,fontSize:12,cursor:'pointer',background:'#fff'} }, 'Editar'),
              curUser && u.id !== curUser.id && h('button', { onClick:function(){setConf(u);}, style:{padding:'4px 10px',border:'none',borderRadius:6,fontSize:12,cursor:'pointer',background:C.rl,color:C.rm} }, 'Excluir')
            ))
          );
        })
      )
    ),
    h(Modal, { open:!!modal, title:modal==='novo'?'Novo Usuário':'Editar Usuário', onClose:function(){setModal(false);} },
      h(FmUser, { sf:sf, setSf:setSf, onSave:salvar, onClose:function(){setModal(false);}, loading:loading, isEdit:modal==='editar' })
    ),
    h(Confirm, { open:!!conf, msg:'Excluir usuário "'+((conf&&conf.nome)||'')+'"?', onConfirm:function(){excluir(conf);}, onCancel:function(){setConf(null);} })
  );
}
