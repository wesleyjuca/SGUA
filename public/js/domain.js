// SGUA — Lógica de domínio compartilhada

var Domain = (function() {

  var TIPOS_UNIDADE = ['CIMA', 'UGAI'];
  var STATUS_UNIDADE = ['active', 'inactive'];
  var STATUS_REQUEST = ['pending', 'approved', 'rejected'];

  function tipoUnidade(nome) {
    return /^UGAI/i.test(String(nome || '')) ? 'UGAI' : 'CIMA';
  }

  function statusLabel(status) {
    var map = { active: 'Ativa', inactive: 'Inativa', ativo: 'Ativa', inativo: 'Inativa' };
    return map[status] || status;
  }

  function statusColor(status) {
    return (status === 'active' || status === 'ativo') ? 'green' : 'gray';
  }

  function requestStatusLabel(status) {
    var map = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada' };
    return map[status] || status;
  }

  function requestStatusColor(status) {
    if (status === 'approved' || status === 'aprovada') return 'green';
    if (status === 'rejected' || status === 'rejeitada') return 'red';
    return 'yellow';
  }

  function roleLabel(role) {
    var map = { admin: 'Administrador', manager: 'Gestor', viewer: 'Visualizador' };
    return map[role] || role;
  }

  function taxaUso(unit) {
    if (!unit.capacity || unit.capacity <= 0) return 0;
    return Math.min(100, Math.round(((unit.current_occupancy || 0) / unit.capacity) * 100));
  }

  function taxaUsoColor(pct) {
    if (pct >= 90) return C.rm;
    if (pct >= 70) return C.ym;
    return C.g2;
  }

  function podeEditar(curUser) {
    return curUser && (curUser.role === 'admin' || curUser.role === 'manager');
  }

  function podeAdmin(curUser) {
    return curUser && curUser.role === 'admin';
  }

  function formatUnidade(u) {
    return {
      id: u.id,
      nome: u.name || u.nome || '',
      tipo: tipoUnidade(u.name || u.nome || ''),
      municipio: u.address || u.municipio || '',
      descricao: u.description || u.descricao || '',
      lat: u.latitude ?? (u.coords && u.coords.lat) ?? null,
      lng: u.longitude ?? (u.coords && u.coords.lng) ?? null,
      status: u.status === 'active' || u.status === 'ativo' ? 'active' : 'inactive',
      capacidade: u.capacity || 0,
      ocupacao: u.current_occupancy || u.ag || 0,
      taxa: taxaUso(u),
      foto: u.banner_url || u.foto || '',
      contato: { nome: u.contact_name || '', email: u.contact_email || '', tel: u.contact_phone || '' }
    };
  }

  return {
    TIPOS_UNIDADE: TIPOS_UNIDADE,
    STATUS_UNIDADE: STATUS_UNIDADE,
    STATUS_REQUEST: STATUS_REQUEST,
    tipoUnidade: tipoUnidade,
    statusLabel: statusLabel,
    statusColor: statusColor,
    requestStatusLabel: requestStatusLabel,
    requestStatusColor: requestStatusColor,
    roleLabel: roleLabel,
    taxaUso: taxaUso,
    taxaUsoColor: taxaUsoColor,
    podeEditar: podeEditar,
    podeAdmin: podeAdmin,
    formatUnidade: formatUnidade
  };
})();
