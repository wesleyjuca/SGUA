import { api, esc } from '../api.js';

let mapRef;

const ICON_ACTIVE = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#0f7a45;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -10]
});

const ICON_INACTIVE = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#5f6b76;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -10]
});

function occupancyBar(current, capacity) {
  if (!capacity) return '<span style="color:#63707c;font-size:.82rem;">Sem limite</span>';
  const pct = Math.min(100, Math.round((current / capacity) * 100));
  const color = pct >= 90 ? '#c0392b' : pct >= 60 ? '#e67e22' : '#0f7a45';
  return `
    <div style="font-size:.82rem;margin-top:4px;">
      ${current}/${capacity} (${pct}%)
      <div style="height:6px;border-radius:3px;background:#dcdfe4;margin-top:3px;">
        <div style="height:6px;border-radius:3px;width:${pct}%;background:${color};"></div>
      </div>
    </div>`;
}

export async function renderMap(root) {
  let units = [];
  try { units = await api.get('/api/units'); } catch { /* banco indisponível */ }
  const mapped = units.filter((u) => Number.isFinite(u.latitude) && Number.isFinite(u.longitude));
  const activeCount = mapped.filter((u) => u.status === 'active').length;

  root.innerHTML = `
    <section class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem;">
        <h2 style="margin:0;">Mapa de Unidades</h2>
        <div style="display:flex;align-items:center;gap:1rem;font-size:.88rem;">
          <span>
            <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#0f7a45;vertical-align:middle;margin-right:4px;"></span>Ativa (${activeCount})
          </span>
          <span>
            <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#5f6b76;vertical-align:middle;margin-right:4px;"></span>Inativa (${mapped.length - activeCount})
          </span>
          <button id="fit-btn" style="width:auto;padding:.3rem .8rem;font-size:.85rem;" ${mapped.length ? '' : 'disabled'}>
            ⊞ Ajustar vista
          </button>
        </div>
      </div>
      ${mapped.length === 0
        ? `<div class="muted" style="padding:1rem 0;">Nenhuma unidade com coordenadas cadastradas. Adicione latitude/longitude nas unidades para exibi-las no mapa.</div>`
        : ''}
      <div id="map" style="${mapped.length === 0 ? 'opacity:.4;pointer-events:none;' : ''}"></div>
    </section>
  `;

  if (mapRef) {
    mapRef.remove();
    mapRef = null;
  }

  mapRef = L.map('map', { zoomControl: true }).setView([-9.97, -67.81], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapRef);

  const markers = [];

  mapped.forEach((u) => {
    const icon = u.status === 'active' ? ICON_ACTIVE : ICON_INACTIVE;
    const statusLabel = u.status === 'active' ? '<span style="color:#0f7a45;font-weight:600;">Ativa</span>' : '<span style="color:#5f6b76;">Inativa</span>';
    const popup = `
      <div style="min-width:160px;">
        <strong style="font-size:.95rem;">${esc(u.name)}</strong><br>
        ${u.address ? `<span style="color:#63707c;font-size:.82rem;">${esc(u.address)}</span><br>` : ''}
        <span style="font-size:.82rem;">Status: ${statusLabel}</span><br>
        <span style="font-size:.82rem;">Ocupação:</span>
        ${occupancyBar(u.current_occupancy, u.capacity)}
      </div>`;
    const m = L.marker([u.latitude, u.longitude], { icon }).addTo(mapRef).bindPopup(popup);
    markers.push(m);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    root.querySelector('#fit-btn')?.addEventListener('click', () => {
      mapRef.fitBounds(group.getBounds().pad(0.2));
    });
    // Auto-fit on first load
    mapRef.fitBounds(group.getBounds().pad(0.2));
  } else {
    root.querySelector('#fit-btn')?.addEventListener('click', () => {});
  }
}
