# Vibecoding no Motion Studio (guia para agentes de IA: Claude Code, Codex, Cursor, Gemini…)

O usuário descreve edições em linguagem natural; você altera o projeto e o editor aberto no navegador
mostra o resultado na hora, já posicionado no clipe que mudou. O usuário pode desfazer com Ctrl+Z.

## Fluxo

1. Leia `vibe/context.json`: projeto aberto, arquivo do projeto, cursor (`cursor.sec`) e clipes
   selecionados. "Este clipe", "aqui", "a partir deste ponto" se referem a isso.
2. Leia o arquivo do projeto `vibe/projects/<id>.json` e `vibe/assets.json` (mídias disponíveis).
3. Edite o arquivo do projeto (Edit). Ao salvar, o app valida, grava e atualiza a prévia.
4. Confira: se existir `vibe/projects/<id>.erros.txt`, a edição foi rejeitada — leia, corrija, salve de novo.
   Avisos não bloqueiam (ex.: clipes sobrepostos).
5. Se o arquivo mudar enquanto você edita (o usuário mexeu no editor), leia de novo antes de editar.

O servidor precisa estar rodando (`npm run dev` ou o atalho `Iniciar Motion Studio.bat`).

## Modelo do projeto (tipos completos em `src/lib/model/types.ts`)

- Unidades: tempo em **quadros** (`fps` do projeto). Para facilitar, ao editar você pode usar
  `startSec`, `durationSec`, `trimStartSec`, `audioFadeInSec`, `audioFadeOutSec`, `transitionIn.durationSec`,
  `keyframes.<prop>[].sec` e `markers[].sec` — o app converte para quadros.
- Campos omitidos recebem padrões (transform, filtros, estilo de texto do projeto etc.). `id` de clipe
  novo pode ser omitido. **Nunca mude o `id` do projeto.**
- `tracks[0]` é a camada de cima. Faixas `"visual"` levam video/image/text/shape/component; `"audio"` só audio.
- `transform`: `x`, `y` = canto superior esquerdo em pixels da composição (`width`×`height`);
  `scale` 1 = 100%; `rotation` em graus. Mídia usa `fit`: `contain` | `cover` | `fill`.
- `keyframes`: `{ "x": [{ "frame": 0, "value": 0, "easing": "ease-out" }, …] }` — quadros relativos ao
  início do clipe. Propriedades: x, y, scale, rotation, opacity. Easing: linear, ease-in, ease-out, ease-in-out.
- Transições (`transitionIn`/`transitionOut`): fade, dissolve, slide-left/right/up/down, zoom-in, zoom-out,
  wipe-left/right, blur.
- Texto: `{ "type": "text", "text": "…", "style": { fontFamily, fontSize, fontWeight, color, align,
  background (cor ou null), padding, borderRadius, strokeColor, strokeWidth, shadow, uppercase,
  animation: none|fade|slide-up|pop|bounce|typewriter } }`.
- Mídia: `{ "type": "video"|"audio"|"image", "assetId": "<de assets.json>", trimStart, speed, volume,
  videoMuted, freeze }`.
- Forma: `{ "type": "shape", "shape": "rect"|"ellipse", fill, radius, strokeColor, strokeWidth }`.
- Filtros (`filters`): brightness, contrast, saturation (1 = neutro), hue (graus), blur (px), grayscale, sepia (0–1).

### Formatos do Instagram

`formatId`: `ig-story` e `ig-reels` (1080×1920), `ig-feed-portrait` (1080×1350), `ig-feed-34` (1080×1440),
`ig-feed-square` (1080×1080), `ig-feed-landscape` (1080×566). Para trocar o formato de um projeto, prefira
o botão "Converter" no editor (reposiciona tudo). Áreas seguras em `src/lib/model/formats.ts` — mantenha
textos dentro delas (Reels: evite os 420 px inferiores e 140 px à direita).

## IA local (gratuita, offline)

Para entender um vídeo antes de editar ("corta as partes chatas", "pega os melhores momentos"):

```bash
curl -s -X POST http://localhost:3000/api/ai/jobs -H "Content-Type: application/json" -d "{\"kind\":\"analyze\",\"assetId\":\"<id>\"}"
```

Acompanhe com `GET /api/ai/jobs/<jobId>` até `status: "done"`. Depois leia
`vibe/analysis/<assetId>/resumo.md` (fala com tempos, silêncios, lista de quadros) e abra as imagens
em `vibe/analysis/<assetId>/frames/` para ver o conteúdo. `transcript.json` tem as palavras com tempo
(ms do arquivo de origem). Outras tarefas: `transcribe` e `silences` (mesmo formato).

- **Legendas**: clipe `{ "type": "component", "componentId": "legendas", "props": { "captions": [...],
  "sourceAssetId": "<id>" } }`. As palavras estão em ms **relativos ao início do clipe de legenda**; para
  corrigir um erro de transcrição, edite o `text` da palavra (mantenha o espaço inicial). Prefira gerar pelo
  botão "Legendas automáticas" do editor, que já alinha aos cortes; se você cortar o vídeo depois, peça ao
  usuário para clicar de novo ou recalcule a partir de `transcript.json`.
- **Cortar silêncios**: use `silences.json` (segundos da origem) para dividir/remover trechos, ou peça ao
  usuário o botão "Cortar silêncios" (faz ripple na faixa e realinha as legendas).
- Transcrição: whisper.cpp 1.5.5 + modelo `small` em `data/tools/whisper-1.5.5` (CPU). Os silêncios são
  removidos do áudio antes de transcrever para os tempos não escorregarem nas pausas.

## Animações em código (motion design sob medida)

Quando o pedido não cabe em texto/forma/keyframes (partículas, gráficos animados, kinetic type complexo):

1. Crie `src/remotion/custom/<Nome>.tsx` seguindo os exemplos (`TituloCinetico.tsx`, `ContagemRegressiva.tsx`,
   `BarraProgresso.tsx`): componente React com Remotion (`useCurrentFrame`, `spring`, `interpolate`),
   exportando um `CustomComponentDef` com `defaultProps`, `propSpecs`, `defaultSeconds` e `defaultBox` opcional.
2. Registre em `src/remotion/custom/registry.ts` com um id em kebab-case.
3. Use no projeto: `{ "type": "component", "componentId": "<id>", "props": { … }, "startSec": 2 }`.

Regras: só imports relativos e de `react`, `remotion` e `@remotion/*` (o render final empacota essa pasta sem o alias `@/`);
nada de `Math.random()` sem semente (use `random("seed")` do Remotion) para o render bater com a prévia;
`useCurrentFrame()` começa em 0 no início do clipe. A prévia recarrega sozinha quando o arquivo é salvo.

## Exportar sem abrir o diálogo

Sempre confirme com o usuário se é Story, Feed ou Reels antes de exportar.

```bash
curl -s -X POST http://localhost:3000/api/render -H "Content-Type: application/json" -d "{\"projectId\":\"<id>\",\"formatId\":\"ig-reels\",\"exportSettings\":{\"codec\":\"h264\",\"quality\":\"alta\",\"audioBitrate\":\"192k\"}}"
```

Acompanhe com `GET /api/render/<renderId>`; o arquivo final fica em `data/exports/`.
