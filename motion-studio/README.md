# Motion Studio

Editor local de vídeo, imagem e motion design, pensado para **Story, Feed e Reels do Instagram**.
Roda no Windows 11 pelo navegador, offline, sem APIs pagas.

## Como abrir

Dê dois cliques em **`Iniciar Motion Studio.bat`** (na pasta acima desta). Ele instala o que faltar,
prepara o app e abre `http://localhost:3000`.

Para desenvolvimento (recarrega a cada alteração no código):

```bash
npm run dev
```

## Como o fluxo funciona

1. **Primeiro uso** — o app pergunta qual é o seu padrão de vídeo (formato mais usado, fps, fundo,
   fonte e animação de texto, transição automática, exportação) e salva como preset padrão.
2. **Novo projeto** — sempre pergunta: *Story, Feed ou Reels?* O formato do padrão já vem marcado,
   então basta confirmar. Feed oferece 4:5, 3:4, 1:1 e paisagem.
3. **Exportar** — pergunta de novo o destino. Se for diferente do projeto (ex.: projeto Reels → Feed 4:5),
   a exportação é reenquadrada automaticamente sem alterar o projeto.
4. **Presets e estilos** — padrões de vídeo, estilos de texto e looks (cor + transições) ficam salvos
   e são reutilizados em qualquer projeto, sem reconfigurar.

## Vibecoding pelo Claude Code

Deixe o editor aberto no navegador e peça a edição em conversa com o Claude Code
("corta os 2 primeiros segundos", "título PROMO no topo com efeito pop", "deixa este clipe mais lento",
"cria uma animação de confete no final"). O Claude altera o projeto e a prévia atualiza na hora,
já posicionada e com o clipe alterado selecionado. **Ctrl+Z** desfaz a edição do Claude.

- O projeto aberto vive em `vibe/projects/<id>.json`; o editor publica seleção e cursor em
  `vibe/context.json` ("este clipe", "aqui"); mídias em `vibe/assets.json`; animações em `vibe/components.json`.
- Edições inválidas são rejeitadas sem estragar nada: o selo "Vibe ao vivo" fica vermelho com o motivo.
- Animações sob medida são componentes Remotion em `src/remotion/custom/` (aba **Animações**).
- Guia completo para o Claude: [VIBECODING.md](VIBECODING.md).

## IA local (gratuita, offline)

Selecione um clipe de vídeo ou áudio e use a seção **Inteligência artificial** do painel de propriedades:

- **Legendas automáticas** — transcreve a fala (whisper.cpp, modelo `small`, português) e cria legendas
  animadas estilo Reels com a palavra falada em destaque. Estilo e posição editáveis.
- **Cortar silêncios** — remove pausas e fecha as lacunas; legendas existentes são realinhadas.
- **Analisar para o Claude** — gera quadros-chave, transcrição e silêncios em `vibe/analysis/` para o
  Claude Code "assistir" ao vídeo e sugerir cortes.

A IA de transcrição já está instalada em `data/tools/`. Em outro computador, o app instala sozinho na
primeira legenda (ou rode `node scripts/setup-ia.mjs`). Roda na CPU: cerca de 1 s de processamento por
segundo de fala.

## O que já funciona

- Biblioteca de mídia: importação por botão ou arrastar (upload em streaming, sem limite de tamanho),
  miniaturas, waveforms, busca, proxies de preview e inversão de clipes.
- Timeline multifaixas: mover entre faixas, trim, slip (Alt+arrastar), lâmina, dividir, ripple delete,
  fechar lacunas, duplicar, copiar/colar, snap magnético, zoom (Ctrl+roda), marcadores,
  bloquear/ocultar/silenciar faixas, velocidade, congelar quadro, separar áudio.
- Preview em tempo real (Remotion Player) com mover/redimensionar/girar direto no quadro,
  guias inteligentes, área segura do Instagram, grade e regra dos terços.
- Propriedades: transformação com **keyframes** e suavização, texto completo (fonte, contorno, sombra,
  caixa, 6 animações), formas, cor/efeitos, transições de entrada e saída, volume e fades de áudio.
- Undo/redo, autosave em SQLite, versões anteriores para recuperação, layout de painéis salvo,
  atalhos de teclado configuráveis.
- Exportação MP4 H.264/H.265, WebM VP9, MOV ProRes e quadro PNG, com fila, progresso e cancelamento.

## Arquitetura

| Camada | Onde | Observação |
| --- | --- | --- |
| Modelo canônico | `src/lib/model/` | Tipos e operações puras, sem React/Remotion. Use só imports relativos. |
| Composição | `src/remotion/` | Interpreta o modelo. A mesma composição faz o preview e o render (o que se vê é o que se exporta). |
| Estado do editor | `src/store/editor.ts` | Zustand, histórico de undo/redo, gestos de arrastar. |
| Interface | `src/components/` | Painéis, timeline, preview, diálogos. |
| API local | `src/app/api/` | Projetos, mídia, presets, estilos, renderização. |
| Servidor | `src/server/` | SQLite (`node:sqlite`), FFmpeg, fila de render. |
| Worker de render | `scripts/render-worker.mjs` | Processo separado; reaproveita o bundle enquanto o código não muda. |

Dados ficam em `data/` (banco, mídias, caches e exportações). As pastas de mídia e de exportação
podem ser trocadas em **Configurações → Armazenamento**.

## FFmpeg

O app usa o FFmpeg que acompanha o Remotion (nada para instalar). Essa build é reduzida; se houver um
FFmpeg completo no sistema (`winget install Gyan.FFmpeg`) ou em `FFMPEG_PATH`, ele é usado
automaticamente.

## Licenças

Remotion é gratuito para pessoas físicas e empresas com até 3 funcionários; empresas maiores precisam de
uma licença comercial (remotion.pro). Demais dependências são de código aberto (MIT/Apache/ISC).
