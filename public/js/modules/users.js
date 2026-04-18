import { api } from '../api.js';

export async function renderUsers(root) {
  const users = await api.get('/api/users');
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
          <tbody>${users.map((u) => `<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><div class="actions"><button data-del="${u.id}" class="secondary">Excluir</button></div></td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>
  `;

  root.querySelector('#user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    await api.post('/api/users', Object.fromEntries(fd.entries()));
    location.hash = '#/usuarios';
    location.hash = '#/dashboard';
    location.hash = '#/usuarios';
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.delete(`/api/users/${btn.dataset.del}`);
      renderUsers(root);
    });
  });
}
