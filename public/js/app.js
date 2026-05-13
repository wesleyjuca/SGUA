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

function updateActiveNav(hash) {
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });
}

async function renderRoute() {
  const hash = window.location.hash || '#/dashboard';
  const path = hash.replace('#', '');
  const page = routes[path] || renderDashboard;

  updateActiveNav(path in routes ? hash : '#/dashboard');
  app.innerHTML = '<div class="card">Carregando...</div>';
  try {
    await page(app);
  } catch (error) {
    const isDbError = /banco|database|connect|timeout|unavailable|indispon/i.test(error.message);
    app.innerHTML = isDbError
      ? `<div class="card" style="border-left:4px solid #e67e22;">
          <h3 style="color:#e67e22;">⚠ Banco de dados indisponível</h3>
          <p>Não foi possível conectar ao banco de dados. Verifique se a variável <code>DATABASE_URL</code> está configurada corretamente no servidor.</p>
          <p style="color:#63707c;font-size:.88rem;">Detalhe técnico: ${error.message}</p>
        </div>`
      : `<div class="card"><h3>Erro</h3><p>${error.message}</p></div>`;
  }
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
