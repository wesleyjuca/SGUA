// SGUA — Admin Feeds RSS

var AdminFeeds = function(props) {
  var feeds = props.feeds || [], setFeeds = props.setFeeds, toast2 = props.toast2;
  var [showForm, setShowForm] = React.useState(false);
  var [syncingId, setSyncingId] = React.useState(null);
  var [confirmDel, setConfirmDel] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var emptyForm = { nome: '', url: '', categoria: 'Geral', frequencia: 'diaria', palavras_chave: '', ativo: true };
  var [form, setForm] = React.useState(emptyForm);

  function setField(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }

  async function salvar(e) {
    e.preventDefault();
    if (!form.nome.trim() || !form.url.trim()) { toast2('Nome e URL são obrigatórios.', C.rm); return; }
    setSaving(true);
    var r = await API.Feeds.create(form);
    setSaving(false);
    if (!r.ok) { toast2(r.error || 'Erro ao salvar feed.', C.rm); return; }
    var rf = await API.Feeds.list();
    if (rf.ok) setFeeds(rf.feeds);
    setShowForm(false); setForm(emptyForm);
    toast2('Feed adicionado!', C.g2);
  }

  async function syncFeed(f) {
    setSyncingId(f.id);
    var r = await API.Feeds.sync(f.id);
    setSyncingId(null);
    if (!r.ok) { toast2('Erro: ' + (r.error || 'falha'), C.rm); return; }
    var rf = await API.Feeds.list();
    if (rf.ok) setFeeds(rf.feeds);
    toast2('Feed sincronizado! ' + (r.added || 0) + ' nova(s) notícia(s).', C.g2);
  }

  async function toggleFeed(f) {
    var r = await API.Feeds.toggle(f.id);
    if (!r.ok) { toast2(r.error || 'Erro.', C.rm); return; }
    var rf = await API.Feeds.list();
    if (rf.ok) setFeeds(rf.feeds);
  }

  async function excluir(f) {
    var r = await API.Feeds.remove(f.id);
    if (!r.ok) { toast2(r.error || 'Erro ao excluir.', C.rm); return; }
    var rf = await API.Feeds.list();
    if (rf.ok) setFeeds(rf.feeds);
    setConfirmDel(null);
    toast2('Feed removido.', C.g1);
  }

  var statusColors = { ativo: 'green', sincronizando: 'blue', invalido: 'red', sem_resposta: 'yellow', aguardando: 'gray' };

  return h('div', null,
    h('div', { className: 'admin-topbar' },
      h('h1', { className: 'admin-page-title' }, '📡 Feeds RSS'),
      h('button', { onClick: function() { setShowForm(true); } }, '+ Adicionar Feed')
    ),

    feeds.length === 0
      ? h(EmptyState, { icon: '📡', title: 'Nenhum feed cadastrado', desc: 'Adicione feeds RSS para importar notícias automaticamente.',
          action: h('button', { onClick: function() { setShowForm(true); } }, '+ Adicionar Feed') })
      : h('div', null,
          feeds.map(function(f) {
            var isSyncing = syncingId === f.id;
            return h('div', { key: f.id, className: 'card', style: { marginBottom: 12 } },
              h('div', { className: 'flex-between' },
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { fontWeight: 700, fontSize: 15 } }, f.nome),
                  h('a', { href: f.url, target: '_blank', rel: 'noreferrer', style: { fontSize: 12, color: C.g1, wordBreak: 'break-all' } }, f.url)
                ),
                h('div', { className: 'flex', style: { flexShrink: 0 } },
                  h(Badge, { color: statusColors[f.status] || 'gray' }, f.status || 'aguardando'),
                  h('button', { className: 'sm', style: { background: f.ativo ? C.yl : C.g3, color: f.ativo ? C.ym : C.g0 }, onClick: function() { toggleFeed(f); } }, f.ativo ? '⏸' : '▶'),
                  h('button', { className: 'sm', disabled: isSyncing || !f.ativo, onClick: function() { syncFeed(f); } }, isSyncing ? '⏳' : '🔄 Sync'),
                  h('button', { className: 'sm danger', onClick: function() { setConfirmDel(f); } }, '🗑')
                )
              ),
              h('div', { style: { marginTop: 8, fontSize: 12, color: C.cm, display: 'flex', gap: 16, flexWrap: 'wrap' } },
                h('span', null, '🏷 ' + (f.categoria || 'Geral')),
                h('span', null, '📅 ' + (f.frequencia || 'diaria')),
                f.ultimo_sync && h('span', null, '🕐 ' + Utils.fmtRelative(f.ultimo_sync)),
                h('span', null, '📊 ' + (f.total_noticias || 0) + ' notícias'),
                f.ultimo_erro && h('span', { style: { color: C.rm } }, '⚠ ' + f.ultimo_erro.slice(0, 60))
              )
            );
          })
        ),

    showForm && h(Modal, { title: 'Novo Feed RSS', onClose: function() { setShowForm(false); },
      footer: h(React.Fragment, null,
        h('button', { className: 'secondary', onClick: function() { setShowForm(false); } }, 'Cancelar'),
        h('button', { form: 'feed-form', type: 'submit', disabled: saving }, saving ? 'Validando…' : 'Adicionar')
      )
    },
      h('form', { id: 'feed-form', onSubmit: salvar },
        h('div', { className: 'form-group' },
          h('label', null, 'Nome *'),
          h('input', { type: 'text', value: form.nome, onChange: function(e) { setField('nome', e.target.value); }, required: true, maxLength: 200 })
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'URL do feed *'),
          h('input', { type: 'url', value: form.url, onChange: function(e) { setField('url', e.target.value); }, required: true, placeholder: 'https://…/feed.rss' })
        ),
        h('div', { className: 'form-row' },
          h('div', { className: 'form-group' },
            h('label', null, 'Categoria'),
            h('select', { value: form.categoria, onChange: function(e) { setField('categoria', e.target.value); } },
              SGUA.NEWS_CATS.map(function(c) { return h('option', { key: c, value: c }, c); })
            )
          ),
          h('div', { className: 'form-group' },
            h('label', null, 'Frequência'),
            h('select', { value: form.frequencia, onChange: function(e) { setField('frequencia', e.target.value); } },
              h('option', { value: 'diaria' }, 'Diária'), h('option', { value: 'semanal' }, 'Semanal'), h('option', { value: 'manual' }, 'Manual')
            )
          )
        ),
        h('div', { className: 'form-group' },
          h('label', null, 'Palavras-chave (filtro, separadas por vírgula)'),
          h('input', { type: 'text', value: form.palavras_chave, onChange: function(e) { setField('palavras_chave', e.target.value); }, placeholder: 'amazônia, desmatamento, SEMA…', maxLength: 500 })
        )
      )
    ),

    confirmDel && h(ConfirmDialog, {
      title: 'Remover Feed', message: 'Remover o feed "' + (confirmDel.nome || '') + '"?',
      confirmLabel: 'Remover', onCancel: function() { setConfirmDel(null); }, onConfirm: function() { excluir(confirmDel); }
    })
  );
};
