import { api } from '../api.js';

export async function renderDashboard(root) {
  const [users, units, news, requests] = await Promise.all([
    api.get('/api/users'),
    api.get('/api/units'),
    api.get('/api/news'),
    api.get('/api/requests')
  ]);

  root.innerHTML = `
    <section class="grid">
      <article class="card"><h3>Usuários</h3><p><strong>${users.length}</strong></p></article>
      <article class="card"><h3>Unidades</h3><p><strong>${units.length}</strong></p></article>
      <article class="card"><h3>Notícias</h3><p><strong>${news.length}</strong></p></article>
      <article class="card"><h3>Solicitações</h3><p><strong>${requests.length}</strong></p></article>
    </section>
    <article class="card">
      <h3>Arquitetura implementada</h3>
      <ul>
        <li>Módulos independentes: Dashboard, Unidades, Mapa, Usuários, Notícias e Solicitações.</li>
        <li>API REST com CRUD para cada entidade principal.</li>
        <li>Banco PostgreSQL (Supabase) com relacionamentos e validação no servidor.</li>
      </ul>
    </article>
  `;
}
