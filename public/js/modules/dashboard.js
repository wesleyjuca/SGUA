import { api, esc } from '../api.js';

export async function renderDashboard(root) {
  const [users, units, news, requests] = await Promise.all([
    api.get('/api/users'),
    api.get('/api/units'),
    api.get('/api/news'),
    api.get('/api/requests')
  ]);

  const recent = news.slice(0, 5);
  const activeUnits = units.filter((u) => u.status === 'active').length;
  const inactiveUnits = units.length - activeUnits;

  root.innerHTML = `
    <section class="grid" style="margin-bottom:1rem;">
      <article class="card"><h3>Usuários</h3><p><strong>${users.length}</strong></p></article>
      <article class="card">
        <h3>Unidades</h3>
        <p><strong>${units.length}</strong></p>
        <p style="font-size:.82rem;color:#63707c;margin:.25rem 0 0;">
          <span style="color:#0f7a45;">${activeUnits} ativa${activeUnits !== 1 ? 's' : ''}</span>
          &nbsp;/&nbsp;
          <span style="color:#5f6b76;">${inactiveUnits} inativa${inactiveUnits !== 1 ? 's' : ''}</span>
        </p>
      </article>
      <article class="card"><h3>Notícias</h3><p><strong>${news.length}</strong></p></article>
      <article class="card"><h3>Solicitações</h3><p><strong>${requests.length}</strong></p></article>
    </section>

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem;">
        <h2 style="margin:0;">Últimas Notícias</h2>
        <a href="#/noticias" style="font-size:.88rem;color:var(--primary);text-decoration:none;">Ver todas →</a>
      </div>
      ${recent.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Título</th><th>Fonte</th><th>Categoria</th><th>Data</th><th>Tipo</th></tr></thead>
            <tbody>
              ${recent.map((n) => `
                <tr>
                  <td>${n.link
                    ? `<a href="${esc(n.link)}" target="_blank" rel="noreferrer" style="color:var(--primary);">${esc(n.title)}</a>`
                    : esc(n.title)}</td>
                  <td>${esc(n.is_rss ? (n.source || '-') : (n.author_name || 'Manual'))}</td>
                  <td>${esc(n.category || '-')}</td>
                  <td>${new Date(n.created_at).toLocaleDateString('pt-BR')}</td>
                  <td><span style="font-size:.75rem;padding:.12rem .4rem;border-radius:999px;background:${n.is_rss ? '#e8f5e9' : '#e3f2fd'};color:${n.is_rss ? '#0f7a45' : '#1565c0'};">${n.is_rss ? 'RSS' : 'Manual'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <p class="muted" style="margin:.5rem 0;">Nenhuma notícia cadastrada.
          <a href="#/noticias" style="color:var(--primary);">Vá em Notícias → Sincronizar Feeds</a> para importar notícias dos feeds RSS.</p>`}
    </section>
  `;
}
