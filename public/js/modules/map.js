import { api } from '../api.js';

let mapRef;

export async function renderMap(root) {
  const units = await api.get('/api/units');

  root.innerHTML = `
    <section class="card">
      <h2>Mapa de Unidades</h2>
      <p class="muted">Somente unidades com latitude/longitude válidas são exibidas.</p>
      <div id="map"></div>
    </section>
  `;

  if (mapRef) {
    mapRef.remove();
  }

  mapRef = L.map('map').setView([-9.97, -67.81], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapRef);

  units
    .filter((u) => Number.isFinite(u.latitude) && Number.isFinite(u.longitude))
    .forEach((u) => {
      L.marker([u.latitude, u.longitude])
        .addTo(mapRef)
        .bindPopup(`<strong>${u.name}</strong><br>Status: ${u.status}<br>Ocupação: ${u.current_occupancy}/${u.capacity}`);
    });
}
