// SGUA — Admin: Gerenciamento de Solicitações

function AdminSols(props) {
  var sols = props.sols||[], setSols = props.setSols, uns = props.uns||[], toast2 = props.toast2, canDo = props.canDo;
  var [page, setPage] = React.useState(1);
  var [filtStatus, setFiltStatus] = React.useState('');
  var [loading, setLoading] = React.useState(null);

  var filtered = React.useMemo(function() {
    if (!filtStatus) return sols;
    return sols.filter(function(s){ return (s.status||s.st) === filtStatus; });
  }, [sols, filtStatus]);

  var pageItems = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  async function mudarStatus(s, status) {
    setLoading(s.id);
    var r = await API.Solicitacoes.update(s.id, status);
    setLoading(null);
    if (!r.ok) { toast2(r.error||'Erro ao atualizar', C.rm); return; }
    setSols(function(p){ return p.map(function(x){ return x.id===s.id ? Object.assign({},x,{status:status,st:status}) : x; }); });
    toast2(status==='aprovada' ? '✅ Solicitação aprovada!' : '❌ Solicitação rejeitada.', status==='aprovada'?C.g1:C.rm);
  }

  async function excluir(s) {
    var r = await API.Solicitacoes.remove(s.id);
    if (!r.ok) { toast2(r.error||'Erro ao excluir', C.rm); return; }
    setSols(function(p){ return p.filter(function(x){ return x.id!==s.id; }); });
    toast2('Solicitação removida.', C.g1);
  }

  var corStatus = { pendente:[C.al,C.am], aprovada:[C.gx,C.g2], rejeitada:[C.rl,C.rm] };

  return h('div', null,
    h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 } },
      h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd } }, 'Solicitações (' + sols.length + ')'),
      h('select', { value:filtStatus, onChange:function(e){setFiltStatus(e.target.value);setPage(1);}, style:{padding:'7px 12px',border:'1px solid '+C.cl,borderRadius:8,fontSize:13} },
        h('option', { value:'' }, 'Todos os status'),
        h('option', { value:'pendente' }, 'Pendentes'),
        h('option', { value:'aprovada' }, 'Aprovadas'),
        h('option', { value:'rejeitada' }, 'Rejeitadas')
      )
    ),

    filtered.length === 0 && h('p', { style:{ color:C.cm, padding:'20px 0' } }, 'Nenhuma solicitação encontrada.'),

    h('div', { style:{ display:'flex', flexDirection:'column', gap:12 } },
      pageItems.map(function(s) {
        var st = s.status || s.st || 'pendente';
        var cores = corStatus[st] || corStatus.pendente;
        var isPend = st === 'pendente';
        var isLoad = loading === s.id;
        return h(Card, { key:s.id, p:16 },
          h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 } },
            h('div', { style:{ flex:1 } },
              h('div', { style:{ display:'flex', gap:8, alignItems:'center', marginBottom:6 } },
                h(Pill, { bg:cores[0], color:cores[1] }, st),
                h('span', { style:{ fontSize:12, color:C.cm } }, s.id)
              ),
              h('div', { style:{ fontWeight:700, fontSize:15, color:C.cd } }, s.solicitante||s.sol||'—'),
              s.organizacao||s.org ? h('div', { style:{ fontSize:13, color:C.cm } }, s.organizacao||s.org) : null,
              h('div', { style:{ fontSize:13, marginTop:6 } },
                h('strong', null, '🏛 '), s.unidade||s.un||'—'
              ),
              (s.evento||s.ev) && h('div', { style:{ fontSize:13, color:C.cm } }, '📌 ', s.evento||s.ev),
              (s.data_evento||s.dt) && h('div', { style:{ fontSize:13, color:C.cm } }, '📅 ', formatData(s.data_evento||s.dt))
            ),
            canDo('sols') && h('div', { style:{ display:'flex', gap:8, flexWrap:'wrap' } },
              isPend && h('button', { onClick:function(){mudarStatus(s,'aprovada');}, disabled:isLoad, style:{padding:'7px 14px',border:'none',borderRadius:8,background:C.g2,color:'#fff',fontWeight:600,cursor:'pointer',fontSize:13} }, isLoad?'…':'✅ Aprovar'),
              isPend && h('button', { onClick:function(){mudarStatus(s,'rejeitada');}, disabled:isLoad, style:{padding:'7px 14px',border:'none',borderRadius:8,background:C.rl,color:C.rm,fontWeight:600,cursor:'pointer',fontSize:13} }, '❌ Rejeitar'),
              h('button', { onClick:function(){excluir(s);}, style:{padding:'7px 14px',border:'1px solid '+C.cl,borderRadius:8,background:'#fff',cursor:'pointer',fontSize:12} }, '🗑')
            )
          )
        );
      })
    ),
    h(Pagination, { page:page, total:filtered.length, onChange:setPage })
  );
}
