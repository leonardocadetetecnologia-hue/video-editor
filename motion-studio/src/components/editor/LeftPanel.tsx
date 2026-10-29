"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ContextMenu } from "radix-ui";
import { Bot, Clapperboard, Film, ImageIcon, Layers, Music, Palette, Search, Shapes, Sparkles, Type, Upload, Wand2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Asset, LookData, TextStyle, TransitionType } from "@/lib/model/types";
import { bytes, cn } from "@/lib/utils";
import { useEditor, type LeftTab } from "@/store/editor";
import { Button, TextInput } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { TRANSITION_LABELS } from "@/components/presets/labels";
import { FILTER_PRESETS, applyFilterPreset } from "./PropertiesPanel";
import { analyzeForClaude } from "./ai";
import { CUSTOM_COMPONENTS } from "@/remotion/custom/registry";

const TABS: { id: LeftTab; label: string; icon: React.ElementType }[] = [
  { id: "media", label: "Mídia", icon: Film },
  { id: "motion", label: "Animações", icon: Clapperboard },
  { id: "text", label: "Texto", icon: Type },
  { id: "elements", label: "Elementos", icon: Shapes },
  { id: "transitions", label: "Transições", icon: Layers },
  { id: "effects", label: "Efeitos", icon: Wand2 },
  { id: "styles", label: "Estilos", icon: Palette },
];

export function LeftPanel() {
  const tab = useEditor((s) => s.leftTab);
  const setTab = useEditor((s) => s.setLeftTab);
  return (
    <div className="flex h-full bg-panel">
      <nav className="flex w-[58px] shrink-0 flex-col items-center gap-1 border-r border-line py-2" aria-label="Painéis">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn("flex w-[50px] flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px]", tab === t.id ? "bg-panel-3 text-fg" : "text-muted hover:text-fg")}
          >
            <t.icon size={17} className={tab === t.id ? "text-accent" : ""} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {tab === "media" && <MediaLibrary />}
        {tab === "motion" && <MotionPanel />}
        {tab === "text" && <TextPanel />}
        {tab === "elements" && <ElementsPanel />}
        {tab === "transitions" && <TransitionsPanel />}
        {tab === "effects" && <EffectsPanel />}
        {tab === "styles" && <StylesPanel />}
      </div>
    </div>
  );
}

function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="px-3 pt-3 pb-2">
      <h2 className="text-[12px] font-semibold tracking-wide uppercase">{children}</h2>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

interface Upload {
  name: string;
  progress: number;
  stage: "enviando" | "processando";
}

export function useUploader() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const qc = useQueryClient();
  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setUploads((u) => [...u, { name: file.name, progress: 0, stage: "enviando" }]);
      try {
        const asset = await api.uploadAsset(file, (p) =>
          setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress: p, stage: p >= 1 ? "processando" : "enviando" } : x))),
        );
        useEditor.getState().upsertAsset(asset);
        qc.invalidateQueries({ queryKey: ["assets"] });
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      } finally {
        setUploads((u) => u.filter((x) => x.name !== file.name));
      }
    }
  };
  return { uploads, upload };
}

function MediaLibrary() {
  const assets = useEditor((s) => s.assets);
  const { uploads, upload } = useUploader();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Asset["kind"]>("all");
  const [over, setOver] = useState(false);
  const list = Object.values(assets)
    .filter((a) => (kind === "all" || a.kind === kind) && a.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div
      className={cn("flex min-h-full flex-col", over && "bg-accent/10 outline-2 outline-accent outline-dashed -outline-offset-4")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }
      }}
    >
      <PanelTitle hint="Arraste arquivos para cá ou para a timeline. Clique duplo adiciona no cursor.">Biblioteca de mídia</PanelTitle>
      <div className="flex flex-col gap-2 px-3">
        <Button variant="primary" onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> Importar arquivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*,.mkv,.mov"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="relative">
          <Search size={13} className="absolute top-1/2 left-2 -translate-y-1/2 text-muted" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar mídia" className="pl-7" aria-label="Buscar mídia" />
        </div>
        <div className="flex gap-1">
          {(["all", "video", "image", "audio"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn("flex-1 rounded px-1.5 py-1 text-[11px]", kind === k ? "bg-panel-3 text-fg" : "text-muted hover:text-fg")}
            >
              {{ all: "Tudo", video: "Vídeos", image: "Imagens", audio: "Áudios" }[k]}
            </button>
          ))}
        </div>
      </div>
      {uploads.length > 0 && (
        <div className="mx-3 mt-2 flex flex-col gap-1.5 rounded-md border border-line bg-panel-2 p-2">
          {uploads.map((u) => (
            <div key={u.name} className="text-[11px]">
              <div className="flex justify-between">
                <span className="truncate">{u.name}</span>
                <span className="text-muted">{u.stage === "enviando" ? `${Math.round(u.progress * 100)}%` : "analisando…"}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded bg-bg">
                <div className={cn("h-full bg-accent", u.stage === "processando" && "animate-pulse")} style={{ width: `${u.progress * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 p-3">
        {list.map((a) => (
          <AssetCard key={a.id} asset={a} />
        ))}
        {list.length === 0 && uploads.length === 0 && <p className="col-span-2 py-8 text-center text-[12px] text-muted">Nenhuma mídia ainda. Importe vídeos, imagens ou músicas.</p>}
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const Icon = asset.kind === "video" ? Film : asset.kind === "image" ? ImageIcon : Music;
  const item = "flex cursor-default items-center rounded px-2 py-1.5 text-[12px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white";
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-ms-asset", asset.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onDoubleClick={() => useEditor.getState().addAsset(asset)}
          className="group cursor-grab overflow-hidden rounded-md border border-line bg-panel-2 hover:border-accent/70"
          title={`${asset.name}\n${bytes(asset.size)}${asset.width ? ` · ${asset.width}×${asset.height}` : ""}\nClique duplo: adicionar no cursor`}
        >
          <div className="relative flex aspect-video items-center justify-center bg-black">
            {asset.kind === "audio" ? (
              <Music size={22} className="text-[var(--clip-audio)]" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${asset.id}/thumb`} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" />
            )}
            {asset.duration > 0 && <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px]">{asset.duration.toFixed(1)}s</span>}
            {asset.hasProxy && <span className="absolute top-1 left-1 rounded bg-accent/80 px-1 text-[9px]">PROXY</span>}
          </div>
          <div className="flex items-center gap-1 px-1.5 py-1">
            <Icon size={11} className="shrink-0 text-muted" />
            <span className="truncate text-[11px]">{asset.name}</span>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-44 rounded-lg border border-line bg-panel-2 p-1 shadow-2xl">
          <ContextMenu.Item className={item} onSelect={() => useEditor.getState().addAsset(asset)}>
            Adicionar no cursor
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => useEditor.getState().addAsset(asset, { newTrack: true })}>
            Adicionar em nova faixa
          </ContextMenu.Item>
          <ContextMenu.Item
            className={item}
            onSelect={async () => {
              const name = prompt("Novo nome:", asset.name);
              if (!name) return;
              useEditor.getState().upsertAsset(await api.renameAsset(asset.id, name));
            }}
          >
            Renomear
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => analyzeForClaude(asset.id)}>
            Analisar com IA (para o Claude)
          </ContextMenu.Item>
          {asset.kind === "video" && (
            <ContextMenu.Item
              className={item}
              onSelect={async () => {
                toast.info("Gerando proxy de preview…");
                try {
                  useEditor.getState().upsertAsset(await api.makeProxy(asset.id));
                  toast.ok("Proxy pronto");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Gerar proxy de preview
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="my-1 h-px bg-line" />
          <ContextMenu.Item
            className={cn(item, "text-danger")}
            onSelect={async () => {
              const p = useEditor.getState().project;
              const used = p?.tracks.some((t) => t.clips.some((c) => "assetId" in c && c.assetId === asset.id));
              if (!confirm(`Excluir "${asset.name}" da biblioteca e apagar a cópia do app no disco?${used ? "\n\nATENÇÃO: está em uso neste projeto." : ""}`)) return;
              await api.deleteAsset(asset.id);
              const s = useEditor.getState();
              const next = { ...s.assets };
              delete next[asset.id];
              s.setAssets(Object.values(next));
              qc.invalidateQueries({ queryKey: ["assets"] });
            }}
          >
            <Trash2 size={12} className="mr-1.5" /> Excluir
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

const TEXT_PRESETS: { name: string; text: string; style: Partial<TextStyle> }[] = [
  { name: "Título", text: "Título impactante", style: { fontSize: 128, fontWeight: 900, animation: "pop", fontFamily: "Arial Black" } },
  { name: "Subtítulo", text: "Um subtítulo", style: { fontSize: 64, fontWeight: 600, animation: "slide-up" } },
  { name: "Legenda", text: "Legenda do vídeo", style: { fontSize: 52, fontWeight: 700, background: "#000000cc", padding: 20, animation: "fade" } },
  { name: "Destaque", text: "OFERTA", style: { fontSize: 110, fontWeight: 900, background: "#ec4899", color: "#ffffff", uppercase: true, padding: 28, borderRadius: 24, animation: "bounce" } },
  { name: "Chamada (CTA)", text: "Arraste para cima ↑", style: { fontSize: 56, fontWeight: 800, background: "#ffffff", color: "#111111", padding: 22, borderRadius: 60, animation: "slide-up" } },
  { name: "Contorno", text: "ESTILO", style: { fontSize: 140, fontWeight: 900, color: "#ffffff00", strokeColor: "#ffffff", strokeWidth: 4, shadow: false, uppercase: true, fontFamily: "Impact" } },
  { name: "Máquina de escrever", text: "Digitando...", style: { fontSize: 64, fontWeight: 500, fontFamily: "Courier New", animation: "typewriter" } },
];

function TextPanel() {
  const styles = useQuery({ queryKey: ["styles"], queryFn: api.styles });
  const saved = (styles.data ?? []).filter((s) => s.kind === "text");
  return (
    <div>
      <PanelTitle hint="Clique para adicionar no cursor da timeline.">Textos</PanelTitle>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <Button variant="primary" onClick={() => useEditor.getState().addText()}>
          <Type size={14} /> Texto com estilo padrão
        </Button>
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => useEditor.getState().addText(p.text, p.style)}
            className="flex h-14 items-center justify-center overflow-hidden rounded-md border border-line bg-[#0b0b0d] px-2 hover:border-accent"
            title={p.name}
          >
            <span
              style={{
                fontFamily: p.style.fontFamily ?? "Segoe UI",
                fontWeight: p.style.fontWeight,
                color: p.style.color ?? "#fff",
                background: p.style.background ?? undefined,
                padding: p.style.background ? "2px 8px" : 0,
                borderRadius: p.style.borderRadius ? 8 : 0,
                fontSize: 17,
                textTransform: p.style.uppercase ? "uppercase" : undefined,
                WebkitTextStroke: p.style.strokeWidth ? `1px ${p.style.strokeColor}` : undefined,
              }}
            >
              {p.name}
            </span>
          </button>
        ))}
        {saved.length > 0 && <p className="mt-2 text-[11px] font-semibold text-muted uppercase">Meus estilos</p>}
        {saved.map((s) => (
          <Button key={s.id} onClick={() => useEditor.getState().addText(s.name, s.data as TextStyle)}>
            {s.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

const SWATCHES = ["#000000", "#ffffff", "#8b5cf6", "#ec4899", "#f97316", "#facc15", "#22c55e", "#0ea5e9", "#1e293b"];

function ElementsPanel() {
  const [color, setColor] = useState("#8b5cf6");
  const s = useEditor.getState;
  return (
    <div>
      <PanelTitle hint="Formas e fundos vetoriais. Cor escolhida abaixo.">Elementos</PanelTitle>
      <div className="flex flex-wrap items-center gap-1.5 px-3">
        {SWATCHES.map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`} className={cn("h-6 w-6 rounded border", color === c ? "border-white ring-1 ring-white" : "border-line")} style={{ background: c }} />
        ))}
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Cor personalizada" />
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <ElementBtn label="Cor sólida (fundo)" onClick={() => s().addShape("rect", color, true)}>
          <div className="h-8 w-12 rounded-sm" style={{ background: color }} />
        </ElementBtn>
        <ElementBtn label="Retângulo" onClick={() => s().addShape("rect", color)}>
          <div className="h-6 w-10 rounded" style={{ background: color }} />
        </ElementBtn>
        <ElementBtn label="Círculo" onClick={() => s().addShape("ellipse", color)}>
          <div className="h-8 w-8 rounded-full" style={{ background: color }} />
        </ElementBtn>
        <ElementBtn
          label="Faixa inferior"
          onClick={() => {
            s().addShape("rect", color);
            const p = s().project!;
            const id = s().selection[0];
            s().updateClip(id, (c) => {
              c.name = "Faixa inferior";
              const h = Math.round(p.height * 0.1);
              Object.assign(c.transform, { x: 0, width: p.width, height: h, y: Math.round(p.height * 0.72) });
              if (c.type === "shape") c.radius = 0;
            });
          }}
        >
          <div className="flex h-8 w-12 items-end">
            <div className="h-2 w-full" style={{ background: color }} />
          </div>
        </ElementBtn>
      </div>
    </div>
  );
}

function ElementBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-md border border-line bg-panel-2 p-3 text-[11px] text-muted hover:border-accent hover:text-fg">
      {children}
      {label}
    </button>
  );
}

function TransitionsPanel() {
  const selection = useEditor((s) => s.selection);
  const fps = useEditor((s) => s.project!.fps);
  const [which, setWhich] = useState<"transitionIn" | "transitionOut">("transitionIn");
  const apply = (type: TransitionType | null) => {
    if (!selection.length) return toast.info("Selecione um ou mais clipes na timeline primeiro.");
    useEditor.getState().edit((d) => {
      for (const t of d.tracks)
        for (const c of t.clips) if (selection.includes(c.id) && c.type !== "audio") c[which] = type ? { type, duration: Math.min(c.duration, Math.round(fps * 0.5)) } : null;
    });
  };
  return (
    <div>
      <PanelTitle hint="Aplica nos clipes selecionados. A duração é ajustável no painel de propriedades.">Transições</PanelTitle>
      <div className="mx-3 mb-2 flex rounded-md bg-bg p-0.5">
        {(["transitionIn", "transitionOut"] as const).map((w) => (
          <button key={w} onClick={() => setWhich(w)} className={cn("flex-1 rounded py-1 text-[12px]", which === w ? "bg-panel-3 text-fg" : "text-muted")}>
            {w === "transitionIn" ? "Entrada" : "Saída"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((t) => (
          <button key={t} onClick={() => apply(t)} className="flex items-center gap-2 rounded-md border border-line bg-panel-2 px-2 py-2 text-left text-[12px] hover:border-accent">
            <Sparkles size={13} className="shrink-0 text-accent" />
            {TRANSITION_LABELS[t]}
          </button>
        ))}
        <button onClick={() => apply(null)} className="col-span-2 rounded-md border border-line px-2 py-1.5 text-[12px] text-muted hover:text-fg">
          Remover transição
        </button>
      </div>
    </div>
  );
}

function EffectsPanel() {
  const selection = useEditor((s) => s.selection);
  return (
    <div>
      <PanelTitle hint="Looks de cor aplicados aos clipes selecionados. Ajuste fino no painel de propriedades.">Efeitos de cor</PanelTitle>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        {FILTER_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => (selection.length ? selection.forEach((id) => applyFilterPreset(id, p.f)) : toast.info("Selecione um clipe primeiro."))}
            className="overflow-hidden rounded-md border border-line bg-panel-2 text-[12px] hover:border-accent"
          >
            <div
              className="h-12 w-full"
              style={{
                background: "linear-gradient(135deg,#f59e0b,#ec4899 45%,#3b82f6)",
                filter: `brightness(${p.f.brightness ?? 1}) contrast(${p.f.contrast ?? 1}) saturate(${p.f.saturation ?? 1}) hue-rotate(${p.f.hue ?? 0}deg) grayscale(${p.f.grayscale ?? 0}) sepia(${p.f.sepia ?? 0})`,
              }}
            />
            <div className="py-1">{p.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StylesPanel() {
  const styles = useQuery({ queryKey: ["styles"], queryFn: api.styles });
  const selection = useEditor((s) => s.selection);
  const list = styles.data ?? [];
  const applyLook = (data: LookData) => {
    if (!selection.length) return toast.info("Selecione um clipe primeiro.");
    useEditor.getState().edit((d) => {
      for (const t of d.tracks)
        for (const c of t.clips)
          if (selection.includes(c.id)) {
            c.filters = { ...data.filters };
            if (c.type !== "audio") {
              c.transitionIn = data.transitionIn ? { ...data.transitionIn } : null;
              c.transitionOut = data.transitionOut ? { ...data.transitionOut } : null;
            }
          }
    });
  };
  const applyText = (style: TextStyle) => {
    const p = useEditor.getState().project!;
    const sel = p.tracks.flatMap((t) => t.clips).filter((c) => selection.includes(c.id) && c.type === "text");
    if (!sel.length) return useEditor.getState().addText(undefined, style);
    useEditor.getState().edit((d) => {
      for (const t of d.tracks) for (const c of t.clips) if (selection.includes(c.id) && c.type === "text") c.style = { ...style };
    });
  };
  return (
    <div>
      <PanelTitle hint="Estilos salvos são reaproveitados em qualquer projeto, sem reconfigurar.">Estilos salvos</PanelTitle>
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        {list.length === 0 && <p className="text-[12px] text-muted">Salve um estilo de texto ou um look pelo painel de propriedades de um clipe.</p>}
        {list.map((s) => (
          <button
            key={s.id}
            onClick={() => (s.kind === "text" ? applyText(s.data as TextStyle) : applyLook(s.data as LookData))}
            className="flex items-center gap-2 rounded-md border border-line bg-panel-2 px-2.5 py-2 text-left text-[12px] hover:border-accent"
          >
            {s.kind === "text" ? <Type size={13} className="text-accent" /> : <Palette size={13} className="text-accent-2" />}
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-[10px] text-muted">{s.kind === "text" ? "texto" : "look"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MotionPanel() {
  return (
    <div>
      <PanelTitle hint="Animações escritas em código (Remotion). Clique para adicionar no cursor.">Animações</PanelTitle>
      <div className="flex flex-col gap-2 px-3">
        {Object.entries(CUSTOM_COMPONENTS).map(([id, def]) => (
          <button
            key={id}
            onClick={() => useEditor.getState().addComponent(id, def)}
            className="rounded-md border border-line bg-panel-2 px-3 py-2.5 text-left hover:border-accent"
          >
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <Clapperboard size={13} className="text-[var(--clip-component)]" />
              {def.label}
            </div>
            <p className="mt-0.5 text-[11px] text-muted">{def.description}</p>
          </button>
        ))}
      </div>
      <div className="m-3 rounded-md border border-accent/30 bg-accent/10 p-3 text-[11px] leading-relaxed">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-fg">
          <Bot size={13} className="text-accent" /> Crie a sua no Claude Code
        </div>
        <p className="text-muted">
          Peça, por exemplo: “crie uma animação de confete com as cores da marca e coloque no fim do vídeo”. O Claude escreve o componente, ele aparece
          nesta lista e a prévia atualiza sozinha.
        </p>
      </div>
    </div>
  );
}
