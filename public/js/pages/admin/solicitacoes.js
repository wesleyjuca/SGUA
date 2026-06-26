// SGUA — Admin Solicitações

var AdminSolicitacoes = function(props) {
  var sols = props.sols || [], setSols = props.setSols, uns = props.uns || [], toast2 = props.toast2;
  var [filtroStatus, setFiltroStatus] = React.useState('');
  var [confirmAction, setConfirmAction] = React.useState(null);

  var filtradas = sols.filter(function(s) { return !filtroStatus || s.status === filtroStatus; });
  var pendentes = sols.filter(function(s) { return s.status === 'pending'; }).length;

  async function atualizar(sol, novoStatus) {
    var r = await API.Solicitacoes.update(sol.id, { status: novoStatus });
    if (!r.ok) { toast2(r.error || 'Erro ao atualizar.', C.rm); return; }
    var rs = await API.Solicitacoes.list();
    if (rs.ok) setSols(rs.solicitacoes);
    setConfirmAction(null);
    toast2('Status atualizado!', C.g2);
  }

  return h('div', null,
    h('div', { className: 'admin-topbar' },
      h('h1', { className: 'admin-page-title' }, '📋 Solicitações'),
      pendentes > 0 && h(Badge, { color: 'yellow' }, pendentes + ' pendente' + (pendentes !== 1 ? 's' : ''))
    ),

    h('div', { className: 'card' },
      h('div', { style: { marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' } },
        h('select', { value: filtroStatus, onChange: function(e) { setFiltroStatus(e.target.value); }, style: { width: 'auto', minWidth: 160 } },
          h('option', { value: '' }, 'Todos os status'),
          h('option', { value: 'pending' }, 'Pendentes'),
          h('option', { value: 'approved' }, 'Aprovadas'),
          h('option', { value: 'rejected' }, 'Rejeitadas')
        ),
        h('span', { style: { fontSize: 13, color: C.cm } }, filtradas.length + ' resultado' + (filtradas.length !== 1 ? 's' : ''))
      ),
      filtradas.length === 0
        ? h(EmptyState, { icon: '📋', title: 'Nenhuma solicitação', desc: 'Solicitações de uso das unidades aparecerão aqui.' })
        : h('div', { className: 'table-wrap' },
            h('table', null,
              h('thead', null, h('tr', null,
                h('th', null, 'Solicitante'), h('th', null, 'Unidade'), h('th', null, 'Tipo de Uso'), h('th', null, 'Status'), h('th', null, 'Data'), h('th', null, 'Ações')
              )),
              h('tbody', null,
                filtradas.map(function(s) {
                  var unidade = uns.find(function(u) { return u.id === (s.unit_id || s.unit); });
                  return h('tr', { key: s.id },
                    h('td', null,
                      h('div', null, h('strong', null, s.requester_name || s.sol || '')),
                      s.requester_email && h('div', { style: { fontSize: 12, color: C.cm } }, s.requester_email)
                    ),
                    h('td', null, (unidade && (unidade.name || unidade.nome)) || s.unit_name || s.un || '—'),
                    h('td', null, s.usage_type || s.ev || '—'),
                    h('td', null, h(Badge, { color: Domain.requestStatusColor(s.status) }, Domain.requestStatusLabel(s.status))),
                    h('td', null, Utils.fmtDate(s.created_at || s.dt)),
                    h('td', null,
                      s.status === 'pending' && h('div', { className: 'flex' },
                        h('button', { className: 'sm', style: { background: C.g2 }, onClick: function() { setConfirmAction({ sol: s, status: 'approved', label: 'Aprovar' }); } }, '✅ Aprovar'),
                        h('button', { className: 'sm danger', onClick: function() { setConfirmAction({ sol: s, status: 'rejected', label: 'Rejeitar' }); } }, '❌ Rejeitar')
                      )
                    )
                  );
                })
              )
            )
          )
    ),

    confirmAction && h(ConfirmDialog, {
      title: confirmAction.label + ' Solicitação',
      message: confirmAction.label + ' a solicitação de "' + (confirmAction.sol.requester_name || '') + '"?',
      confirmLabel: confirmAction.label,
      onCancel: function() { setConfirmAction(null); },
      onConfirm: function() { atualizar(confirmAction.sol, confirmAction.status); }
    })
  );
};
