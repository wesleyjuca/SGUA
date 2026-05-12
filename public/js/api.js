// SGUA — Camada de API (CRUD por recurso, autenticação por token)

var API = (function() {
  var _token = sessionStorage.getItem('sgua_token') || null;

  function getToken() { return _token; }

  function setToken(t) {
    _token = t;
    if (t) sessionStorage.setItem('sgua_token', t);
    else    sessionStorage.removeItem('sgua_token');
  }

  function headers(extra) {
    var h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (_token) h['Authorization'] = 'Bearer ' + _token;
    return Object.assign(h, extra || {});
  }

  async function req(method, path, body) {
    var opts = { method: method, headers: headers() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    var r = await fetch(path, opts);
    var data;
    try { data = await r.json(); } catch { data = { ok: false, error: 'Resposta inválida do servidor' }; }
    if (!r.ok && !data.error) data.error = 'Erro ' + r.status;
    return data;
  }

  // ─── Auth ────────────────────────────────────────────────────────────────
  async function login(email, senha) {
    var data = await req('POST', '/api/auth/login', { email, senha });
    if (data.ok) setToken(data.token);
    return data;
  }

  async function logout() {
    await req('POST', '/api/auth/logout');
    setToken(null);
  }

  async function me() { return req('GET', '/api/auth/me'); }

  // ─── Unidades ─────────────────────────────────────────────────────────────
  var Unidades = {
    list:   function(q) { return req('GET', '/api/unidades' + (q ? '?' + new URLSearchParams(q) : '')); },
    get:    function(id) { return req('GET', '/api/unidades/' + id); },
    create: function(d)  { return req('POST', '/api/unidades', d); },
    update: function(id, d) { return req('PUT', '/api/unidades/' + id, d); },
    remove: function(id) { return req('DELETE', '/api/unidades/' + id); },
    orgaos: {
      list:   function(uid)       { return req('GET', '/api/unidades/' + uid + '/orgaos'); },
      add:    function(uid, d)    { return req('POST', '/api/unidades/' + uid + '/orgaos', d); },
      update: function(uid, oid, d) { return req('PUT', '/api/unidades/' + uid + '/orgaos/' + oid, d); },
      remove: function(uid, oid)  { return req('DELETE', '/api/unidades/' + uid + '/orgaos/' + oid); }
    }
  };

  // ─── Notícias ─────────────────────────────────────────────────────────────
  var Noticias = {
    list:   function(q) { return req('GET', '/api/noticias' + (q ? '?' + new URLSearchParams(q) : '')); },
    get:    function(id) { return req('GET', '/api/noticias/' + id); },
    create: function(d)  { return req('POST', '/api/noticias', d); },
    update: function(id, d) { return req('PUT', '/api/noticias/' + id, d); },
    remove: function(id) { return req('DELETE', '/api/noticias/' + id); }
  };

  // ─── Feeds ────────────────────────────────────────────────────────────────
  var Feeds = {
    list:   function()     { return req('GET', '/api/feeds'); },
    create: function(d)    { return req('POST', '/api/feeds', d); },
    update: function(id,d) { return req('PUT', '/api/feeds/' + id, d); },
    remove: function(id)   { return req('DELETE', '/api/feeds/' + id); }
  };

  // ─── Solicitações ─────────────────────────────────────────────────────────
  var Solicitacoes = {
    list:   function()       { return req('GET', '/api/solicitacoes'); },
    create: function(d)      { return req('POST', '/api/solicitacoes', d); },
    update: function(id, st) { return req('PUT', '/api/solicitacoes/' + id, { status: st }); },
    remove: function(id)     { return req('DELETE', '/api/solicitacoes/' + id); }
  };

  // ─── Usuários ─────────────────────────────────────────────────────────────
  var Usuarios = {
    list:   function()       { return req('GET', '/api/usuarios'); },
    create: function(d)      { return req('POST', '/api/usuarios', d); },
    update: function(id, d)  { return req('PUT', '/api/usuarios/' + id, d); },
    remove: function(id)     { return req('DELETE', '/api/usuarios/' + id); }
  };

  // ─── Configurações ────────────────────────────────────────────────────────
  var Configuracoes = {
    get:    function()  { return req('GET', '/api/configuracoes'); },
    update: function(d) { return req('PUT', '/api/configuracoes', d); }
  };

  // ─── Estado geral (compatibilidade) ──────────────────────────────────────
  function fetchState() { return req('GET', '/api/state'); }

  return { login, logout, me, getToken, setToken, Unidades, Noticias, Feeds, Solicitacoes, Usuarios, Configuracoes, fetchState };
})();
