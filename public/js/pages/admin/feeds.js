// SGUA — Admin: Feeds RSS

function AdminFeeds(props) {
  var feeds = props.feeds||[], setFeeds = props.setFeeds, toast2 = props.toast2;
  var [modal, setModal] = React.useState(false);
  var [sf, setSf] = React.useState({});
  var [loading, setLoading] = React.useState(false);

  function abrirNovo() { setSf({ ativo:true, categoria:'' }); setModal('novo'); }
  function abrirEditar(f) { setSf(Object.assign({},f)); setModal('editar'); }

  async function salvar() {
    if (!sf.nome||!sf.url) { toast2('Nome e URL são obrigatórios', C.rm); return; }
    setLoading(true);
    var r = modal==='novo' ? await API.Feeds.create(sf) : await API.Feeds.update(sf.id, sf);
    setLoading(false);
    if (!r.ok) { toast2(r.error||'Erro', C.rm); return; }
    if (modal==='novo') setFeeds(function(p){return p.concat([r.feed]);});
    else setFeeds(function(p){return p.map(function(f){return f.id===r.feed.id?r.feed:f;});});
    setModal(false);
    toast2('Feed salvo!', C.g1);
  }

  async function excluir(f) {
    var r = await API.Feeds.remove(f.id);
    if (!r.ok) { toast2(r.error||'Erro', C.rm); return; }
    setFeeds(function(p){return p.filter(function(x){return x.id!==f.id;});});
    toast2('Feed removido.', C.g1);
  }

  var mudar = function(k) { return function(e) { setSf(function(p){return Object.assign({},p,{[k]:e.target.type==='checkbox'?e.target.checked:e.target.value});}); }; };

  return h('div', null,
    h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 } },
      h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd } }, 'Feeds RSS (' + feeds.length + ')'),
      h('button', { onClick:abrirNovo, style:{ background:C.g2, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:600, cursor:'pointer' } }, '+ Novo Feed')
    ),

    h('div', { style:{ display:'flex', flexDirection:'column', gap:10 } },
      feeds.map(function(f) {
        return h(Card, { key:f.id, p:14, style:{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 } },
          h('div', { style:{ flex:1 } },
            h('div', { style:{ fontWeight:700, fontSize:14, color:C.cd } }, f.nome),
            h('div', { style:{ fontSize:12, color:C.cm, marginTop:2 } }, f.url),
            f.categoria && h(Pill, { bg:C.gx, color:C.g1 }, f.categoria)
          ),
          h('div', { style:{ display:'flex', gap:8, alignItems:'center' } },
            h(Pill, { bg:f.ativo?C.gx:C.rl, color:f.ativo?C.g2:C.rm }, f.ativo?'Ativo':'Inativo'),
            h('button', { onClick:function(){abrirEditar(f);}, style:{padding:'4px 10px',border:'1px solid '+C.cl,borderRadius:6,fontSize:12,cursor:'pointer'} }, 'Editar'),
            h('button', { onClick:function(){excluir(f);}, style:{padding:'4px 10px',border:'none',borderRadius:6,fontSize:12,cursor:'pointer',background:C.rl,color:C.rm} }, 'Excluir')
          )
        );
      })
    ),

    h(Modal, { open:!!modal, title:modal==='novo'?'Novo Feed':'Editar Feed', onClose:function(){setModal(false);} },
      h('div', { style:{ display:'flex', flexDirection:'column', gap:14 } },
        h('div', null, h('label', { style:{fontSize:13,fontWeight:600,display:'block',marginBottom:4} }, 'Nome *'), h('input', { type:'text', value:sf.nome||'', onChange:mudar('nome') })),
        h('div', null, h('label', { style:{fontSize:13,fontWeight:600,display:'block',marginBottom:4} }, 'URL *'), h('input', { type:'url', value:sf.url||'', onChange:mudar('url'), placeholder:'https://...' })),
        h('div', null, h('label', { style:{fontSize:13,fontWeight:600,display:'block',marginBottom:4} }, 'Categoria'), h('input', { type:'text', value:sf.categoria||'', onChange:mudar('categoria') })),
        h('label', { style:{display:'flex',gap:8,alignItems:'center',fontSize:14} }, h('input', { type:'checkbox', checked:!!sf.ativo, onChange:mudar('ativo') }), 'Ativo'),
        h('div', { style:{display:'flex',gap:10,justifyContent:'flex-end'} },
          h('button', { onClick:function(){setModal(false);}, style:{padding:'8px 18px',border:'1px solid '+C.cl,borderRadius:8,background:'#fff',cursor:'pointer'} }, 'Cancelar'),
          h('button', { onClick:salvar, disabled:loading, style:{padding:'8px 18px',border:'none',borderRadius:8,background:C.g2,color:'#fff',fontWeight:600,cursor:'pointer'} }, loading?'Salvando…':'Salvar')
        )
      )
    )
  );
}
