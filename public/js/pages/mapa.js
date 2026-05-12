// SGUA — Página Mapa

function PgMapa(props) {
  var uns = props.uns || [], go = props.go;
  var [filtTipo, setFiltTipo] = React.useState('');
  var [filtMun, setFiltMun] = React.useState('');
  var [filtBusca, setFiltBusca] = React.useState('');

  var municipios = React.useMemo(function() {
    return Array.from(new Set(uns.map(function(u){return u.municipio;}))).sort();
  }, [uns]);

  var filtered = React.useMemo(function() {
    return uns.filter(function(u) {
      if (filtTipo && u.tipo !== filtTipo) return false;
      if (filtMun  && u.municipio !== filtMun) return false;
      if (filtBusca) {
        var q = filtBusca.toLowerCase();
        return (u.nome||'').toLowerCase().includes(q) || (u.municipio||'').toLowerCase().includes(q);
      }
      return true;
    });
  }, [uns, filtTipo, filtMun, filtBusca]);

  var inp = { border:'1px solid '+C.cl, borderRadius:8, padding:'7px 12px', fontSize:13, background:'#fff' };

  return h('div', { style:{ display:'grid', gridTemplateColumns:'280px 1fr', height:'calc(100vh - 56px)', overflow:'hidden' } },
    h('div', { style:{ background:'#fff', borderRight:'1px solid '+C.cl, display:'flex', flexDirection:'column', overflow:'hidden' } },
      h('div', { style:{ padding:'16px', borderBottom:'1px solid '+C.cl } },
        h('h2', { style:{ fontWeight:700, fontSize:16, marginBottom:14, color:C.cd } }, '🗺 Filtros'),
        h('div', { style:{ display:'flex', flexDirection:'column', gap:10 } },
          h('input', { placeholder:'Buscar unidade...', value:filtBusca, onChange:function(e){setFiltBusca(e.target.value);}, style:inp }),
          h('select', { value:filtTipo, onChange:function(e){setFiltTipo(e.target.value);}, style:inp },
            h('option', { value:'' }, 'Todos os tipos'),
            h('option', { value:'CIMA' }, 'CIMA'),
            h('option', { value:'UGAI' }, 'UGAI')
          ),
          h('select', { value:filtMun, onChange:function(e){setFiltMun(e.target.value);}, style:inp },
            h('option', { value:'' }, 'Todos os municípios'),
            municipios.map(function(m){ return h('option', { key:m, value:m }, m); })
          )
        )
      ),
      h('div', { style:{ flex:1, overflowY:'auto', padding:'8px' } },
        filtered.length === 0 && h('p', { style:{ color:C.cm, fontSize:13, padding:'12px 8px' } }, 'Nenhuma unidade encontrada.'),
        filtered.map(function(u) {
          var cor = u.tipo === 'CIMA' ? C.g1 : C.b1;
          return h('div', { key:u.id, onClick:function(){go('unidade',u);}, style:{ padding:'10px 12px', borderRadius:10, cursor:'pointer', marginBottom:4, border:'1px solid '+C.cl, transition:'background .15s' },
            onMouseEnter:function(e){e.currentTarget.style.background=C.cx;},
            onMouseLeave:function(e){e.currentTarget.style.background='#fff';}
          },
            h('div', { style:{ fontWeight:600, fontSize:13, color:C.cd } }, u.nome),
            h('div', { style:{ display:'flex', gap:8, alignItems:'center', marginTop:4 } },
              h(Pill, { bg:cor==='#0F5C3A'?C.gx:C.bl, color:cor }, u.tipo),
              h('span', { style:{ fontSize:12, color:C.cm } }, u.municipio)
            ),
            h(Bar, { pct:u.taxa_uso||u.taxaUso||0, h:4 })
          );
        })
      )
    ),
    h('div', { style:{ position:'relative' } },
      h(MapView, { units:filtered, height:'calc(100vh - 56px)' })
    )
  );
}
