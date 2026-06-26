// SGUA — Admin Unidades

var AdminUnidades = function(props) {
  var uns = props.uns || [], setUns = props.setUns, toast2 = props.toast2;
  var [busca, setBusca] = React.useState('');
  var [editId, setEditId] = React.useState(null);
  var [showForm, setShowForm] = React.useState(false);
  var [confirmDel, setConfirmDel] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var emptyForm = { name: '', address: '', description: '', latitude: '', longitude: '', status: 'active', capacity: 0, contact_name: '', contact_email: '', contact_phone: '' };
  var [form, setForm] = React.useState(emptyForm);

  var filtradas = Utils.filterBy(uns, busca, ['name', 'nome', 'address', 'municipio']);

  function setField(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }

  function openCreate() { setForm(emptyForm); setEditId(null); setShowForm(true); }
  function openEdit(u) {
    setForm({
      name: u.name || u.nome || '', address: u.address || u.municipio || '',
      description: u.description || u.descricao || '',
      latitude: u.latitude != null ? String(u.latitude) : '',
      longitude: u.longitude != null ? String(u.longitude) : '',
      status: u.status === 'ativo' ? 'active' : (u.status || 'active'),
      capacity: u.capacity || 0,
      contact_name: u.contact_name || '', contact_email: u.contact_email || '', contact_phone: u.contact_phone || ''
    });
    setEditId(u.id); setShowForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast2('Nome é obrigatório.', C.rm); return; }
    setSaving(true);
    var payload = {
      name: form.name.trim(), address: form.address.trim() || null,
      description: form.description.trim() || null,
      latitude: form.latitude !== '' ? Number(form.latitude) : null,
      longitude: form.longitude !== '' ? Number(form.longitude) : null,
      status: form.status, capacity: Number(form.capacity) || 0,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null
    };
    var r = editId ? await API.Unidades.update(editId, payload) : await API.Unidades.create(payload);
    setSaving(false);
    if (!r.ok) { toast2(r.error || 'Erro ao salvar.', C.rm); return; }
    var ru = await API.Unidades.list();
    if (ru.ok) setUns(ru.unidades);
    setShowForm(false);
    toast2(editId ? 'Unidade atualizada!' : 'Unidade criada!', C.g2);
  }

  async function excluir(u) {
    var r = await API.Unidades.remove(u.id);
    if (!r.ok) { toast2(r.error || 'Erro ao excluir.', C.rm); return; }
    var ru = await API.Unidades.list();
    if (ru.ok) setUns(ru.unidades);
    setConfirmDel(null);
    toast2('Unidade excluída.', C.g1);
  }

  return h('div', null,
    h('div', { className: 'admin-topbar' },
      h('h1', { className: 'admin-page-title' }, '🏠 Unidades'),
      h('button', { onClick: openCreate }, '+ Nova Unidade')
    ),

    h('div', { className: 'card' },
      h('div', { style: { marginBottom: 14 } },
        h(SearchInput, { value: busca, onChange: setBusca, placeholder: 'Buscar unidades…', maxWidth: 300 })
      ),
      h('div', { className: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'Nome'), h('th', null, 'Endereço'), h('th', null, 'Status'), h('th', null, 'Cap.'), h('th', null, 'Ocup.'), h('th', null, 'Ações')
          )),
          h('tbody', null,
            filtradas.length === 0
              ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', padding: 24, color: C.cm } }, 'Nenhuma unidade encontrada.'))
              : filtradas.map(function(u) {
                  return h('tr', { key: u.id },
                    h('td', null, h('strong', null, u.name || u.nome || '')),
                    h('td', null, u.address || u.municipio || '—'),
                    h('td', null, h(Badge, { color: Domain.statusColor(u.status) }, Domain.statusLabel(u.status))),
                    h('td', null, u.capacity || '∞'),
                    h('td', null, u.current_occupancy || 0),
                    h('td', null,
                      h('div', { className: 'flex' },
                        h('button', { className: 'sm', onClick: function() { openEdit(u); } }, '✏ Editar'),
                        h('button', { className: 'sm danger', onClick: function() { setConfirmDel(u); } }, '🗑')
                      )
                    )
                  );
                })
          )
        )
      )
    ),

    showForm && h(Modal, { title: editId ? 'Editar Unidade' : 'Nova Unidade', onClose: function() { setShowForm(false); }, wide: true,
      footer: h(React.Fragment, null,
        h('button', { className: 'secondary', onClick: function() { setShowForm(false); } }, 'Cancelar'),
        h('button', { form: 'unit-form', type: 'submit', disabled: saving }, saving ? 'Salvando…' : (editId ? 'Salvar' : 'Criar'))
      )
    },
      h('form', { id: 'unit-form', onSubmit: salvar },
        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Nome *'),
            h('input', { type: 'text', value: form.name, onChange: function(e) { setField('name', e.target.value); }, required: true, maxLength: 140 })
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'Endereço / Município'),
            h('input', { type: 'text', value: form.address, onChange: function(e) { setField('address', e.target.value); }, maxLength: 255 })
          )
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'Descrição'),
          h('textarea', { value: form.description, onChange: function(e) { setField('description', e.target.value); }, rows: 3, maxLength: 1000 })
        ),
        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Latitude'),
            h('input', { type: 'number', step: 'any', value: form.latitude, onChange: function(e) { setField('latitude', e.target.value); } })
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'Longitude'),
            h('input', { type: 'number', step: 'any', value: form.longitude, onChange: function(e) { setField('longitude', e.target.value); } })
          )
        ),
        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Status'),
            h('select', { value: form.status, onChange: function(e) { setField('status', e.target.value); } },
              h('option', { value: 'active' }, 'Ativa'),
              h('option', { value: 'inactive' }, 'Inativa')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'Capacidade'),
            h('input', { type: 'number', min: 0, value: form.capacity, onChange: function(e) { setField('capacity', e.target.value); } })
          )
        ),
        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Responsável'),
            h('input', { type: 'text', value: form.contact_name, onChange: function(e) { setField('contact_name', e.target.value); }, maxLength: 120 })
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'E-mail de contato'),
            h('input', { type: 'email', value: form.contact_email, onChange: function(e) { setField('contact_email', e.target.value); }, maxLength: 160 })
          )
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'Telefone'),
          h('input', { type: 'tel', value: form.contact_phone, onChange: function(e) { setField('contact_phone', e.target.value); }, maxLength: 30 })
        )
      )
    ),

    confirmDel && h(ConfirmDialog, {
      title: 'Excluir Unidade',
      message: 'Tem certeza que deseja excluir "' + (confirmDel.name || confirmDel.nome) + '"? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir', onCancel: function() { setConfirmDel(null); },
      onConfirm: function() { excluir(confirmDel); }
    })
  );
};
