import { api, esc } from '../api.js';

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  return Number(value);
}

export async function renderUnits(root) {
  const units = await api.get('/api/units');

  root.innerHTML = `
    <section class="card">
      <h2>Unidades</h2>
      <form id="unit-form" class="grid">
        <label>Nome<input name="name" required /></label>
        <label>Endereço<input name="address" /></label>
        <label>Latitude<input name="latitude" type="number" step="any" /></label>
        <label>Longitude<input name="longitude" type="number" step="any" /></label>
        <label>Capacidade<input name="capacity" type="number" min="0" value="0" /></label>
        <label>Status
          <select name="status"><option value="active">Ativa</option><option value="inactive">Inativa</option></select>
        </label>
        <button type="submit">Criar unidade</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Nome</th><th>Status</th><th>Capacidade</th><th>Ocupação</th><th>Ações</th></tr></thead>
          <tbody>${units.map((u) => `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.status)}</td><td>${u.capacity}</td><td>${u.current_occupancy}</td><td><div class="actions"><button data-occ="${u.id}">Ocupar</button><button data-del="${u.id}" class="secondary">Excluir</button></div></td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>
  `;

  root.querySelector('#unit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const payload = Object.fromEntries(fd.entries());
    payload.capacity = Number(payload.capacity || 0);
    payload.latitude = numberOrNull(payload.latitude);
    payload.longitude = numberOrNull(payload.longitude);
    await api.post('/api/units', payload);
    renderUnits(root);
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirmar exclusão desta unidade?')) return;
      await api.delete(`/api/units/${btn.dataset.del}`);
      renderUnits(root);
    });
  });

  root.querySelectorAll('[data-occ]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const org = prompt('Nome da organização:');
      if (!org || !org.trim()) return;
      const type = prompt('Tipo de uso:') || 'Operacional';
      await api.post(`/api/units/${btn.dataset.occ}/occupancy`, {
        organization_name: org.trim(),
        usage_type: type.trim() || 'Operacional'
      });
      renderUnits(root);
    });
  });
}
