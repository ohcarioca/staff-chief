# Staff Chief

Segundo cérebro gerencial pessoal, executado somente na máquina local.

## Primeira execução

Pré-requisitos: Windows, Node.js 22+, pnpm e Codex CLI autenticado.

```powershell
pnpm install
pnpm build
pnpm start:local
```

Depois da preparação inicial, `pnpm start:local` valida o ambiente, abre o navegador e mantém o servidor disponível em `http://127.0.0.1:3000`.

Os dados ficam em `%LOCALAPPDATA%\StaffChief\staff-chief.db`. O aplicativo oferece exportação e restauração de backup pela barra lateral.

## Desenvolvimento

```powershell
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
```

## Privacidade

- Interface e banco são locais; o servidor aceita apenas `localhost` e `127.0.0.1`.
- Notas só são enviadas ao Codex após prévia e confirmação explícita.
- O app reutiliza a autenticação do Codex CLI e não lê nem armazena credenciais.
- Análises são efêmeras, usam sandbox somente leitura e nunca alteram notas automaticamente.
