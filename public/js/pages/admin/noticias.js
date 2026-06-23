// SGUA — Admin Notícias

var AdminNoticias = function(props) {
  var news = props.news || [], setNews = props.setNews, toast2 = props.toast2;
  var [busca, setBusca] = React.useState('');
  var [showForm, setShowForm] = React.useState(false);
  var [editId, setEditId] = React.useState(null);
  var [confirmDel, setConfirmDel] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var cats = SGUA.NEWS_CATS;
  var emptyForm = { titulo: '', conteudo: '', resumo: '', categoria: 'Geral', fonte: '', link: '', data: '', destaque: false, visivel: true };
  var [form, setForm] = React.useState(emptyForm);

  function setField(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }

  var filtradas = news.filter(function(n) {
    var q = busca.toLowerCase();
    return !q || (n.titulo || n.title || '').toLowerCase().includes(q) || (n.categoria || '').toLowerCase().includes(q);
  });

  function openCreate() { setForm(emptyForm); setEditId(null); setShowForm(true); }
  function openEdit(n) {
    setForm({
      titulo: n.titulo || n.title || '', conteudo: n.conteudo || n.content || '',
      resumo: n.resumo || '', categoria: n.categoria || n.category || 'Geral',
      fonte: n.fonte || n.source || '', link: n.link || '',
      data: (n.data || '').slice(0, 10) || '', destaque: !!n.destaque, visivel: n.visivel !== false
    });
    setEditId(n.id); setShowForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.titulo.trim()) { toast2('Título é obrigatório.', C.rm); return; }
    setSaving(true);
    var r = editId
      ? await API.Noticias.update(editId, form)
      : await API.Noticias.create(form);
    setSaving(false);
    if (!r.ok) { toast2(r.error || 'Erro ao salvar.', C.rm); return; }
    var rn = await API.Noticias.list();
    if (rn.ok) setNews(rn.noticias);
    setShowForm(false);
    toast2(editId ? 'Notícia atualizada!' : 'Notícia criada!', C.g2);
  }

  async function excluir(n) {
    var r = await API.Noticias.remove(n.id);
    if (!r.ok) { toast2(r.error || 'Erro ao excluir.', C.rm); return; }
    var rn = await API.Noticias.list();
    if (rn.ok) setNews(rn.noticias);
    setConfirmDel(null);
    toast2('Notícia excluída.', C.g1);
  }

  return h('div', null,
    h('div', { className: 'admin-topbar' },
      h('h1', { className: 'admin-page-title' }, '📰 Notícias'),
      h('button', { onClick: openCreate }, '+ Nova Notícia')
    ),

    h('div', { className: 'card' },
      h('div', { style: { marginBottom: 14 } },
        h(SearchInput, { value: busca, onChange: setBusca, placeholder: 'Buscar notícias…', maxWidth: 300 })
      ),
      h('div', { className: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'Título'), h('th', null, 'Categoria'), h('th', null, 'Data'), h('th', null, 'Tipo'), h('th', null, 'Vis.'), h('th', null, 'Ações')
          )),
          h('tbody', null,
            filtradas.length === 0
              ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', padding: 24, color: C.cm } }, 'Nenhuma notícia encontrada.'))
              : filtradas.map(function(n) {
                  return h('tr', { key: n.id },
                    h('td', null, Utils.truncate(n.titulo || n.title || '', 50)),
                    h('td', null, n.categoria || n.category || '—'),
                    h('td', null, Utils.fmtDate(n.data || n.created_at)),
                    h('td', null, n.is_rss ? h(Badge, { color: 'blue' }, 'RSS') : h(Badge, { color: 'gray' }, 'Manual')),
                    h('td', null, n.visivel !== false ? '✅' : '🔒'),
                    h('td', null,
                      h('div', { className: 'flex' },
                        !n.is_rss && h('button', { className: 'sm', onClick: function() { openEdit(n); } }, '✏'),
                        h('button', { className: 'sm danger', onClick: function() { setConfirmDel(n); } }, '🗑')
                      )
                    )
                  );
                })
          )
        )
      )
    ),

    showForm && h(Modal, { title: editId ? 'Editar Notícia' : 'Nova Notícia', onClose: function() { setShowForm(false); }, wide: true,
      footer: h(React.Fragment, null,
        h('button', { className: 'secondary', onClick: function() { setShowForm(false); } }, 'Cancelar'),
        h('button', { form: 'news-form', type: 'submit', disabled: saving }, saving ? 'Salvando…' : (editId ? 'Salvar' : 'Criar'))
      )
    },
      h('form', { id: 'news-form', onSubmit: salvar },
        h('div', { className: 'form-group' },
          h('label', null, 'Título *'),
          h('input', { type: 'text', value: form.titulo, onChange: function(e) { setField('titulo', e.target.value); }, required: true, maxLength: 180 })
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'Resumo'),
          h('textarea', { value: form.resumo, onChange: function(e) { setField('resumo', e.target.value); }, rows: 2, maxLength: 500, placeholder: 'Resumo curto para listagens…' })
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'Conteúdo'),
          h('textarea', { value: form.conteudo, onChange: function(e) { setField('conteudo', e.target.value); }, rows: 5, maxLength: 4000 })
        ),
        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Categoria'),
            h('select', { value: form.categoria, onChange: function(e) { setField('categoria', e.target.value); } },
              cats.map(function(c) { return h('option', { key: c, value: c }, c); })
            )
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'Data'),
            h('input', { type: 'date', value: form.data, onChange: function(e) { setField('data', e.target.value); } })
          )
        ),
        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Fonte'),
            h('input', { type: 'text', value: form.fonte, onChange: function(e) { setField('fonte', e.target.value); }, maxLength: 200 })
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'Link'),
            h('input', { type: 'url', value: form.link, onChange: function(e) { setField('link', e.target.value); } })
          )
        ),
        h('div', { className: 'flex', style: { gap: 20 } },
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 } },
            h('input', { type: 'checkbox', checked: form.destaque, onChange: function(e) { setField('destaque', e.target.checked); } }), 'Destacar'
          ),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 } },
            h('input', { type: 'checkbox', checked: form.visivel, onChange: function(e) { setField('visivel', e.target.checked); } }), 'Visível ao público'
          )
        )
      )
    ),

    confirmDel && h(ConfirmDialog, {
      title: 'Excluir Notícia', message: 'Excluir "' + Utils.truncate(confirmDel.titulo || confirmDel.title || '', 60) + '"?',
      confirmLabel: 'Excluir', onCancel: function() { setConfirmDel(null); }, onConfirm: function() { excluir(confirmDel); }
    })
  );
};
