import { api, esc } from '../api.js';

const STATUS_LABELS = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada' };
const STATUS_COLORS = { pending: '#e67e22', approved: '#0f7a45', rejected: '#c0392b' };

export async function renderRequests(root) {
  let requests = [], units = [];
  try {
    [requests, units] = await Promise.all([api.get('/api/requests'), api.get('/api/units')]);
  } catch { /* banco indisponível */ }

  root.innerHTML = `
    <section class="card">
      <h2>Solicitações</h2>
      <form id="request-form" class="grid">
        <label>Unidade
          <select name="unit_id" required>
            ${units.length
              ? units.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')
              : '<option value="" disabled>Nenhuma unidade cadastrada</option>'}
          </select>
        </label>
        <label>Solicitante<input name="requester_name" required /></label>
        <label>E-mail<input name="requester_email" type="email" /></label>
        <label>Tipo de Uso<input name="usage_type" required /></label>
        <label>Observações<textarea name="notes" rows="3"></textarea></label>
        <button type="submit" ${units.length ? '' : 'disabled'}>Criar solicitação</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Unidade</th><th>Solicitante</th><th>Tipo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${requests.map((r) => `<tr>
              <td>${r.id}</td>
              <td>${esc(r.unit_name)}</td>
              <td>${esc(r.requester_name)}</td>
              <td>${esc(r.usage_type)}</td>
              <td><span style="color:${STATUS_COLORS[r.status] ?? '#63707c'};font-weight:600;">${STATUS_LABELS[r.status] ?? esc(r.status)}</span></td>
              <td>
                <div class="actions">
                  ${r.status === 'pending'
                    ? `<button data-status="approved" data-id="${r.id}" style="width:auto;padding:.3rem .7rem;">Aprovar</button>
                       <button data-status="rejected" data-id="${r.id}" class="secondary" style="width:auto;padding:.3rem .7rem;">Rejeitar</button>`
                    : '<span class="muted">—</span>'}
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
