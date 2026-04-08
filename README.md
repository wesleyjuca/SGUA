# SEMA/AC — Sistema de Gestão CIMA & UGAI  
### v4.0 — Full-Stack: Domínio · Relatórios · Segurança

---

## Novas funcionalidades (v4)

### 1. Regra de domínio — `approveUso`
- **Validação completa** com `validateFields()` + `sanitize()`
- **Prevenção de duplicação**: mesmo órgão ativo na unidade é bloqueado
- **`ocupacaoAtual++`**: contador atômico sincronizado com estado React
- **Registro estruturado**: `{id, nome, tipo, dataEntrada, ativo: true}`
- **Persistência imediata**: grava em localStorage + estado React atomicamente
- **`leaveUso()`**: desativa órgão e registra `dataSaida` (checkout)
- **Integrado automaticamente** ao fluxo de aprovação de solicitações

### 2. Relatórios (aba exclusiva no Admin)
| Recurso | Detalhe |
|---------|---------|
| Export CSV | Blob UTF-8 com BOM, RFC 4180, download direto |
| Export XLSX | SheetJS, largura automática por coluna |
| Import CSV | Parser RFC 4180 robusto (aspas, vírgulas, quebras) |
| Import XLSX | Via SheetJS, mapeamento automático de colunas |
| Validação | Regras por campo: tipo, lat/lng range, status enum, maxLen |
| Deduplicação | Por nome (case-insensitive) — estratégia configurável |
| Merge | Adiciona novas, ignora existentes |
| Overwrite | Substitui por nome, mantém sem correspondência |
| Preview | Tabela com status por linha antes de aplicar |
| Datasets | Unidades, Notícias, Solicitações, Ocupação por Órgão |

### 3. Segurança
| Recurso | Implementação |
|---------|--------------|
| SHA-256 | Pure JS sync (sem dependências) — `sha256()` |
| Senhas | Hash com salt fixo `sagcu:` — nunca plaintext |
| Sanitização | `sanitize(str, maxLen)` — remove HTML/scripts |
| Validação | `validateFields(obj, rules)` — declarativa e reutilizável |
| localStorage | Apenas dados de negócio — jamais senhas/tokens |
| Cache | Versão `sagcu_v4_` — `lsClear()` disponível no admin |
| Inputs | Todos sanitizados antes de persistir |

---

## Arquitetura das novas funções

```
sha256(msg)                 → hex string (pure JS, sync)
sanitize(str, maxLen?)      → string limpa
validateFields(obj, rules)  → string[] de erros

approveUso(uns, setUns, unidadeId, {nome, tipo})
  → {ok: true,  orgao: {id, nome, tipo, dataEntrada, ativo}}
  → {ok: false, err: "mensagem de erro"}

leaveUso(uns, setUns, unidadeId, orgaoId)
  → {ok: true}  | {ok: false, err: string}

exportCSV(rows, cols, filename)   → download automático
exportXLSX(rows, cols, filename)  → download (requer SheetJS)
parseCSV(text)                    → {headers, rows}
parseCSVLine(line)                → string[]
applyImport(uns, parsedRows, strategy: 'merge'|'overwrite') → Unit[]
```

---

## Persistência localStorage

```
sagcu_v4_uns    → unidades (com orgaosPresentes, ocupacaoAtual)
sagcu_v4_news   → notícias
sagcu_v4_feeds  → feeds RSS
sagcu_v4_sols   → solicitações
```
> **Senhas NÃO são armazenadas.** Usuários re-inicializam com SHA-256 a cada load.

---

## Credenciais de demonstração

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin | admin@sema.ac.gov.br | admin123 |
| Gestor | gestor@sema.ac.gov.br | gestor123 |
| Visualizador | viewer@sema.ac.gov.br | viewer123 |

---

## Como testar as novas features

### approveUso via interface
1. Menu **Solicitação** → preencha o formulário e envie
2. Acesse **Admin** → **Solicitações**
3. Clique **Aprovar** — `approveUso` é chamado automaticamente
4. Acesse a unidade → aba **Ocupação** para ver o órgão registrado

### approveUso direto (console)
```javascript
// Na aba Ocupação de qualquer unidade (botão "+ Registrar")
// preencha Nome do órgão e Tipo de uso → clique Registrar
// testa: validação, deduplicação, persistência
```

### Relatórios
1. Admin → **Relatórios** → aba **Exportar**
2. Selecione dataset e formato → baixe o arquivo
3. Edite o CSV/XLSX e reimporte na aba **Importar**
4. Escolha estratégia **Merge** ou **Overwrite** → veja o preview → confirme

---

## Tecnologias

| Lib | Versão | CDN |
|-----|--------|-----|
| React | 18.2 | cdnjs |
| ReactDOM | 18.2 | cdnjs |
| Leaflet | 1.9.4 | cdnjs |
| MarkerCluster | 1.5.3 | cdnjs |
| SheetJS (xlsx) | 0.18.5 | cdnjs |

> SHA-256 implementado em pure JS — zero dependências para segurança.

---

© 2026 SEMA/AC — Governo do Estado do Acre
