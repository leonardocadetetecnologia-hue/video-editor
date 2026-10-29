Siga as instruções completas em `AGENTS.md` na raiz do repositório.

Resumo: editor local de vídeo para Story, Feed e Reels (Next.js + Remotion + FFmpeg) em `motion-studio/`.
Interface em português brasileiro; sempre perguntar Story/Feed/Reels ao criar projeto ou exportar.
Pedidos de edição de vídeo são feitos editando `motion-studio/vibe/projects/<id>.json` conforme
`motion-studio/VIBECODING.md`. `src/lib/model/` e `src/remotion/` usam só imports relativos.
Verifique com `npm run check` e `npx next build` dentro de `motion-studio/`.
