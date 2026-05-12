// SGUA — Admin: Relatórios (export/import)

function AdminRelatorios(props) {
  var uns = props.uns||[], news = props.news||[], sols = props.sols||[];
  var [tab, setTab] = React.useState('export');
  var [dataset, setDataset] = React.useState('uns');
  var [fmt, setFmt] = React.useState('csv');

  var datasets = { uns:'Unidades', news:'Notícias', sols:'Solicitações' };
  var dataMap = { uns:uns, news:news, sols:sols };
  var colsMap = { uns:UN_COLS, news:NW_COLS, sols:SOL_COLS };

  function exportar() {
    var rows = dataMap[dataset];
    var cols = colsMap[dataset];
    var fname = dataset + '_' + today() + '.' + fmt;
    if (fmt === 'csv') exportCSV(rows, cols, fname);
    else exportXLSX(rows, cols, fname);
  }

  var btnStyle = function(active) { return { padding:'7px 18px', border:'none', borderRadius:20, background:active?C.g2:'#fff', color:active?'#fff':C.cm, fontWeight:active?700:500, cursor:'pointer', boxShadow:active?'none':'0 0 0 1px '+C.cl }; };

  return h('div', null,
    h('h2', { style:{ fontSize:20, fontWeight:700, color:C.cd, marginBottom:20 } }, 'Relatórios'),
    h('div', { style:{ display:'flex', gap:8, marginBottom:24 } },
      h('button', { onClick:function(){setTab('export');}, style:btnStyle(tab==='export') }, '📤 Exportar'),
      h('button', { onClick:function(){setTab('import');}, style:btnStyle(tab==='import') }, '📥 Importar')
    ),

    tab === 'export' && h(Card, null,
      h('h3', { style:{ fontWeight:700, marginBottom:16 } }, 'Exportar dados'),
      h('div', { style:{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:20 } },
        h('div', null,
          h('label', { style:{fontSize:13,fontWeight:600,display:'block',marginBottom:6} }, 'Dataset'),
          h('select', { value:dataset, onChange:function(e){setDataset(e.target.value);}, style:{padding:'8px 12px',border:'1px solid '+C.cl,borderRadius:8,fontSize:13} },
            Object.entries(datasets).map(function(kv){ return h('option', {key:kv[0],value:kv[0]}, kv[1]); })
          )
        ),
        h('div', null,
          h('label', { style:{fontSize:13,fontWeight:600,display:'block',marginBottom:6} }, 'Formato'),
          h('select', { value:fmt, onChange:function(e){setFmt(e.target.value);}, style:{padding:'8px 12px',border:'1px solid '+C.cl,borderRadius:8,fontSize:13} },
            h('option', { value:'csv' }, 'CSV'),
            h('option', { value:'xlsx' }, 'XLSX (Excel)')
          )
        )
      ),
      h('div', { style:{ color:C.cm, fontSize:13, marginBottom:16 } },
        (dataMap[dataset]||[]).length + ' registros em ' + datasets[dataset]
      ),
      h('button', { onClick:exportar, style:{ background:C.g2, color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', fontWeight:700, cursor:'pointer' } },
        '⬇ Baixar ' + datasets[dataset] + '.' + fmt
      )
    ),

    tab === 'import' && h(Card, null,
      h('h3', { style:{ fontWeight:700, marginBottom:12 } }, 'Importar dados'),
      h('p', { style:{ color:C.cm, fontSize:13 } }, 'Para importar, use a função de importação na aba de Unidades ou faça upload direto pelo painel Supabase.')
    )
  );
}
