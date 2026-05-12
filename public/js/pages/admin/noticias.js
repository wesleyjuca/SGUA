// SGUA — Admin: Gerenciamento de Notícias

function AdminNoticias(props) {
  var news = props.news||[], setNews = props.setNews, toast2 = props.toast2, canDo = props.canDo;
  var [modal, setModal] = React.useState(false);
  var [sf, setSf] = React.useState({});
  var [loading, setLoading] = React.useState(false);
  var [conf, setConf] = React.useState(null);
  var [page, setPage] = React.useState(1);

  var pageItems = news.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  function abrirNova() { setSf({ data:today(), visivel:true, destaque:false }); setModal('novo'); }
  function abrirEditar(n) { setSf(Object.assign({},n)); setModal('editar'); }

  async function salvar() {
    var errs = validateFields(sf, NW_RULES);
    if (errs.length) { toast2(errs.join(' | '), C.rm); return; }
    setLoading(true);
    var r = modal==='novo' ? await API.Noticias.create(sf) : await API.Noticias.update(sf.id, sf);
    setLoading(false);
    if (!r.ok) { toast2(r.error||'Erro ao salvar', C.rm); return; }
    if (modal==='novo') setNews(function(p){return [r.noticia].concat(p);});
    else setNews(function(p){return p.map(function(n){return n.id===r.noticia.id?r.noticia:n;});});
    setModal(false);
    toast2(modal==='novo'?'Notícia criada!':'Notícia atualizada!', C.g1);
  }

  async function excluir(n) {
    setConf(null);
    var r = await API.Noticias.remove(n.id);
    if (!r.ok) { toast2(r.error||'Erro ao excluir', C.rm); return; }
    setNews(function(p){return p.filter(function(x){return x.id!==n.id;});});
    toast2('Notícia excluída.', C.g1);
  }

  return h('div', null,
    h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 } },
      h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd } }, 'Notícias (' + news.length + ')'),
      canDo('news') && h('button', { onClick:abrirNova, style:{ background:C.g2, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:600, cursor:'pointer' } }, '+ Nova Notícia')
    ),
    h('table', null,
      h('thead', null, h('tr', null,
        h('th', null,'Título'), h('th', null,'Data'), h('th', null,'Categoria'), h('th', null,'Status'), h('th', null,'Ações')
      )),
      h('tbody', null,
        pageItems.map(function(n) {
          return h('tr', { key:n.id },
            h('td', null, h('div', null,
              n.destaque && h(Pill, { bg:C.al, color:C.am }, '⭐'),
              ' ' + n.titulo
            )),
            h('td', null, formatData(n.data)),
            h('td', null, n.categoria||'—'),
            h('td', null, h(Pill, { bg:n.visivel?C.gx:C.rl, color:n.visivel?C.g2:C.rm }, n.visivel?'Visível':'Oculta')),
            h('td', null, canDo('news') && h('div', { style:{display:'flex',gap:6} },
              h('button', { onClick:function(){abrirEditar(n);}, style:{padding:'4px 10px',border:'1px solid '+C.cl,borderRadius:6,fontSize:12,cursor:'pointer',background:'#fff'} }, 'Editar'),
              h('button', { onClick:function(){setConf(n);}, style:{padding:'4px 10px',border:'none',borderRadius:6,fontSize:12,cursor:'pointer',background:C.rl,color:C.rm} }, 'Excluir')
            ))
          );
        })
      )
    ),
    h(Pagination, { page:page, total:news.length, onChange:setPage }),
    h(Modal, { open:!!modal, title:modal==='novo'?'Nova Notícia':'Editar Notícia', onClose:function(){setModal(false);}, maxWidth:620 },
      h(FmNw, { sf:sf, setSf:setSf, onSave:salvar, onClose:function(){setModal(false);}, loading:loading })
    ),
    h(Confirm, { open:!!conf, msg:'Excluir notícia "'+((conf&&conf.titulo)||'')+ '"?', onConfirm:function(){excluir(conf);}, onCancel:function(){setConf(null);} })
  );
}
