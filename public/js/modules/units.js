import { api, esc } from '../api.js';

let editingUnitId = null;

function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<button class="lightbox-close" aria-label="Fechar">✕</button><img src="${src}" alt="">`;
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.classList.contains('lightbox-close')) lb.remove();
  });
  document.addEventListener('keydown', function esc(ev) {
    if (ev.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(lb);
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function uploadPhotos(unitId, files, isBanner = false) {
  for (const file of files) {
    const fd = new FormData();
    fd.append('photo', file);
    if (isBanner) fd.append('is_banner', 'true');
    await fetch(`/api/units/${unitId}/photos`, {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(30_000)
    });
  }
}

function renderGallery(root, photos, unitId) {
  const container = root.querySelector('#gallery-container');
  if (!container) return;
  if (!photos.length) {
    container.innerHTML = '<p class="muted" style="margin:.5rem 0;">Nenhuma foto adicionada ainda.</p>';
    return;
  }
  container.innerHTML = `
    <div class="photo-grid">
      ${photos.map((p) => `
        <div class="photo-card" data-src="${esc(p.url)}">
          ${p.is_banner ? '<span class="photo-banner-badge">Banner</span>' : ''}
          <img src="${esc(p.url)}" alt="${esc(p.caption || '')}">
          <div class="photo-actions">
            <button data-view="${esc(p.url)}" style="background:#fff;color:#232a31;" title="Ver">⛶</button>
            ${!p.is_banner ? `<button data-set-banner="${p.id}" style="background:var(--primary);" title="Definir como banner">★</button>` : ''}
            <button data-del-photo="${p.id}" style="background:#c0392b;" title="Excluir">✕</button>
          </div>
        </div>
      `).join('')}
    </div>`;

  container.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(btn.dataset.view); });
  });
  container.querySelectorAll('.photo-card').forEach((card) => {
    card.addEventListener('click', () => openLightbox(card.dataset.src));
  });
  container.querySelectorAll('[data-set-banner]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch(`/api/photos/${btn.dataset.setBanner}`, { method: 'PUT', signal: AbortSignal.timeout(10_000) });
      const photos = await api.get(`/api/units/${unitId}/photos`);
      renderGallery(root, photos, unitId);
    });
  });
  container.querySelectorAll('[data-del-photo]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Excluir esta foto?')) return;
      await api.delete(`/api/photos/${btn.dataset.delPhoto}`);
      const photos = await api.get(`/api/units/${unitId}/photos`);
      renderGallery(root, photos, unitId);
    });
  });
}

function renderEditPanel(root, unit, photos) {
  const panel = root.querySelector('#edit-panel');
  if (!panel) return;

  panel.innerHTML = `
    <section class="card edit-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem;">
        <h2 style="margin:0;">Editar: ${esc(unit.name)}</h2>
        <button id="close-edit" class="secondary" style="width:auto;padding:.35rem .9rem;">✕ Fechar</button>
      </div>

      <div class="grid" style="margin-bottom:1rem;">
        <div>
          <h3 style="margin:0 0 .6rem;font-size:1rem;">Banner da Unidade</h3>
          ${unit.banner_url
            ? `<img src="${esc(unit.banner_url)}" class="banner-preview" id="banner-preview" alt="Banner"><br><br>`
            : '<p class="muted" style="font-size:.85rem;margin:.4rem 0 .6rem;">Nenhum banner definido.</p>'
          }
          <label class="banner-drop" id="banner-drop" style="display:block;">
            <input type="file" id="banner-file" accept="image/jpeg,image/png,image/webp" style="display:none;">
            <span style="font-size:.85rem;">📷 Clique para enviar foto de banner</span>
          </label>
        </div>

        <div>
          <h3 style="margin:0 0 .6rem;font-size:1rem;">Informações Gerais</h3>
          <form id="edit-form">
            <label>Nome *<input name="name" value="${esc(unit.name)}" required maxlength="140"></label>
            <label>Endereço<input name="address" value="${esc(unit.address || '')}" maxlength="255"></label>
            <label>Descrição<textarea name="description" rows="3" maxlength="1000">${esc(unit.description || '')}</textarea></label>
            <div class="grid">
              <label>Latitude<input name="latitude" type="number" step="any" value="${unit.latitude ?? ''}"></label>
              <label>Longitude<input name="longitude" type="number" step="any" value="${unit.longitude ?? ''}"></label>
            </div>
            <div class="grid">
              <label>Capacidade<input name="capacity" type="number" min="0" value="${unit.capacity ?? 0}"></label>
              <label>Status
                <select name="status">
                  <option value="active" ${unit.status === 'active' ? 'selected' : ''}>Ativa</option>
                  <option value="inactive" ${unit.status === 'inactive' ? 'selected' : ''}>Inativa</option>
                </select>
              </label>
            </div>
          </form>
        </div>

        <div>
          <h3 style="margin:0 0 .6rem;font-size:1rem;">Contato</h3>
          <label>Responsável<input id="cnt-name" value="${esc(unit.contact_name || '')}" maxlength="120"></label>
          <label>E-mail<input id="cnt-email" type="email" value="${esc(unit.contact_email || '')}" maxlength="160"></label>
          <label>Telefone<input id="cnt-phone" type="tel" value="${esc(unit.contact_phone || '')}" maxlength="30"></label>
        </div>
      </div>

      <div style="display:flex;gap:.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
        <button id="save-edit" style="flex:1;min-width:140px;">💾 Salvar alterações</button>
        <span id="save-status" class="muted" style="align-self:center;font-size:.88rem;"></span>
      </div>

      <h3 style="margin:0 0 .5rem;font-size:1rem;">Galeria de Fotos</h3>
      <div id="gallery-container"></div>
      <div style="margin-top:.75rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
        <label style="display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;margin:0;">
          <input type="file" id="gallery-file" accept="image/jpeg,image/png,image/webp,image/gif" multiple style="display:none;">
          <button type="button" id="add-photos-btn" style="width:auto;padding:.35rem .9rem;">📁 Adicionar fotos</button>
        </label>
        <span id="upload-status" class="muted" style="font-size:.85rem;"></span>
      </div>
    </section>`;

  renderGallery(root, photos, unit.id);

  panel.querySelector('#close-edit').addEventListener('click', () => {
    editingUnitId = null;
    renderUnits(root);
  });

  // Banner upload
  const bannerDrop = panel.querySelector('#banner-drop');
  const bannerFile = panel.querySelector('#banner-file');
  bannerDrop.addEventListener('click', () => bannerFile.click());
  bannerFile.addEventListener('change', async () => {
    if (!bannerFile.files.length) return;
    await uploadPhotos(unit.id, [bannerFile.files[0]], true);
    const updated = await api.get('/api/units');
    const u = updated.find((x) => x.id === unit.id) || unit;
    const photos = await api.get(`/api/units/${unit.id}/photos`);
    editingUnitId = unit.id;
    const preview = panel.querySelector('#banner-preview');
    if (preview) preview.src = u.banner_url || '';
    renderGallery(root, photos, unit.id);
  });

  // Gallery add photos
  const galleryFile = panel.querySelector('#gallery-file');
  const addBtn = panel.querySelector('#add-photos-btn');
  const uploadStatus = panel.querySelector('#upload-status');
  addBtn.addEventListener('click', () => galleryFile.click());
  galleryFile.addEventListener('change', async () => {
    if (!galleryFile.files.length) return;
    uploadStatus.textContent = `Enviando ${galleryFile.files.length} foto(s)…`;
    addBtn.disabled = true;
    try {
      await uploadPhotos(unit.id, Array.from(galleryFile.files));
      const photos = await api.get(`/api/units/${unit.id}/photos`);
      renderGallery(root, photos, unit.id);
      uploadStatus.textContent = '✓ Enviado';
    } catch (err) {
      uploadStatus.textContent = `✗ ${err.message}`;
    } finally {
      addBtn.disabled = false;
      galleryFile.value = '';
    }
  });

  // Save form
  const saveBtn = panel.querySelector('#save-edit');
  const saveStatus = panel.querySelector('#save-status');
  saveBtn.addEventListener('click', async () => {
    const form = panel.querySelector('#edit-form');
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.capacity = Number(payload.capacity || 0);
    payload.latitude = numberOrNull(payload.latitude);
    payload.longitude = numberOrNull(payload.longitude);
    payload.contact_name = panel.querySelector('#cnt-name').value;
    payload.contact_email = panel.querySelector('#cnt-email').value;
    payload.contact_phone = panel.querySelector('#cnt-phone').value;
    saveBtn.disabled = true;
    saveStatus.textContent = 'Salvando…';
    try {
      await api.put(`/api/units/${unit.id}`, payload);
      saveStatus.textContent = '✓ Salvo';
    } catch (err) {
      saveStatus.textContent = `✗ ${err.message}`;
    } finally {
      saveBtn.disabled = false;
    }
  });
}

export async function renderUnits(root) {
  const units = await api.get('/api/units');

  let editUnit = null;
  let editPhotos = [];
  if (editingUnitId) {
    editUnit = units.find((u) => u.id === editingUnitId) || null;
    if (editUnit) {
      editPhotos = await api.get(`/api/units/${editingUnitId}/photos`);
    } else {
      editingUnitId = null;
    }
  }

  root.innerHTML = `
    <div id="edit-panel"></div>

    <section class="card">
      <h2>Unidades</h2>
      <form id="unit-form" class="grid">
        <label>Nome *<input name="name" required maxlength="140"></label>
        <label>Endereço<input name="address" maxlength="255"></label>
        <label>Latitude<input name="latitude" type="number" step="any"></label>
        <label>Longitude<input name="longitude" type="number" step="any"></label>
        <label>Capacidade<input name="capacity" type="number" min="0" value="0"></label>
        <label>Status
          <select name="status"><option value="active">Ativa</option><option value="inactive">Inativa</option></select>
        </label>
        <button type="submit">+ Criar unidade</button>
      </form>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Banner</th><th>ID</th><th>Nome</th><th>Status</th><th>Cap.</th><th>Ocupação</th><th>Ações</th></tr>
          </thead>
          <tbody>
            ${units.length
              ? units.map((u) => `<tr>
                  <td style="width:56px;">
                    ${u.banner_url
                      ? `<img src="${esc(u.banner_url)}" style="width:52px;height:36px;object-fit:cover;border-radius:4px;display:block;" alt="">`
                      : '<span style="display:block;width:52px;height:36px;background:var(--line);border-radius:4px;"></span>'}
                  </td>
                  <td>${u.id}</td>
                  <td>${esc(u.name)}</td>
                  <td><span style="color:${u.status === 'active' ? 'var(--primary)' : '#5f6b76'};font-weight:600;">${u.status === 'active' ? 'Ativa' : 'Inativa'}</span></td>
                  <td>${u.capacity || '∞'}</td>
                  <td>${u.current_occupancy}</td>
                  <td>
                    <div class="actions">
                      <button data-edit="${u.id}" style="width:auto;padding:.3rem .7rem;background:var(--primary);">✏ Editar</button>
                      <button data-occ="${u.id}" style="width:auto;padding:.3rem .7rem;">Ocupar</button>
                      <button data-del="${u.id}" class="secondary" style="width:auto;padding:.3rem .7rem;">Excluir</button>
                    </div>
                  </td>
                </tr>`).join('')
              : '<tr><td colspan="7" style="text-align:center;color:#63707c;">Nenhuma unidade cadastrada.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;

  if (editUnit) {
    renderEditPanel(root, editUnit, editPhotos);
    root.querySelector('#edit-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUnitId = Number(btn.dataset.edit);
      renderUnits(root);
    });
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirmar exclusão desta unidade?')) return;
      await api.delete(`/api/units/${btn.dataset.del}`);
      if (editingUnitId === Number(btn.dataset.del)) editingUnitId = null;
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
