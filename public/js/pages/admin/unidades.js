// SGUA — Admin: Gerenciamento de Unidades

function AdminUnidades(props) {
  var uns = props.uns||[], setUns = props.setUns, toast2 = props.toast2, canDo = props.canDo;
  var [modal, setModal] = React.useState(null);
  var [sf, setSf] = React.useState({});
  var [loading, setLoading] = React.useState(false);
  var [conf, setConf] = React.useState(null);
  var [page, setPage] = React.useState(1);
  var [busca, setBusca] = React.useState('');

  var filtered = React.useMemo(function() {
    if (!busca) return uns;
    var q = busca.toLowerCase();
    return uns.filter(function(u){ return u.nome.toLowerCase().includes(q) || u.municipio.toLowerCase().includes(q); });
  }, [uns, busca]);

  var pageItems = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  function abrirNova() { setSf({ tipo:'CIMA', status:'ativo', visivel:true, cozinha:false, auditorio:false, taxaUso:0 }); setModal('novo'); }
  function abrirEditar(u) { setSf(Object.assign({},u,{taxaUso:u.taxa_uso||u.taxaUso||0})); setModal('editar'); }

  async function salvar() {
    var errs = validateFields(sf, UN_RULES);
    if (errs.length) { toast2(errs.join(' | '), C.rm); return; }
    setLoading(true);
    var r = modal === 'novo'
      ? await API.Unidades.create(sf)
      : await API.Unidades.update(sf.id, sf);
    setLoading(false);
    if (!r.ok) { toast2(r.error || 'Erro ao salvar', C.rm); return; }
    if (modal === 'novo') setUns(function(p){return [r.unidade].concat(p);});
    else setUns(function(p){return p.map(function(u){return u.id===r.unidade.id?r.unidade:u;});});
    setModal(null);
    toast2(modal === 'novo' ? 'Unidade criada!' : 'Unidade atualizada!', C.g1);
  }

  async function excluir(u) {
    setConf(null);
    var r = await API.Unidades.remove(u.id);
    if (!r.ok) { toast2(r.error || 'Erro ao excluir', C.rm); return; }
    setUns(function(p){return p.filter(function(x){return x.id !== u.id;});});
    toast2('Unidade excluída.', C.g1);
  }

  return h('div', null,
    h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 } },
      h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd } }, 'Unidades (' + uns.length + ')'),
      h('div', { style:{ display:'flex', gap:10 } },
        h('input', { placeholder:'Buscar...', value:busca, onChange:function(e){setBusca(e.target.value);setPage(1);}, style:{ padding:'7px 12px', border:'1px solid '+C.cl, borderRadius:8, fontSize:13 } }),
        canDo('units') && h('button', { onClick:abrirNova, style:{ background:C.g2, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:600, cursor:'pointer' } }, '+ Nova Unidade')
      )
    ),

    h('table', null,
      h('thead', null, h('tr', null,
        h('th', null, 'Nome'), h('th', null, 'Tipo'), h('th', null, 'Município'), h('th', null, 'Status'), h('th', null, 'Uso'), h('th', null, 'Ações')
      )),
      h('tbody', null,
        pageItems.map(function(u) {
          return h('tr', { key:u.id },
            h('td', null, h('strong', null, u.nome)),
            h('td', null, h(Pill, { bg:u.tipo==='CIMA'?C.gx:C.bl, color:u.tipo==='CIMA'?C.g1:C.b1 }, u.tipo)),
            h('td', null, u.municipio),
            h('td', null, h(Pill, {
              bg:u.status==='ativo'?C.gx:u.status==='manutencao'?C.al:C.rl,
              color:u.status==='ativo'?C.g2:u.status==='manutencao'?C.am:C.rm
            }, u.status)),
            h('td', null, h('div', { style:{ display:'flex', gap:6, alignItems:'center' } },
              h(Bar, { pct:u.taxa_uso||u.taxaUso||0 }),
              h('span', { style:{ fontSize:12, minWidth:32 } }, (u.taxa_uso||u.taxaUso||0)+'%')
            )),
            h('td', null,
              canDo('units') && h('div', { style:{ display:'flex', gap:6 } },
                h('button', { onClick:function(){abrirEditar(u);}, style:{ padding:'4px 10px', border:'1px solid '+C.cl, borderRadius:6, fontSize:12, cursor:'pointer', background:'#fff' } }, 'Editar'),
                h('button', { onClick:function(){setConf(u);}, style:{ padding:'4px 10px', border:'none', borderRadius:6, fontSize:12, cursor:'pointer', background:C.rl, color:C.rm } }, 'Excluir')
              )
            )
          );
        })
      )
    ),

    h(Pagination, { page:page, total:filtered.length, onChange:setPage }),

    h(Modal, { open:!!modal, title:modal==='novo'?'Nova Unidade':'Editar Unidade', onClose:function(){setModal(null);}, maxWidth:640 },
      h(FmUn, { sf:sf, setSf:setSf, onSave:salvar, onClose:function(){setModal(null);}, loading:loading })
    ),

    h(Confirm, { open:!!conf, title:'Excluir Unidade', msg:'Deseja excluir "' + (conf&&conf.nome) + '"? Esta ação não pode ser desfeita.', onConfirm:function(){excluir(conf);}, onCancel:function(){setConf(null);} })
  );
}
