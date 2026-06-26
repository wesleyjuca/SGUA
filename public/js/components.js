// SGUA — Componentes React reutilizáveis (global namespace)

var h = React.createElement;

// ─── Toast ──────────────────────────────────────────────────────────────────

var Toast = function(props) {
  return h('div', { className: 'toast', style: { background: props.color || C.g1 } }, props.msg);
};

// ─── Navbar ─────────────────────────────────────────────────────────────────

var Navbar = function(props) {
  var pg = props.pg, nav = props.nav, curUser = props.curUser;
  var [open, setOpen] = React.useState(false);

  var links = [
    { id: 'home', label: 'Início' },
    { id: 'mapa', label: 'Mapa' },
    { id: 'cima', label: 'CIMA' },
    { id: 'ugai', label: 'UGAI' },
    { id: 'noticias', label: 'Notícias' },
    { id: 'transparencia', label: 'Transparência' }
  ];

  function go(id) { setOpen(false); nav(id); }

  return h('nav', { className: 'navbar', role: 'navigation', 'aria-label': 'Navegação principal' },
    h('a', { href: '#home', className: 'navbar-brand', onClick: function(e) { e.preventDefault(); go('home'); } },
      h('span', { 'aria-hidden': 'true' }, '🌿'), ' SGUA'
    ),
    h('div', { className: 'navbar-links' + (open ? ' open' : '') },
      links.map(function(l) {
        return h('a', { key: l.id, href: '#' + l.id, className: pg === l.id ? 'active' : '', onClick: function(e) { e.preventDefault(); go(l.id); } }, l.label);
      }),
      curUser
        ? h('a', { href: '#admin', onClick: function(e) { e.preventDefault(); go('admin'); } }, '⚙ Admin')
        : h('a', { href: '#solicitacao', onClick: function(e) { e.preventDefault(); go('solicitacao'); } }, 'Solicitar Uso')
    ),
    h('button', { className: 'navbar-mobile-btn', 'aria-label': 'Menu', 'aria-expanded': String(open), onClick: function() { setOpen(!open); } },
      open ? '✕' : '☰'
    )
  );
};

// ─── Footer ─────────────────────────────────────────────────────────────────

var Footer = function() {
  return h('footer', { className: 'footer' },
    h('p', null, '© ' + new Date().getFullYear() + ' SEMA/AC — Secretaria de Estado do Meio Ambiente do Acre'),
    h('p', { style: { marginTop: 4 } },
      'CIMA & UGAI — Sistema de Gestão de Unidades'
    )
  );
};

// ─── Modal ──────────────────────────────────────────────────────────────────

var Modal = function(props) {
  var onClose = props.onClose;

  React.useEffect(function() {
    function onKey(e) { if (e.key === 'Escape' && onClose) onClose(); }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return h('div', { className: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title, onClick: function(e) { if (e.target === e.currentTarget && onClose) onClose(); } },
    h('div', { className: 'modal-box', style: props.wide ? { maxWidth: 720 } : null },
      h('div', { className: 'modal-header' },
        h('h2', { className: 'modal-title' }, props.title),
        onClose && h('button', { className: 'modal-close', 'aria-label': 'Fechar', onClick: onClose }, '✕')
      ),
      props.children,
      props.footer && h('div', { className: 'modal-footer' }, props.footer)
    )
  );
};

// ─── ConfirmDialog ──────────────────────────────────────────────────────────

var ConfirmDialog = function(props) {
  return h(Modal, { title: props.title || 'Confirmar', onClose: props.onCancel,
    footer: h(React.Fragment, null,
      h('button', { className: 'secondary', onClick: props.onCancel }, 'Cancelar'),
      h('button', { className: 'danger', onClick: props.onConfirm }, props.confirmLabel || 'Confirmar')
    )
  },
    h('p', { style: { color: C.cm } }, props.message || 'Tem certeza?')
  );
};

// ─── LoadingSpinner ──────────────────────────────────────────────────────────

var LoadingSpinner = function(props) {
  return h('div', { style: { textAlign: 'center', padding: props.size === 'sm' ? '12px' : '40px', color: C.cm } },
    h('div', { style: { display: 'inline-block', width: props.size === 'sm' ? 20 : 32, height: props.size === 'sm' ? 20 : 32, border: '3px solid ' + C.cl, borderTop: '3px solid ' + C.g2, borderRadius: '50%', animation: 'spin .7s linear infinite' } }),
    props.label && h('p', { style: { marginTop: 12, fontSize: 14 } }, props.label)
  );
};

// ─── EmptyState ─────────────────────────────────────────────────────────────

var EmptyState = function(props) {
  return h('div', { className: 'empty-state' },
    h('div', { className: 'empty-state-icon' }, props.icon || '📭'),
    h('div', { className: 'empty-state-title' }, props.title || 'Nenhum item encontrado'),
    props.desc && h('div', { className: 'empty-state-desc' }, props.desc),
    props.action && h('div', { style: { marginTop: 16 } }, props.action)
  );
};

// ─── Pagination ─────────────────────────────────────────────────────────────

var Pagination = function(props) {
  var page = props.page, pages = props.pages, onChange = props.onChange;
  if (pages <= 1) return null;

  var nums = [];
  for (var i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 2 && i <= page + 2)) {
      nums.push(i);
    } else if (nums[nums.length - 1] !== '…') {
      nums.push('…');
    }
  }

  return h('div', { className: 'pagination', 'aria-label': 'Paginação' },
    h('button', { disabled: page <= 1, onClick: function() { onChange(page - 1); }, 'aria-label': 'Anterior' }, '‹'),
    nums.map(function(n, i) {
      if (n === '…') return h('span', { key: 'e' + i, style: { padding: '6px 4px', color: C.cm } }, '…');
      return h('button', { key: n, className: n === page ? 'active' : '', onClick: function() { onChange(n); }, 'aria-label': 'Página ' + n, 'aria-current': n === page ? 'page' : null }, n);
    }),
    h('button', { disabled: page >= pages, onClick: function() { onChange(page + 1); }, 'aria-label': 'Próxima' }, '›')
  );
};

// ─── Badge ──────────────────────────────────────────────────────────────────

var Badge = function(props) {
  var colorMap = { green: 'badge-green', red: 'badge-red', yellow: 'badge-yellow', gray: 'badge-gray', blue: 'badge-blue' };
  return h('span', { className: 'badge ' + (colorMap[props.color] || 'badge-gray') }, props.children);
};

// ─── StatCard ────────────────────────────────────────────────────────────────

var StatCard = function(props) {
  return h('div', { className: 'stat-card', style: props.color ? { borderLeftColor: props.color } : null },
    h('div', { className: 'stat-value' }, props.value),
    h('div', { className: 'stat-label' }, h('span', { style: { marginRight: 6 } }, props.icon), props.label)
  );
};

// ─── SearchInput ─────────────────────────────────────────────────────────────

var SearchInput = function(props) {
  return h('div', { style: { position: 'relative' } },
    h('input', {
      type: 'search', value: props.value,
      onChange: function(e) { props.onChange(e.target.value); },
      placeholder: props.placeholder || 'Buscar…',
      style: { paddingLeft: 32, maxWidth: props.maxWidth || 280 }
    }),
    h('span', { style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.cm, pointerEvents: 'none' } }, '🔍')
  );
};

// ─── Spin keyframe (injetado uma vez) ────────────────────────────────────────

(function() {
  if (document.getElementById('sgua-spin-style')) return;
  var s = document.createElement('style');
  s.id = 'sgua-spin-style';
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
})();
