// SGUA — Utilitários puros

var Utils = (function() {

  function fmtDate(val) {
    if (!val) return '—';
    var d = new Date(val + (String(val).length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return String(val).slice(0, 10) || '—';
    return d.toLocaleDateString('pt-BR');
  }

  function fmtDatetime(val) {
    if (!val) return '—';
    var d = new Date(val);
    if (isNaN(d)) return '—';
    return d.toLocaleString('pt-BR');
  }

  function fmtRelative(val) {
    if (!val) return '—';
    var diff = (Date.now() - new Date(val).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return Math.floor(diff / 60) + 'min atrás';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h atrás';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd atrás';
    return fmtDate(val);
  }

  function fmtCPF(val) {
    var s = String(val || '').replace(/\D/g, '').slice(0, 11);
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function fmtTel(val) {
    var s = String(val || '').replace(/\D/g, '').slice(0, 11);
    if (s.length === 11) return s.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return s;
  }

  function slugify(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function esc(val) {
    return String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function debounce(fn, ms) {
    var timer;
    return function() {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(ctx, args); }, ms);
    };
  }

  function truncate(str, max) {
    var s = String(str || '');
    return s.length <= max ? s : s.slice(0, max) + '…';
  }

  function pick(obj, keys) {
    var out = {};
    keys.forEach(function(k) { if (k in obj) out[k] = obj[k]; });
    return out;
  }

  function groupBy(arr, key) {
    return arr.reduce(function(acc, item) {
      var k = item[key];
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  }

  function sortBy(arr, key, desc) {
    return arr.slice().sort(function(a, b) {
      var va = a[key], vb = b[key];
      var cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }

  function filterBy(arr, q, fields) {
    if (!q) return arr;
    var lower = q.toLowerCase();
    return arr.filter(function(item) {
      return fields.some(function(f) { return String(item[f] || '').toLowerCase().includes(lower); });
    });
  }

  return { fmtDate: fmtDate, fmtDatetime: fmtDatetime, fmtRelative: fmtRelative, fmtCPF: fmtCPF, fmtTel: fmtTel, slugify: slugify, esc: esc, debounce: debounce, truncate: truncate, pick: pick, groupBy: groupBy, sortBy: sortBy, filterBy: filterBy };
})();
