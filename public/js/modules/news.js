import { api } from '../api.js';

export async function renderNews(root) {
  const news = await api.get('/api/news');
  const users = await api.get('/api/users');

  root.innerHTML = `
    <section class="card">
      <h2>Notícias</h2>
      <form id="news-form" class="grid">
        <label>Título<input name="title" required /></label>
        <label>Autor
          <select name="author_id">
            <option value="">Sem autor</option>
            ${users.map((u) => `<option value="${u.id}">${u.name}</option>`).join('')}
          </select>
        </label>
        <label>Conteúdo<textarea name="content" rows="3" required></textarea></label>
        <button type="submit">Publicar notícia</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Título</th><th>Autor</th><th>Criado em</th><th>Ações</th></tr></thead>
          <tbody>${news.map((n) => `<tr><td>${n.id}</td><td>${n.title}</td><td>${n.author_name || '-'}</td><td>${n.created_at}</td><td><button data-del="${n.id}" class="secondary">Excluir</button></td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>
  `;

  root.querySelector('#news-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const payload = Object.fromEntries(fd.entries());
    payload.author_id = payload.author_id ? Number(payload.author_id) : null;
    await api.post('/api/news', payload);
    renderNews(root);
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.delete(`/api/news/${btn.dataset.del}`);
      renderNews(root);
    });
  });
}
