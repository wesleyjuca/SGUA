// SGUA — Lógica de domínio (approveUso, leaveUso via API)

// approveUso: registra órgão em unidade (via API)
async function approveUso(unidadeId, orgaoData, toast2) {
  var nome = sanitize(String(orgaoData.nome || ''), 100);
  var tipo = sanitize(String(orgaoData.tipo || ''), 60);
  var errs = validateFields({ nome: nome, tipo: tipo }, [
    { field:'nome', label:'Nome do órgão', required:true, maxLen:100 },
    { field:'tipo', label:'Tipo do evento', required:true, maxLen:60 }
  ]);
  if (errs.length) return { ok: false, err: errs.join(' ') };

  var res = await API.Unidades.orgaos.add(unidadeId, { nome: nome, tipo: tipo });
  if (!res.ok) return { ok: false, err: res.error || 'Erro ao registrar órgão' };
  return { ok: true, orgao: res.orgao };
}

// leaveUso: desativa órgão em unidade (via API)
async function leaveUso(unidadeId, orgaoId) {
  var res = await API.Unidades.orgaos.remove(unidadeId, orgaoId);
  return res.ok ? { ok: true } : { ok: false, err: res.error || 'Erro ao remover órgão' };
}
