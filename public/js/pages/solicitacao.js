// SGUA — Formulário público de solicitação de uso

var PgSolicitacao = function(props) {
  var uns = props.uns || [], toast2 = props.toast2;
  var [form, setForm] = React.useState({ unit_id: '', requester_name: '', requester_email: '', usage_type: '', notes: '' });
  var [loading, setLoading] = React.useState(false);
  var [enviado, setEnviado] = React.useState(false);
  var [erro, setErro] = React.useState('');

  var unidadesAtivas = uns.filter(function(u) { return u.status === 'active' || u.status === 'ativo'; });

  function setField(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }

  async function enviar(e) {
    e.preventDefault();
    if (!form.unit_id) { setErro('Selecione uma unidade.'); return; }
    if (!form.requester_name.trim()) { setErro('Nome é obrigatório.'); return; }
    if (!form.usage_type.trim()) { setErro('Tipo de uso é obrigatório.'); return; }
    setLoading(true); setErro('');
    var r = await API.Solicitacoes.create({
      unit_id: Number(form.unit_id),
      requester_name: form.requester_name.trim(),
      requester_email: form.requester_email.trim() || null,
      usage_type: form.usage_type.trim(),
      notes: form.notes.trim() || null
    });
    setLoading(false);
    if (!r.ok) { setErro(r.error || 'Erro ao enviar solicitação.'); return; }
    setEnviado(true);
    toast2 && toast2('Solicitação enviada com sucesso!', C.g2);
  }

  if (enviado) {
    return h('div', { className: 'section', style: { maxWidth: 560, margin: '0 auto', paddingTop: 60, textAlign: 'center' } },
      h('div', { style: { fontSize: 56, marginBottom: 16 } }, '✅'),
      h('h2', { style: { fontSize: 22, fontWeight: 800, color: C.g0, marginBottom: 12 } }, 'Solicitação enviada!'),
      h('p', { style: { color: C.cm, marginBottom: 24 } }, 'Sua solicitação foi registrada e será analisada pela equipe da SEMA/AC. Entraremos em contato pelo e-mail informado.'),
      h('button', { onClick: function() { setEnviado(false); setForm({ unit_id: '', requester_name: '', requester_email: '', usage_type: '', notes: '' }); } }, 'Nova solicitação')
    );
  }

  return h('div', null,
    h('div', { style: { background: C.g0, color: '#fff', padding: '32px 24px', textAlign: 'center' } },
      h('h1', { style: { fontSize: 26, fontWeight: 800, marginBottom: 8 } }, '📋 Solicitar Uso de Unidade'),
      h('p', { style: { fontSize: 15, opacity: .8 } }, 'Preencha o formulário para solicitar o uso de uma de nossas unidades')
    ),
    h('div', { className: 'section', style: { maxWidth: 600, margin: '0 auto' } },
      h('form', { onSubmit: enviar, className: 'card' },
        h('div', { className: 'card-title' }, 'Dados da Solicitação'),

        h('div', { className: 'form-group' },
          h('label', null, 'Unidade *'),
          h('select', { value: form.unit_id, onChange: function(e) { setField('unit_id', e.target.value); }, required: true },
            h('option', { value: '' }, 'Selecione uma unidade…'),
            unidadesAtivas.map(function(u) {
              return h('option', { key: u.id, value: u.id }, (u.name || u.nome || '') + (u.address || u.municipio ? ' — ' + (u.address || u.municipio) : ''));
            })
          )
        ),

        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Nome do solicitante *'),
            h('input', { type: 'text', value: form.requester_name, onChange: function(e) { setField('requester_name', e.target.value); }, placeholder: 'Seu nome completo', required: true, maxLength: 120 })
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'E-mail'),
            h('input', { type: 'email', value: form.requester_email, onChange: function(e) { setField('requester_email', e.target.value); }, placeholder: 'seu@email.com', maxLength: 160 })
          )
        ),

        h('div', { className: 'form-group' },
          h('label', null, 'Tipo de uso *'),
          h('input', { type: 'text', value: form.usage_type, onChange: function(e) { setField('usage_type', e.target.value); }, placeholder: 'Ex: Capacitação ambiental, reunião técnica…', required: true, maxLength: 120 })
        ),

        h('div', { className: 'form-group' },
          h('label', null, 'Observações'),
          h('textarea', { value: form.notes, onChange: function(e) { setField('notes', e.target.value); }, placeholder: 'Datas previstas, número de participantes, necessidades especiais…', rows: 4, maxLength: 1500 })
        ),

        erro && h('div', { style: { background: C.rl, color: C.rm, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 } }, erro),

        h('button', { type: 'submit', disabled: loading, className: 'w-full', style: { fontSize: 15 } },
          loading ? '⏳ Enviando…' : '📤 Enviar Solicitação'
        )
      )
    )
  );
};
