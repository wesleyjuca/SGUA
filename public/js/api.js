// SGUA — Cliente de API (global namespace, sem ES6 modules)

var API = (function() {
  var BASE = window.location.hostname === 'wesleyjuca.github.io'
    ? 'https://sgua-production.up.railway.app'
    : '';

  var TOKEN_KEY = 'sgua_session_v5';

  function getToken() { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null; }
  function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); }

  function hdrs() {
    var h = { 'Content-Type': 'application/json' };
    var t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function timeout() { return { signal: AbortSignal.timeout(20000) }; }

  async function req(method, url, body) {
    var opts = Object.assign({}, timeout(), { method: method, headers: hdrs() });
    if (body !== undefined) opts.body = JSON.stringify(body);
    var res = await fetch(BASE + url, opts);
    var payload;
    try { payload = await res.json(); } catch(e) { payload = { ok: false, error: 'Resposta inválida do servidor.' }; }
    if (!res.ok && payload.ok !== false) payload = { ok: false, error: 'Erro ' + res.status };
    return payload;
  }

  var get  = function(url)       { return req('GET',    url); };
  var post = function(url, body) { return req('POST',   url, body); };
  var put  = function(url, body) { return req('PUT',    url, body); };
  var del  = function(url)       { return req('DELETE', url); };

  // ─── Auth ───────────────────────────────────────────────────────────────────

  async function login(email, senha) {
    var r = await post('/api/auth/login', { email: email, senha: senha });
    if (r.ok && r.token) setToken(r.token);
    return r;
  }

  async function logout() {
    await post('/api/auth/logout', {}).catch(function(){});
    clearToken();
    return { ok: true };
  }

  async function me() {
    var t = getToken();
    if (!t) return { ok: false };
    return get('/api/auth/me');
  }

  // ─── Unidades ───────────────────────────────────────────────────────────────

  var Unidades = {
    list: function() { return get('/api/units').then(function(r) { return { ok: r.ok, unidades: r.data || [], error: r.error }; }); },
    get:  function(id) { return get('/api/units/' + id).then(function(r) { return { ok: r.ok, unidade: r.data, error: r.error }; }); },
    create: function(data) { return post('/api/units', data); },
    update: function(id, data) { return put('/api/units/' + id, data); },
    remove: function(id) { return del('/api/units/' + id); },
    photos: function(id) { return get('/api/units/' + id + '/photos').then(function(r) { return { ok: r.ok, photos: r.data || [] }; }); },
    addPhoto: function(id, formData) {
      var t = getToken();
      var fhdrs = t ? { 'Authorization': 'Bearer ' + t } : {};
      return fetch(BASE + '/api/units/' + id + '/photos', { method: 'POST', headers: fhdrs, body: formData, signal: AbortSignal.timeout(30000) }).then(function(r) { return r.json(); });
    }
  };

  // ─── Notícias ───────────────────────────────────────────────────────────────

  var Noticias = {
    list: function() { return get('/api/news').then(function(r) { return { ok: r.ok, noticias: r.data || [], error: r.error }; }); },
    create: function(data) { return post('/api/news', data); },
    update: function(id, data) { return put('/api/news/' + id, data); },
    remove: function(id) { return del('/api/news/' + id); }
  };

  // ─── Solicitações ────────────────────────────────────────────────────────────

  var Solicitacoes = {
    list: function() { return get('/api/requests').then(function(r) { return { ok: r.ok, solicitacoes: r.data || [], error: r.error }; }); },
    create: function(data) { return post('/api/requests', data); },
    update: function(id, data) { return put('/api/requests/' + id, data); },
    remove: function(id) { return del('/api/requests/' + id); }
  };

  // ─── Feeds ───────────────────────────────────────────────────────────────────

  var Feeds = {
    list: function() { return get('/api/feeds').then(function(r) { return { ok: r.ok, feeds: r.feeds || [], error: r.error }; }); },
    create: function(data) { return post('/api/feeds', data); },
    update: function(id, data) { return put('/api/feeds/' + id, data); },
    remove: function(id) { return del('/api/feeds/' + id); },
    toggle: function(id) { return post('/api/feeds/' + id + '/toggle', {}); },
    sync:   function(id) { return post('/api/feeds/' + id + '/sync', {}); },
    scrape: function(url, nome) { return post('/api/feeds/scrape', { url: url, nome: nome }); }
  };

  // ─── Usuários ────────────────────────────────────────────────────────────────

  var Usuarios = {
    list: function() { return get('/api/users').then(function(r) { return { ok: r.ok, usuarios: r.data || [], error: r.error }; }); },
    create: function(data) { return post('/api/users', data); },
    update: function(id, data) { return put('/api/users/' + id, data); },
    remove: function(id) { return del('/api/users/' + id); },
    changePassword: function(id, data) { return post('/api/users/' + id + '/password', data); }
  };

  // ─── Configurações ───────────────────────────────────────────────────────────

  var _defaultSecs = { hero: true, alert: true, bloco: true, mapa: true, dash: true, acesso: true, news: true, ia: false };

  var Configuracoes = {
    get: function() {
      return get('/api/config').then(function(r) {
        return { ok: r.ok !== false, configuracoes: r.configuracoes || r.secs || _defaultSecs };
      }).catch(function() {
        return { ok: true, configuracoes: _defaultSecs };
      });
    },
    update: function(data) { return put('/api/config', data); }
  };

  // ─── Solicitações de registro (público) ──────────────────────────────────────

  var RegRequests = {
    list: function() { return get('/api/reg-requests'); },
    create: function(data) { return post('/api/reg-requests', data); },
    review: function(id, data) { return put('/api/reg-requests/' + id, data); }
  };

  return {
    login: login, logout: logout, me: me,
    Unidades: Unidades,
    Noticias: Noticias,
    Solicitacoes: Solicitacoes,
    Feeds: Feeds,
    Usuarios: Usuarios,
    Configuracoes: Configuracoes,
    RegRequests: RegRequests,
    get: get, post: post, put: put, del: del
  };
})();
