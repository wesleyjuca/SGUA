# Revisão técnica e sugestões de aprimoramento

Este documento resume oportunidades de correção e evolução identificadas no código atual.

## Correção aplicada
- **Fluxo de aprovação de solicitações**: a UI marcava uma solicitação como `aprovada` mesmo quando `approveUso` falhava (por exemplo, unidade não encontrada, unidade inativa ou órgão duplicado). Agora a aprovação só ocorre quando `approveUso` retorna sucesso.

## Melhorias recomendadas (próximos passos)
1. **Separar responsabilidades em módulos**
   - Extrair domínio (`approveUso`, `leaveUso`), persistência (`lsGet/lsSet`) e componentes React para arquivos distintos.
   - Benefício: manutenção, testes e onboarding mais simples.

2. **Fortalecer autenticação local**
   - O hash com salt fixo é melhor que texto puro, mas ainda fraco para cenário real.
   - Sugestão: usar `crypto.subtle` + salt por usuário + iterações (PBKDF2/Argon2 no backend quando houver API).

3. **Testes automatizados mínimos do domínio**
   - Criar testes para regras críticas: duplicação de órgão, bloqueio em unidade inativa, atualização de ocupação e data de saída.
   - Benefício: evita regressões no fluxo administrativo.

4. **Observabilidade de erros de persistência**
   - Hoje erros de `localStorage` são silenciosos em alguns pontos.
   - Sugestão: registrar warnings controlados (ou toasts) para quota excedida/corrupção de dados.

5. **Performance e DX**
   - O `index.html` concentra CSS, domínio e UI num único arquivo extenso.
   - Sugestão: migrar gradualmente para build com bundler (Vite) e dividir em componentes para reduzir risco de edição acidental.
