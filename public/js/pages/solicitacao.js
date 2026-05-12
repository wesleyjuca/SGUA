// SGUA — Página de Solicitação pública

function PgSolicitacao(props) {
  var uns = props.uns || [];
  var [sf, setSf] = React.useState({ solicitante:'', organizacao:'', unidade:'', evento:'', dataEvento:'', email:'' });
  var [enviado, setEnviado] = React.useState(false);
  var [loading, setLoading] = React.useState(false);
  var [errs, setErrs] = React.useState([]);

  var mudar = function(k) { return function(e) { setSf(function(p){return Object.assign({},p,{[k]:e.target.value});}); }; };
  var lbl = function(t) { return h('label', { style:{ fontSize:13, fontWeight:600, display:'block', marginBottom:4, color:C.cd } }, t); };

  async function enviar() {
    var e = validateFields(sf, [
      { field:'solicitante', label:'Nome',     required:true, maxLen:100 },
      { field:'unidade',     label:'Unidade',  required:true },
      { field:'evento',      label:'Finalidade',required:true, maxLen:200 }
    ]);
    if (e.length) { setErrs(e); return; }
    setErrs([]);
    setLoading(true);
    var r = await API.Solicitacoes.create({ solicitante:sf.solicitante, organizacao:sf.organizacao, unidade:sf.unidade, evento:sf.evento, dataEvento:sf.dataEvento });
    setLoading(false);
    if (r.ok) setEnviado(true);
    else setErrs([r.error || 'Erro ao enviar. Tente novamente.']);
  }

  if (enviado) return h('div', { style:{ maxWidth:540, margin:'60px auto', padding:'0 24px', textAlign:'center' } },
    h('div', { style:{ fontSize:48 } }, '✅'),
    h('h2', { style:{ fontWeight:800, color:C.g1, marginTop:16 } }, 'Solicitação enviada!'),
    h('p', { style:{ color:C.cm, marginTop:8 } }, 'Sua solicitação foi registrada e será analisada pela equipe SEMA/AC.'),
    h('button', { onClick:function(){setSf({solicitante:'',organizacao:'',unidade:'',evento:'',dataEvento:''});setEnviado(false);}, style:{ marginTop:24, background:C.g2, color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', fontWeight:600, cursor:'pointer' } }, 'Nova Solicitação')
  );

  return h('div', { style:{ maxWidth:600, margin:'0 auto', padding:'40px 24px' } },
    h('h1', { style:{ fontSize:24, fontWeight:800, color:C.cd, marginBottom:8 } }, '📋 Solicitação de Uso'),
    h('p', { style:{ color:C.cm, marginBottom:28, fontSize:14 } }, 'Preencha o formulário para solicitar o uso de uma unidade CIMA ou UGAI.'),

    errs.length > 0 && h('div', { style:{ background:C.rl, color:C.rm, borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13 } },
      errs.map(function(e,i){ return h('div', {key:i}, '• ' + e); })
    ),

    h(Card, null,
      h('div', { style:{ display:'flex', flexDirection:'column', gap:16 } },
        h('div', null, lbl('Seu nome *'), h('input', { type:'text', value:sf.solicitante, onChange:mudar('solicitante'), placeholder:'Nome completo' })),
        h('div', null, lbl('Organização / Órgão'), h('input', { type:'text', value:sf.organizacao, onChange:mudar('organizacao'), placeholder:'Nome do órgão ou empresa' })),
        h('div', null, lbl('Email de contato'), h('input', { type:'email', value:sf.email, onChange:mudar('email'), placeholder:'seu@email.com' })),
        h('div', null, lbl('Unidade desejada *'),
          h('select', { value:sf.unidade, onChange:mudar('unidade') },
            h('option', { value:'' }, 'Selecione a unidade...'),
            uns.filter(function(u){return u.status !== 'inativo';}).map(function(u){
              return h('option', { key:u.id, value:u.nome }, '['+u.tipo+'] ' + u.nome + ' — ' + u.municipio);
            })
          )
        ),
        h('div', null, lbl('Finalidade / Evento *'), h('textarea', { value:sf.evento, onChange:mudar('evento'), rows:3, placeholder:'Descreva o objetivo do uso da unidade...' })),
        h('div', null, lbl('Data prevista'), h('input', { type:'date', value:sf.dataEvento, onChange:mudar('dataEvento') })),
        h('button', { onClick:enviar, disabled:loading, style:{ background:C.g2, color:'#fff', border:'none', borderRadius:10, padding:'12px', fontWeight:700, cursor:'pointer', fontSize:15 } }, loading ? 'Enviando…' : '✉ Enviar Solicitação')
      )
    )
  );
}
