import { api, esc } from '../api.js';

const DEFAULT_FEEDS = [
  { id: 1, nome: 'SEMA/AC', url: 'https://sema.ac.gov.br/feed/', categoria: 'Gestão', ativo: true },
  { id: 2, nome: 'MMA', url: 'https://www.gov.br/mma/pt-br/RSS', categoria: 'Legislação', ativo: true },
  { id: 3, nome: 'INPE', url: 'https://www.inpe.br/rss/noticias.php', categoria: 'Monitoramento', ativo: true }
];

let feedState = { feeds: DEFAULT_FEEDS, news: [] };

export async function renderNews(root) {
  const [newsItems, users] = await Promise.all([
    api.get('/api/news'),
    api.get('/api/users')
  ]);

  root.innerHTML = `
    <section class="card">
      <h2>Sincronização de Feeds RSS</h2>
      <div class="feeds-list" id="feeds-list">
        ${feedState.feeds.map((f) => `
          <label class="feed-item">
            <input type="checkbox" data-feed-id="${f.id}" ${f.ativo ? 'checked' : ''} />
            <span><strong>${esc(f.nome)}</strong> — <span class="muted">${esc(f.url)}</span></span>
          </label>
        `).join('')}
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap;">
        <button id="sync-btn" style="flex:1;min-width:140px;">🔄 Sincronizar Feeds</button>
        <span id="sync-status" class="muted" style="align-self:center;font-size:.88rem;"></span>
      </div>
      ${feedState.news.length ? `
        <div class="table-wrap" style="margin-top:1rem;">
          <table>
            <thead><tr><th>Título</th><th>Fonte</th><th>Data</th><th>Categoria</th></tr></thead>
            <tbody>${feedState.news.slice(0, 20).map((n) => `
              <tr>
                <td>${esc(n.titulo)}</td>
                <td>${esc(n.fonte || '-')}</td>
                <td>${esc(n.data || '-')}</td>
                <td>${esc(n.categoria || '-')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
    </section>

    <section class="card">
      <h2>Notícias</h2>
      <form id="news-form" class="grid">
        <label>Título<input name="title" required maxlength="180" /></label>
        <label>Autor
          <select name="author_id">
            <option value="">Sem autor</option>
            ${users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
          </select>
        </label>
        <label>Conteúdo<textarea name="content" rows="3" required maxlength="4000"></textarea></label>
        <button type="submit">Publicar notícia</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Título</th><th>Autor</th><th>Criado em</th><th>Ações</th></tr></thead>
          <tbody>
            ${newsItems.length
              ? newsItems.map((n) => `<tr>
                  <td>${n.id}</td>
                  <td>${esc(n.title)}</td>
                  <td>${esc(n.author_name || '-')}</td>
                  <td>${new Date(n.created_at).toLocaleDateString('pt-BR')}</td>
                  <td><button data-del="${n.id}" class="secondary" style="width:auto;padding:.3rem .7rem;">Excluir</button></td>
                </tr>`).join('')
              : '<tr><td colspan="5" style="text-align:center;color:#63707c;">Nenhuma notícia cadastrada.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Feed checkboxes
  root.querySelectorAll('[data-feed-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = Number(cb.dataset.feedId);
      feedState.feeds = feedState.feeds.map((f) => f.id === id ? { ...f, ativo: cb.checked } : f);
    });
  });

  // Sync button
  const syncBtn = root.querySelector('#sync-btn');
  const syncStatus = root.querySelector('#sync-status');

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncStatus.textContent = 'Sincronizando…';
    try {
      const result = await api.post('/api/feeds/sync', {
        feeds: feedState.feeds,
        news: feedState.news
      });
      feedState.feeds = result.feeds ?? feedState.feeds;
      feedState.news = result.news ?? feedState.news;
      const added = result.added ?? 0;
      const warns = result.warnings ?? [];
      syncStatus.textContent = `✓ ${added} item(s) adicionado(s).${warns.length ? ' ⚠ ' + warns.join('; ') : ''}`;
      renderNews(root);
    } catch (err) {
      syncStatus.textContent = `✗ ${err.message}`;
    } finally {
      syncBtn.disabled = false;
    }
  });

  // Publish form
  root.querySelector('#news-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const payload = Object.fromEntries(fd.entries());
    payload.author_id = payload.author_id ? Number(payload.author_id) : null;
    await api.post('/api/news', payload);
    renderNews(root);
  });

  // Delete buttons
  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.delete(`/api/news/${btn.dataset.del}`);
      renderNews(root);
    });
  });
}
