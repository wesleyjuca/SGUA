import { api, esc } from '../api.js';

export async function renderUsers(root) {
  let users = [];
  try { users = await api.get('/api/users'); } catch { /* banco indisponível */ }
  root.innerHTML = `
    <section class="card">
      <h2>Usuários</h2>
      <form id="user-form" class="grid">
        <label>Nome<input name="name" required /></label>
        <label>E-mail<input name="email" type="email" required /></label>
        <label>Perfil
          <select name="role"><option value="viewer">Visualizador</option><option value="manager">Gestor</option><option value="admin">Admin</option></select>
        </label>
        <button type="submit">Criar usuário</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Nome</th><th>Email</th><th>Perfil</th><th>Ações</th></tr></thead>
          <tbody>${users.map((u) => `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td><div class="actions"><button data-del="${u.id}" class="secondary">Excluir</button></div></td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>
  `;

  root.querySelector('#user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    await api.post('/api/users', Object.fromEntries(fd.entries()));
    renderUsers(root);
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirmar exclusão deste usuário?')) return;
      await api.delete(`/api/users/${btn.dataset.del}`);
      renderUsers(root);
    });
  });
}
