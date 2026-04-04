# SEMA/AC — Sistema de Gestão CIMA & UGAI

**Secretaria de Estado do Meio Ambiente do Acre**

---

## Sobre o sistema

Plataforma web de gestão, monitoramento e operação das unidades ambientais do Estado do Acre:

- **CIMAs** — Centros Integrados de Meio Ambiente  
- **UGAIs** — Unidades de Gestão Ambiental Integrada

---

## Funcionalidades

### Área pública (sem login)
- Hero institucional com estatísticas em tempo real
- Mapa interativo Leaflet com clustering de marcadores
- Listagem e detalhamento de unidades CIMA e UGAI
- Sistema de notícias com categorias e filtros
- Formulário de solicitação de uso
- Página de transparência pública
- Assistente IA (Claude API)

### Área administrativa (login)
- Autenticação por e-mail + senha
- RBAC: Admin / Gestor / Visualizador
- CRUD completo de unidades (galeria, história, extras)
- CRUD completo de notícias (HTML)
- Gestão de feeds RSS
- Aprovação/rejeição de solicitações
- Gestão de usuários com permissões granulares
- Recuperação de senha (simulada)
- Configuração de visibilidade de seções

---

## Como usar

### Abrir direto no navegador
```
Abrir index.html em qualquer navegador moderno.
Não requer instalação ou servidor.
```

### GitHub Pages
1. Faça upload do `index.html` no repositório
2. Ative GitHub Pages na aba Settings
3. Acesse em `https://usuario.github.io/repositorio`

---

## Credenciais de demonstração

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Visualizador | viewer@sema.ac.gov.br | viewer123 |

> O login aparece **somente** ao clicar em "⚙ Admin" — a página inicial é pública.

---

## Tecnologias

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| React | 18.2 (CDN) | Interface |
| Leaflet | 1.9.4 | Mapa interativo |
| Leaflet.markercluster | 1.5.3 | Agrupamento |
| Claude API | claude-sonnet-4 | Assistente IA |

---

## Design

- Paleta amazônica: verde-floresta `#0A3D2B` → `#2E9E63`, azul-rio `#1565A8`
- Fonte: `-apple-system, BlinkMacSystemFont, Segoe UI` (nativa)
- Mapa: OpenStreetMap + Leaflet + marcadores SVG pin com ícone C/U
- Navbar: logo SVG pin + barra de governo + menu de navegação

---

© 2026 SEMA/AC — Governo do Estado do Acre
