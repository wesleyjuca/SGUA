// SGUA — Admin Usuários

var AdminUsuarios = function(props) {
  var users = props.users || [], setUsers = props.setUsers, toast2 = props.toast2, curUser = props.curUser;
  var [showForm, setShowForm] = React.useState(false);
  var [editId, setEditId] = React.useState(null);
  var [confirmDel, setConfirmDel] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var emptyForm = { name: '', email: '', role: 'viewer', senha: '' };
  var [form, setForm] = React.useState(emptyForm);

  if (!Domain.podeAdmin(curUser)) {
    return h('div', { className: 'section' },
      h(EmptyState, { icon: '🔒', title: 'Acesso restrito', desc: 'Apenas administradores podem gerenciar usuários.' })
    );
  }

  function setField(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }
  function openCreate() { setForm(emptyForm); setEditId(null); setShowForm(true); }
  function openEdit(u) {
    setForm({ name: u.name || '', email: u.email || '', role: u.role || 'viewer', senha: '' });
    setEditId(u.id); setShowForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { toast2('Nome e e-mail são obrigatórios.', C.rm); return; }
    if (!editId && !form.senha) { toast2('Senha é obrigatória para novo usuário.', C.rm); return; }
    setSaving(true);
    var payload = { name: form.name.trim(), email: form.email.trim(), role: form.role };
    if (form.senha) payload.senha = form.senha;
    var r = editId ? await API.Usuarios.update(editId, payload) : await API.Usuarios.create(payload);
    setSaving(false);
    if (!r.ok) { toast2(r.error || 'Erro ao salvar.', C.rm); return; }
    var ru = await API.Usuarios.list();
    if (ru.ok) setUsers(ru.usuarios);
    setShowForm(false);
    toast2(editId ? 'Usuário atualizado!' : 'Usuário criado!', C.g2);
  }

  async function excluir(u) {
    if (u.id === (curUser && curUser.id)) { toast2('Você não pode excluir sua própria conta.', C.rm); setConfirmDel(null); return; }
    var r = await API.Usuarios.remove(u.id);
    if (!r.ok) { toast2(r.error || 'Erro ao excluir.', C.rm); return; }
    var ru = await API.Usuarios.list();
    if (ru.ok) setUsers(ru.usuarios);
    setConfirmDel(null);
    toast2('Usuário excluído.', C.g1);
  }

  return h('div', null,
    h('div', { className: 'admin-topbar' },
      h('h1', { className: 'admin-page-title' }, '👥 Usuários'),
      h('button', { onClick: openCreate }, '+ Novo Usuário')
    ),
    h('div', { className: 'card' },
      h('div', { className: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'Nome'), h('th', null, 'E-mail'), h('th', null, 'Perfil'), h('th', null, 'Criado em'), h('th', null, 'Ações')
          )),
          h('tbody', null,
            users.length === 0
              ? h('tr', null, h('td', { colSpan: 5, style: { textAlign: 'center', padding: 24, color: C.cm } }, 'Nenhum usuário cadastrado.'))
              : users.map(function(u) {
                  var isMe = curUser && u.id === curUser.id;
                  return h('tr', { key: u.id },
                    h('td', null, h('strong', null, u.name || ''), isMe && h(Badge, { color: 'green' }, 'Você')),
                    h('td', null, u.email || ''),
                    h('td', null, h(Badge, { color: u.role === 'admin' ? 'red' : u.role === 'manager' ? 'yellow' : 'gray' }, Domain.roleLabel(u.role))),
                    h('td', null, Utils.fmtDate(u.created_at)),
                    h('td', null,
                      h('div', { className: 'flex' },
                        h('button', { className: 'sm', onClick: function() { openEdit(u); } }, '✏'),
                        !isMe && h('button', { className: 'sm danger', onClick: function() { setConfirmDel(u); } }, '🗑')
                      )
                    )
                  );
                })
          )
        )
      )
    ),

    showForm && h(Modal, { title: editId ? 'Editar Usuário' : 'Novo Usuário', onClose: function() { setShowForm(false); },
      footer: h(React.Fragment, null,
        h('button', { className: 'secondary', onClick: function() { setShowForm(false); } }, 'Cancelar'),
        h('button', { form: 'user-form', type: 'submit', disabled: saving }, saving ? 'Salvando…' : (editId ? 'Salvar' : 'Criar'))
      )
    },
      h('form', { id: 'user-form', onSubmit: salvar },
        h('div', { className: 'form-group' },
          h('label', null, 'Nome completo *'),
          h('input', { type: 'text', value: form.name, onChange: function(e) { setField('name', e.target.value); }, required: true, maxLength: 120 })
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'E-mail *'),
          h('input', { type: 'email', value: form.email, onChange: function(e) { setField('email', e.target.value); }, required: true, maxLength: 160 })
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'Perfil'),
          h('select', { value: form.role, onChange: function(e) { setField('role', e.target.value); } },
            h('option', { value: 'admin' }, 'Administrador'),
            h('option', { value: 'manager' }, 'Gestor'),
            h('option', { value: 'viewer' }, 'Visualizador')
          )
        ),
        h('div', { className: 'form-group' },
          h('label', null, editId ? 'Nova senha (deixe em branco para manter)' : 'Senha *'),
          h('input', { type: 'password', value: form.senha, onChange: function(e) { setField('senha', e.target.value); }, required: !editId, minLength: editId ? 0 : 6, placeholder: editId ? 'Manter senha atual' : 'Mínimo 6 caracteres' })
        )
      )
    ),

    confirmDel && h(ConfirmDialog, {
      title: 'Excluir Usuário', message: 'Excluir o usuário "' + (confirmDel.name || '') + '"?',
      confirmLabel: 'Excluir', onCancel: function() { setConfirmDel(null); }, onConfirm: function() { excluir(confirmDel); }
    })
  );
};
