import { api } from '../api.js';

export async function renderRequests(root) {
  const requests = await api.get('/api/requests');
  const units = await api.get('/api/units');

  root.innerHTML = `
    <section class="card">
      <h2>Solicitações</h2>
      <form id="request-form" class="grid">
        <label>Unidade
          <select name="unit_id" required>${units.map((u) => `<option value="${u.id}">${u.name}</option>`).join('')}</select>
        </label>
        <label>Solicitante<input name="requester_name" required /></label>
        <label>E-mail<input name="requester_email" type="email" /></label>
        <label>Tipo de Uso<input name="usage_type" required /></label>
        <label>Observações<textarea name="notes" rows="3"></textarea></label>
        <button type="submit">Criar solicitação</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Unidade</th><th>Solicitante</th><th>Tipo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${requests.map((r) => `<tr>
              <td>${r.id}</td>
              <td>${r.unit_name}</td>
              <td>${r.requester_name}</td>
              <td>${r.usage_type}</td>
              <td>${r.status}</td>
              <td>
                <div class="actions">
                  <button data-status="approved" data-id="${r.id}">Aprovar</button>
                  <button data-status="rejected" data-id="${r.id}" class="secondary">Rejeitar</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  root.querySelector('#request-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const payload = Object.fromEntries(fd.entries());
    payload.unit_id = Number(payload.unit_id);
    await api.post('/api/requests', payload);
    renderRequests(root);
  });

  root.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.put(`/api/requests/${btn.dataset.id}`, { status: btn.dataset.status });
      renderRequests(root);
    });
  });
}
