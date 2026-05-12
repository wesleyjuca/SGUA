import { renderDashboard } from './modules/dashboard.js';
import { renderUnits } from './modules/units.js';
import { renderMap } from './modules/map.js';
import { renderUsers } from './modules/users.js';
import { renderNews } from './modules/news.js';
import { renderRequests } from './modules/requests.js';

const app = document.getElementById('app');

const routes = {
  '/dashboard': renderDashboard,
  '/unidades': renderUnits,
  '/mapa': renderMap,
  '/usuarios': renderUsers,
  '/noticias': renderNews,
  '/solicitacoes': renderRequests
};

async function renderRoute() {
  const hash = window.location.hash || '#/dashboard';
  const path = hash.replace('#', '');
  const page = routes[path] || renderDashboard;

  app.innerHTML = '<div class="card">Carregando...</div>';
  try {
    await page(app);
  } catch (error) {
    app.innerHTML = `<div class="card"><h3>Erro</h3><p>${error.message}</p></div>`;
  }
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
