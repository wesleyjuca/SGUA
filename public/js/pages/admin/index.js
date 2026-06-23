// SGUA — Admin Panel Shell

var AdminPanel = function(props) {
  var curUser = props.curUser, onLogout = props.onLogout;
  var uns = props.uns, setUns = props.setUns;
  var news = props.news, setNews = props.setNews;
  var feeds = props.feeds, setFeeds = props.setFeeds;
  var sols = props.sols, setSols = props.setSols;
  var users = props.users, setUsers = props.setUsers;
  var setSecs = props.setSecs, toast2 = props.toast2, isMobile = props.isMobile;

  var [tab, setTab] = React.useState('dashboard');
  var [sidebarOpen, setSidebarOpen] = React.useState(false);

  var navItems = [
    { id: 'dashboard',   label: 'Dashboard',    icon: '📊' },
    { id: 'unidades',    label: 'Unidades',      icon: '🏠' },
    { id: 'noticias',    label: 'Notícias',       icon: '📰' },
    { id: 'feeds',       label: 'Feeds RSS',      icon: '📡' },
    { id: 'solicitacoes', label: 'Solicitações',  icon: '📋' },
    { id: 'usuarios',    label: 'Usuários',       icon: '👥' },
    { id: 'relatorios',  label: 'Relatórios',     icon: '📊' }
  ];

  function renderContent() {
    var shared = { uns: uns, setUns: setUns, news: news, setNews: setNews, feeds: feeds, setFeeds: setFeeds, sols: sols, setSols: setSols, users: users, setUsers: setUsers, curUser: curUser, toast2: toast2, isMobile: isMobile, setTab: setTab };
    switch(tab) {
      case 'unidades':     return h(AdminUnidades,    shared);
      case 'noticias':     return h(AdminNoticias,    shared);
      case 'feeds':        return h(AdminFeeds,       shared);
      case 'solicitacoes': return h(AdminSolicitacoes, shared);
      case 'usuarios':     return h(AdminUsuarios,    shared);
      case 'relatorios':   return h(AdminRelatorios,  shared);
      default:             return h(AdminDashboard,   shared);
    }
  }

  var sidebar = h('aside', { className: 'admin-sidebar' },
    h('div', { className: 'admin-sidebar-logo' },
      h('div', { style: { fontSize: 13, opacity: .6, marginBottom: 2 } }, 'SGUA Admin'),
      h('div', { style: { fontSize: 13, fontWeight: 600 } }, curUser && curUser.name ? curUser.name.split(' ')[0] : 'Admin'),
      curUser && h('div', { style: { fontSize: 11, opacity: .5, marginTop: 2 } }, Domain.roleLabel(curUser.role))
    ),
    navItems.map(function(item) {
      return h('button', { key: item.id, className: 'admin-nav-item' + (tab === item.id ? ' active' : ''), onClick: function() { setTab(item.id); setSidebarOpen(false); } },
        h('span', { className: 'admin-nav-icon' }, item.icon),
        item.label
      );
    }),
    h('div', { style: { marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,.1)' } },
      h('button', { className: 'admin-nav-item', style: { color: '#fca5a5' }, onClick: function() {
        props.nav && props.nav('home');
      } }, h('span', { className: 'admin-nav-icon' }, '🏠'), 'Ver site'),
      h('button', { className: 'admin-nav-item', style: { color: '#fca5a5' }, onClick: onLogout },
        h('span', { className: 'admin-nav-icon' }, '🚪'), 'Sair'
      )
    )
  );

  if (isMobile) {
    return h('div', null,
      h('div', { style: { background: '#1a2332', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 } },
        h('div', { style: { fontWeight: 800 } }, '🌿 SGUA Admin'),
        h('button', { onClick: function() { setSidebarOpen(!sidebarOpen); }, style: { background: 'rgba(255,255,255,.15)', color: '#fff', padding: '6px 12px' } }, sidebarOpen ? '✕' : '☰ Menu')
      ),
      sidebarOpen && h('div', { style: { position: 'fixed', inset: 0, zIndex: 200, top: 49 } },
        h('div', { style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }, onClick: function() { setSidebarOpen(false); } }),
        h('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 240, display: 'flex', flexDirection: 'column' } }, sidebar)
      ),
      h('div', { style: { padding: 16, background: '#f5f7f9', minHeight: 'calc(100vh - 49px)' } }, renderContent())
    );
  }

  return h('div', { className: 'admin-layout' },
    sidebar,
    h('main', { className: 'admin-content' }, renderContent())
  );
};
