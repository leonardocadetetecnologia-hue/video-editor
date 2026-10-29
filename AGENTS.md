# Motion Studio — guia para agentes de IA

Este arquivo é a fonte única de instruções para qualquer assistente de código (Claude Code, Codex,
Cursor, GitHub Copilot, Gemini CLI, Windsurf…). Leia-o inteiro antes de trabalhar. O usuário escreve em
português, atua como arquiteto e validador e **não programa**: explique em linguagem simples, faça você
as alterações e verifique antes de dizer que terminou.

## O que é

Editor local de vídeo, imagem e motion design para **Story, Feed e Reels do Instagram**, em português,
rodando no navegador (Next.js) com renderização Remotion e processamento FFmpeg. Sem APIs pagas. O app
fica em `motion-studio/`; o manual do usuário está em `motion-studio/README.md`.

## Instalação do zero

Requisitos: **Node.js 22.13 ou superior** (o banco usa `node:sqlite`), npm 10+ e Git. Windows 11 é a
plataforma principal; macOS e Linux funcionam (veja "Ambiente").

```bash
cd motion-studio
npm install
npm run setup:ia   # opcional: baixa a IA de transcrição local (~500 MB); senão ela instala na primeira legenda
npm run dev        # http://localhost:3000
```

No Windows, o usuário pode só dar dois cliques em `Iniciar Motion Studio.bat` (instala, compila e abre).
A primeira exportação baixa o navegador de renderização do Remotion (Chrome Headless Shell, uma vez).
Banco, mídias, caches e exportações ficam em `motion-studio/data/` e **não** vão para o Git.

## Regras do produto (não negociáveis)

- Interface e mensagens em **português brasileiro**.
- **Sempre perguntar se o vídeo é para Story, Feed ou Reels** ao criar projeto e antes de exportar
  (no app: `NewProjectDialog` e `ExportDialog`; em conversa: pergunte ao usuário). Os demais padrões vêm
  do preset salvo (`VideoPreset`) e não devem ser perguntados de novo.
- Nada de botões fictícios: toda ação exposta na interface precisa funcionar de ponta a ponta.
- Nada específico de uma empresa ou marca no código.

## Edição por vibecoding (pedidos de edição de vídeo)

Quando o usuário pedir uma edição ("corta o começo", "título no topo", "deixa este clipe mais lento",
"cria uma animação de confete"), **não** mexa no código do app: edite o projeto, seguindo
`motion-studio/VIBECODING.md`. Resumo:

1. Leia `motion-studio/vibe/context.json` (projeto aberto, cursor, clipes selecionados).
2. Edite `motion-studio/vibe/projects/<id>.json`. O editor aberto no navegador aplica na hora.
3. Se surgir `motion-studio/vibe/projects/<id>.erros.txt`, a edição foi rejeitada: leia e corrija.
4. Para entender um vídeo, use a análise de IA local (`/api/ai/jobs`, kind `analyze`) e leia
   `motion-studio/vibe/analysis/<assetId>/resumo.md` e os quadros em `frames/`.
5. Animações sob medida: componentes Remotion em `motion-studio/src/remotion/custom/` + `registry.ts`.

O servidor precisa estar rodando (`npm run dev`) para a prévia ao vivo e para as tarefas de IA.

## Arquitetura (`motion-studio/`)

| Pasta | Papel |
| --- | --- |
| `src/lib/model/` | Modelo canônico (tipos, operações puras, normalização, animação). Sem React. **Só imports relativos.** |
| `src/remotion/` | Composição usada no preview **e** no render final; `custom/` = animações em código. Só imports relativos e de `react`, `remotion`, `@remotion/*`. |
| `src/store/editor.ts` | Estado do editor (Zustand), undo/redo, gestos. |
| `src/components/` | Interface: editor, timeline, preview, painéis, diálogos. |
| `src/app/api/` | API local: projetos, mídia, presets, estilos, render, IA, vibe. |
| `src/server/` | SQLite (`node:sqlite`), FFmpeg, fila de render, IA local (`ai.ts`), ponte de vibecoding (`vibe.ts`). |
| `scripts/` | `render-worker.mjs` (render em processo separado), `setup-ia.mjs` (instala o whisper.cpp). |

Convenções que evitam bugs:

- Uma mudança visual vale para preview e exportação ao mesmo tempo: só altere a aparência em
  `src/remotion/MainComposition.tsx` e `src/lib/model/animation.ts`.
- Arrastes no editor: `beginGesture` → `gestureEdit` (recalcula a partir do estado inicial) → `endGesture`.
  Ajustes contínuos no painel de propriedades: `liveEdit` (uma única entrada de histórico).
- Rotas de API rodam no ambiente de Server Components: **não importe** `remotion` nem `src/remotion/custom`
  nelas (o catálogo de animações chega do editor via `/api/vibe/components`).
- O store (`src/store/editor.ts`) não deve importar o registro de animações (hot reload reiniciaria o estado).
- Tempo no modelo é em quadros (`fps` do projeto); o arquivo de vibecoding aceita também `*Sec`.

## Ambiente e armadilhas

- npm 11 bloqueia scripts de instalação (`allowScripts`): evite dependências nativas compiladas no postinstall.
- FFmpeg: sem FFmpeg no sistema, usa a build reduzida que vem com o Remotion (`@remotion/compositor-*`).
  Ela **não tem** fontes lavfi (testsrc, color…), filtros `reverse`/`areverse`/`fps`/`select`, muxer `s16le`
  nem decoder WebP. Tem scale, crop, atrim, concat, apad, silencedetect, atempo, volume, libx264, libx265,
  h264_nvenc, aac, mp3, image2, mjpeg, png, wav. Confira com `ffmpeg -filters` antes de depender de algo;
  `binPath()` prefere um FFmpeg completo do sistema ou `FFMPEG_PATH`.
- IA local: whisper.cpp 1.5.5 + modelo `small` em `data/tools/`. No Windows baixa um binário pronto; no
  macOS/Linux o pacote clona e compila (precisa de git, make e compilador C).
- Remotion é gratuito para pessoas físicas e empresas com até 3 funcionários; acima disso exige licença
  comercial (remotion.pro).
- Scripts PowerShell com acentos precisam de UTF-8 **com BOM** (o Windows PowerShell 5.1 lê sem BOM como ANSI).

## Verificação (rode antes de concluir)

```bash
cd motion-studio
npm run check      # TypeScript + ESLint
npx next build     # build de produção
```

Para mudanças visíveis, abra o editor e confira no navegador; para exportação, renderize um quadro
(`POST /api/render` com `"kind":"still"`) e olhe a imagem gerada.

## Git

Não versionar: `motion-studio/data/` (banco, mídias, exportações, IA baixada), `motion-studio/vibe/`
(espelhos e contexto locais), `node_modules/`, `.next/`. Commits em português, descrevendo o porquê.
