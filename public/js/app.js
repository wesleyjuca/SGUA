// SGUA — App principal (ErrorBoundary, roteador, estado global, TelaLogin)

var h = React.createElement;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error: error }; }
  render() {
    if (this.state.hasError) {
      return h('div', { style: { padding: 40, textAlign: 'center' } },
        h('h2', { style: { color: C.rm, marginBottom: 16 } }, 'Algo deu errado'),
        h('p', { style: { color: C.cm, marginBottom: 24 } }, this.state.error && this.state.error.message),
        h('button', { onClick: function() { window.location.reload(); }, style: { padding: '10px 24px', background: C.g2, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' } }, 'Recarregar')
      );
    }
    return this.props.children;
  }
}

function TelaLogin(props) {
  var onLogin = props.onLogin;
  var [email, setEmail] = React.useState('');
  var [senha, setSenha] = React.useState('');
  var [loading, setLoading] = React.useState(false);
  var [erro, setErro] = React.useState('');

  async function entrar(e) {
    e.preventDefault();
    if (!email || !senha) { setErro('Preencha email e senha.'); return; }
    setLoading(true);
    setErro('');
    var r = await API.login(email, senha);
    setLoading(false);
    if (!r.ok) { setErro(r.error || 'Credenciais inválidas.'); return; }
    onLogin(r.usuario);
  }

  return h('div', { style: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.g0 } },
    h('div', { style: { background: '#fff', borderRadius: 16, padding: '40px 36px', width: 340, boxShadow: '0 8px 32px rgba(0,0,0,.18)' } },
      h('div', { style: { textAlign: 'center', marginBottom: 28 } },
        h('div', { style: { fontSize: 36, marginBottom: 8 } }, '🌿'),
        h('h1', { style: { fontSize: 22, fontWeight: 800, color: C.g0 } }, 'SGUA'),
        h('p', { style: { fontSize: 13, color: C.cm, marginTop: 4 } }, 'SEMA/AC — Área Restrita')
      ),
      h('form', { onSubmit: entrar },
        h('div', { style: { marginBottom: 16 } },
          h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } }, 'E-mail'),
          h('input', { type: 'email', value: email, onChange: function(e) { setEmail(e.target.value); }, placeholder: 'seu@email.gov.br', required: true, autoFocus: true })
        ),
        h('div', { style: { marginBottom: 20 } },
          h('label', { style: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } }, 'Senha'),
          h('input', { type: 'password', value: senha, onChange: function(e) { setSenha(e.target.value); }, required: true })
        ),
        erro && h('div', { style: { background: C.rl, color: C.rm, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16 } }, erro),
        h('button', { type: 'submit', disabled: loading, style: { width: '100%', padding: '11px', background: C.g2, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 } },
          loading ? 'Entrando…' : 'Entrar'
        )
      )
    )
  );
}

function App() {
  var [curUser, setCurUser] = React.useState(null);
  var [uns, setUns] = React.useState([]);
  var [news, setNews] = React.useState([]);
  var [feeds, setFeeds] = React.useState([]);
  var [sols, setSols] = React.useState([]);
  var [users, setUsers] = React.useState([]);
  var [secs, setSecs] = React.useState({});
  var [pg, setPg] = React.useState('home');
  var [pgId, setPgId] = React.useState(null);
  var [toast, setToast] = React.useState(null);
  var [booting, setBooting] = React.useState(true);
  var [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(function() {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return function() { window.removeEventListener('resize', onResize); };
  }, []);

  // Hash-based router
  React.useEffect(function() {
    function parseHash() {
      var hash = window.location.hash.replace(/^#\/?/, '') || 'home';
      var parts = hash.split('/');
      setPg(parts[0] || 'home');
      setPgId(parts[1] || null);
    }
    parseHash();
    window.addEventListener('hashchange', parseHash);
    return function() { window.removeEventListener('hashchange', parseHash); };
  }, []);

  // Bootstrap: restore session + load public data
  React.useEffect(function() {
    async function boot() {
      var me = await API.me();
      if (me.ok) { setCurUser(me.usuario); }
      var [rUns, rNews, rSecs] = await Promise.all([
        API.Unidades.list(),
        API.Noticias.list(),
        API.Configuracoes.get()
      ]);
      if (rUns.ok)  setUns(rUns.unidades || []);
      if (rNews.ok) setNews(rNews.noticias || []);
      if (rSecs.ok) setSecs(rSecs.configuracoes || {});
      setBooting(false);
      // Remove loading screen if present
      var splash = document.getElementById('loading-screen');
      if (splash) splash.style.display = 'none';
    }
    boot();
  }, []);

  // Load admin-only data when user logs in
  React.useEffect(function() {
    if (!curUser) return;
    async function loadAdminData() {
      var [rFeeds, rSols, rUsers] = await Promise.all([
        API.Feeds.list(),
        API.Solicitacoes.list(),
        API.Usuarios.list()
      ]);
      if (rFeeds.ok) setFeeds(rFeeds.feeds || []);
      if (rSols.ok)  setSols(rSols.solicitacoes || []);
      if (rUsers.ok) setUsers(rUsers.usuarios || []);
    }
    loadAdminData();
  }, [curUser]);

  function nav(page, id) {
    window.location.hash = id ? (page + '/' + id) : page;
  }

  function toast2(msg, color) {
    setToast({ msg: msg, color: color || C.g1 });
    setTimeout(function() { setToast(null); }, 3200);
  }

  async function handleLogin(usuario) {
    setCurUser(usuario);
    nav('admin');
  }

  async function handleLogout() {
    await API.logout();
    setCurUser(null);
    setFeeds([]); setSols([]); setUsers([]);
    nav('home');
  }

  if (booting) return null;

  var isAdmin = pg === 'admin';

  var sharedProps = {
    uns: uns, setUns: setUns,
    news: news, setNews: setNews,
    secs: secs,
    curUser: curUser,
    nav: nav,
    toast2: toast2,
    isMobile: isMobile
  };

  function renderPage() {
    if (isAdmin) {
      if (!curUser) return h(TelaLogin, { onLogin: handleLogin });
      return h(AdminPanel, Object.assign({}, sharedProps, {
        onLogout: handleLogout,
        feeds: feeds, setFeeds: setFeeds,
        sols: sols, setSols: setSols,
        users: users, setUsers: setUsers,
        setSecs: setSecs
      }));
    }
    switch (pg) {
      case 'mapa':         return h(PgMapa, sharedProps);
      case 'cima':         return h(PgCima, sharedProps);
      case 'ugai':         return h(PgUgai, sharedProps);
      case 'unidade':      return h(PageUnidade, Object.assign({}, sharedProps, { id: pgId }));
      case 'noticias':     return h(PgNoticias, sharedProps);
      case 'solicitacao':  return h(PgSolicitacao, sharedProps);
      case 'transparencia':return h(PgTransparencia, sharedProps);
      default:             return h(PgHome, sharedProps);
    }
  }

  return h('div', { style: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f7f9' } },
    !isAdmin && h(Navbar, { curUser: curUser, nav: nav, pg: pg }),
    h('div', { style: { flex: 1 } }, renderPage()),
    !isAdmin && h(Footer, null),
    toast && h(Toast, { msg: toast.msg, color: toast.color })
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  h(ErrorBoundary, null, h(App, null))
);
