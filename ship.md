# /ship

Workflow padrão de "terminei a feature, vamos pra produção".

Execute na ordem:

1. Rode `pnpm typecheck` — deve passar com zero errors. Se falhar, conserta antes de seguir.
2. Rode `pnpm build` — deve buildar sem warnings críticos. Se falhar, conserta.
3. Rode `git status` e `git diff --stat` pra mostrar o que mudou.
4. Pergunte ao usuário: "Posso commitar e dar push?" — espere confirmação explícita.
5. Após "sim":
   - Escreva uma commit message:
     - Comece com verbo no imperativo (add, fix, update, remove, refactor)
     - Resuma o **porquê**, não o quê
     - Máx 72 caracteres na primeira linha
     - Lowercase (exceto siglas)
     - Sem ponto final
     - Body opcional só se a mudança for não-óbvia
   - Faça `git add -A`, `git commit`, `git push origin main`
6. Confirme que o deploy do Cloudflare Pages foi disparado (mostre o link do dashboard).
7. Não rode mais nada depois disso — pare e devolva o controle.

## Importante

- **Nunca** force push (`-f`)
- **Nunca** ignore o typecheck — se não passa, não dá ship
- **Nunca** commite arquivos novos sem ler o que tem dentro (especialmente .env, .dev.vars)
- Se houver merge conflict, pare e peça ajuda
