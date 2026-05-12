// SGUA — Utilitários (sem dependências de React)

// ─── Sanitização e formatação ─────────────────────────────────────────────
function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  var s = str.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim();
  return maxLen ? s.slice(0, maxLen) : s;
}

function formatData(d) {
  if (!d) return '—';
  try {
    var dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch { return d; }
}

function today() { return new Date().toISOString().split('T')[0]; }

function fileToDataUrl(file) {
  return new Promise(function(resolve, reject) {
    if (!file) return resolve('');
    var reader = new FileReader();
    reader.onload = function() { resolve(String(reader.result || '')); };
    reader.onerror = function() { reject(new Error('Falha ao processar arquivo.')); };
    reader.readAsDataURL(file);
  });
}

// ─── Validação declarativa ─────────────────────────────────────────────────
// rules: [{field, label, required, maxLen, pattern, patternMsg, min, max}]
function validateFields(obj, rules) {
  var errs = [];
  rules.forEach(function(r) {
    var v = obj[r.field];
    if (r.required && (!v || String(v).trim() === '')) errs.push(r.label + ' é obrigatório.');
    if (v && r.maxLen && String(v).length > r.maxLen) errs.push(r.label + ': máximo ' + r.maxLen + ' caracteres.');
    if (v && r.pattern && !r.pattern.test(String(v))) errs.push(r.label + ': ' + (r.patternMsg || 'formato inválido'));
    if (v !== undefined && v !== '' && r.min !== undefined && Number(v) < r.min) errs.push(r.label + ': mínimo ' + r.min + '.');
    if (v !== undefined && v !== '' && r.max !== undefined && Number(v) > r.max) errs.push(r.label + ': máximo ' + r.max + '.');
  });
  return errs;
}

// Regras de validação para unidades
var UN_RULES = [
  { field:'tipo',     label:'Tipo',      required:true, pattern:/^(CIMA|UGAI)$/, patternMsg:'deve ser CIMA ou UGAI' },
  { field:'nome',     label:'Nome',      required:true, maxLen:100 },
  { field:'municipio',label:'Município', required:true, maxLen:100 },
  { field:'status',   label:'Status',    required:true, pattern:/^(ativo|manutencao|inativo)$/, patternMsg:'deve ser ativo, manutencao ou inativo' },
  { field:'taxaUso',  label:'Taxa de Uso', min:0, max:100 }
];

var NW_RULES = [
  { field:'titulo', label:'Título', required:true, maxLen:200 },
  { field:'data',   label:'Data',   required:true }
];

var USER_RULES = [
  { field:'nome',  label:'Nome',  required:true, maxLen:100 },
  { field:'email', label:'Email', required:true, pattern:/^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg:'email inválido' }
];

// ─── Exportação CSV/XLSX ───────────────────────────────────────────────────
var UN_COLS = [
  { key:'id',          label:'ID',           fmt:function(u){return u.id;} },
  { key:'tipo',        label:'Tipo',         fmt:function(u){return u.tipo;} },
  { key:'nome',        label:'Nome',         fmt:function(u){return u.nome;} },
  { key:'municipio',   label:'Município',    fmt:function(u){return u.municipio;} },
  { key:'regional',    label:'Regional',     fmt:function(u){return u.regional;} },
  { key:'lat',         label:'Latitude',     fmt:function(u){return u.lat||'';} },
  { key:'lng',         label:'Longitude',    fmt:function(u){return u.lng||'';} },
  { key:'status',      label:'Status',       fmt:function(u){return u.status;} },
  { key:'taxaUso',     label:'Taxa Uso(%)',  fmt:function(u){return u.taxa_uso||u.taxaUso||0;} },
  { key:'ocupacao',    label:'Ocupação',     fmt:function(u){return u.ocupacaoAtual||0;} },
  { key:'quartos',     label:'Quartos',      fmt:function(u){return u.quartos||0;} },
  { key:'salas',       label:'Salas',        fmt:function(u){return u.salas||0;} },
  { key:'cozinha',     label:'Cozinha',      fmt:function(u){return u.cozinha?'Sim':'Não';} },
  { key:'auditorio',   label:'Auditório',    fmt:function(u){return u.auditorio?'Sim':'Não';} },
  { key:'visivel',     label:'Visível',      fmt:function(u){return u.visivel?'Sim':'Não';} },
  { key:'decreto',     label:'Decreto',      fmt:function(u){return u.decreto||'';} },
  { key:'descricao',   label:'Descrição',    fmt:function(u){return u.descricao||'';} }
];

var NW_COLS = [
  { key:'id',       label:'ID',        fmt:function(n){return n.id;} },
  { key:'titulo',   label:'Título',    fmt:function(n){return n.titulo;} },
  { key:'data',     label:'Data',      fmt:function(n){return n.data;} },
  { key:'categoria',label:'Categoria', fmt:function(n){return n.categoria;} },
  { key:'autor',    label:'Autor',     fmt:function(n){return n.autor;} },
  { key:'visivel',  label:'Visível',   fmt:function(n){return n.visivel?'Sim':'Não';} }
];

var SOL_COLS = [
  { key:'id',          label:'ID',            fmt:function(s){return s.id;} },
  { key:'solicitante', label:'Solicitante',   fmt:function(s){return s.solicitante||s.sol;} },
  { key:'organizacao', label:'Organização',   fmt:function(s){return s.organizacao||s.org;} },
  { key:'unidade',     label:'Unidade',       fmt:function(s){return s.unidade||s.un;} },
  { key:'evento',      label:'Evento',        fmt:function(s){return s.evento||s.ev;} },
  { key:'data_evento', label:'Data Evento',   fmt:function(s){return s.data_evento||s.dt;} },
  { key:'status',      label:'Status',        fmt:function(s){return s.status||s.st;} }
];

function escapeCSV(v) {
  var s = String(v == null ? '' : v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportCSV(rows, cols, filename) {
  var header = cols.map(function(c){return escapeCSV(c.label);}).join(',');
  var body = rows.map(function(r){return cols.map(function(c){return escapeCSV(c.fmt(r));}).join(',');});
  var csv = '﻿' + header + '\n' + body.join('\n');
  var blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

function exportXLSX(rows, cols, filename) {
  if (typeof XLSX === 'undefined') { alert('SheetJS não carregado'); return; }
  var data = [cols.map(function(c){return c.label;})].concat(
    rows.map(function(r){return cols.map(function(c){return c.fmt(r);});})
  );
  var ws = XLSX.utils.aoa_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, filename);
}

// ─── localStorage seguro ──────────────────────────────────────────────────
var LS_WARNED = {};
function lsWarnOnce(code, msg) {
  if (LS_WARNED[code]) return;
  LS_WARNED[code] = true;
  console.warn('SGUA storage:', msg);
}
function lsGet(key, fallback) {
  try {
    var r = localStorage.getItem(SK + key);
    if (!r) return fallback;
    try { return JSON.parse(r); } catch {
      lsWarnOnce('parse_' + key, 'Dados corrompidos em "' + key + '". Resetado.');
      localStorage.removeItem(SK + key);
      return fallback;
    }
  } catch (e) { lsWarnOnce('read_' + key, String(e?.message || e)); return fallback; }
}
function lsSet(key, data) {
  try { localStorage.setItem(SK + key, JSON.stringify(data)); return true; }
  catch (e) { lsWarnOnce('write_' + key, String(e?.message || e)); return false; }
}
function lsClear() {
  try { Object.keys(localStorage).filter(function(k){return k.startsWith(SK);}).forEach(function(k){localStorage.removeItem(k);}); }
  catch {}
}
