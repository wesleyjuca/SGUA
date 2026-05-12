# SGUA — Setup Supabase

## 1. Criar tabelas (uma vez)

Acesse o **SQL Editor** do Supabase:  
👉 https://supabase.com/dashboard/project/vfcqgubduugncpjsgpqb/sql/new

Cole e execute o conteúdo completo de `migrations/001_schema.sql`.

## 2. Liberar IP do servidor (se necessário)

Se o servidor rodar num IP fixo, adicione-o em:  
**Project Settings → Database → Network Restrictions**

Para desenvolvimento local: desabilite as restrições temporariamente.

## 3. Inserir dados iniciais

```bash
npm run seed
```

Isso insere 3 usuários, 8 unidades, 3 notícias, 3 feeds e configurações padrão.

## 4. Iniciar o servidor

```bash
npm start
```

Acesse: http://localhost:3000

## Credenciais padrão

| Perfil    | Email                      | Senha      |
|-----------|---------------------------|------------|
| Admin     | admin@sema.ac.gov.br      | admin123   |
| Gestor    | gestor@sema.ac.gov.br     | gestor123  |
| Visitante | viewer@sema.ac.gov.br     | viewer123  |
