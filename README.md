# Motion Studio

Editor local de vídeo, imagem e motion design para **Story, Feed e Reels do Instagram** — em português,
offline, sem APIs pagas. Edite com o mouse ou peça as edições em linguagem natural a um assistente de IA
(vibecoding): a prévia atualiza na hora.

## Começar

Requisitos: [Node.js](https://nodejs.org) 22.13 ou superior e Git.

```bash
git clone <url-deste-repositório>
```

- **Windows:** dois cliques em `Iniciar Motion Studio.bat`.
- **macOS/Linux:** `./iniciar.sh`.
- **Modo desenvolvimento:** `cd motion-studio && npm install && npm run dev` → http://localhost:3000.

Opcional: `cd motion-studio && npm run setup:ia` baixa a IA de legendas (≈500 MB); sem isso, ela se instala
sozinha na primeira legenda.

## Usar com um assistente de IA

Abra a pasta do repositório no seu assistente (Claude Code, Codex, Cursor, Copilot, Gemini CLI…). As
instruções estão em [`AGENTS.md`](AGENTS.md), lido automaticamente pela maioria deles (`CLAUDE.md` e
`GEMINI.md` apontam para ele). Com o editor aberto no navegador, peça coisas como:

- "Coloca um título 'PROMO DE VERÃO' no começo com efeito pop."
- "Corta os silêncios e gera legendas."
- "Analisa o vídeo e monta um Reels de 20 segundos com os melhores momentos."
- "Cria uma animação de confete com as cores da marca no final."

## Documentação

- [Manual do editor](motion-studio/README.md) — recursos, IA local, arquitetura.
- [Vibecoding](motion-studio/VIBECODING.md) — como o assistente edita projetos e cria animações.

Seus projetos, mídias e exportações ficam em `motion-studio/data/` e não vão para o Git — faça backup
dessa pasta separadamente.

Remotion é gratuito para pessoas físicas e empresas com até 3 funcionários; empresas maiores precisam de
licença comercial (remotion.pro).
