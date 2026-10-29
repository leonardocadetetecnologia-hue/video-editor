"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlignCenter, AlignLeft, AlignRight, Diamond, Maximize, Crosshair, RotateCcw, Save, Trash2, Bold, Italic, CaseUpper } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getAnimatedState } from "@/lib/model/animation";
import { DEFAULT_FILTERS, FONT_FAMILIES, uid } from "@/lib/model/defaults";
import { FPS_OPTIONS, getFormat } from "@/lib/model/formats";
import { findClip, removeKeyframe, setKeyframe, setSpeed, slipClip, trimClip } from "@/lib/model/ops";
import type { AnimProp, Clip, ComponentClip, Easing, Filters, LookData, MediaClip, ShapeClip, TextClip, TextStyle, Transition, TransitionType, VideoPreset } from "@/lib/model/types";
import { cn, timecode } from "@/lib/utils";
import { seek, srcFramesFor, useEditor, useSelectedClip } from "@/store/editor";
import { Button, Label, NumberField, Section, Select, SliderField, TextInput, Toggle } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { FormatPicker } from "@/components/presets/FormatPicker";
import { CUSTOM_COMPONENTS } from "@/remotion/custom/registry";
import { AiSection } from "./AiSection";
import { TEXT_ANIMATION_LABELS, TRANSITION_LABELS } from "@/components/presets/labels";
import type { FormatId } from "@/lib/model/types";

// Edições "ao vivo" (arrastar slider, escolher cor) viram UMA entrada de histórico:
// o gesto começa na primeira alteração e é confirmado após uma pausa.
let commitTimer: ReturnType<typeof setTimeout> | null = null;
function liveEdit(fn: (c: Clip) => void, id: string) {
  const s = useEditor.getState();
  if (!s.gestureBase) s.beginGesture();
  s.updateClip(id, fn, { record: false });
  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = setTimeout(() => useEditor.getState().endGesture(), 600);
}

export function PropertiesPanel() {
  const sel = useSelectedClip();
  const multi = useEditor((s) => s.selection.length > 1);
  if (multi) return <div className="p-4 text-[12px] text-muted">{useEditor.getState().selection.length} clipes selecionados. Use Delete, Ctrl+D ou arraste-os juntos na timeline.</div>;
  if (!sel) return <ProjectProperties />;
  return <ClipProperties key={sel.clip.id} clip={sel.clip} locked={sel.track.locked} />;
}

function ProjectProperties() {
  const project = useEditor((s) => s.project)!;
  const edit = useEditor((s) => s.edit);
  const qc = useQueryClient();
  const [pending, setTarget] = useState<FormatId | null>(null);
  const target = pending ?? project.formatId;

  const saveAsPreset = async () => {
    const name = prompt("Nome do novo padrão:", `${project.name} (padrão)`);
    if (!name) return;
    const preset: VideoPreset = {
      id: uid("pre_"),
      name,
      formatId: project.formatId,
      fps: project.fps,
      backgroundColor: project.backgroundColor,
      defaultClipSeconds: project.settings.defaultClipSeconds,
      defaultTransition: project.settings.defaultTransition,
      defaultTextStyle: project.settings.defaultTextStyle,
      export: { codec: "h264", quality: "alta", audioBitrate: "192k" },
    };
    await api.savePreset(preset, confirm("Usar este padrão nos próximos projetos?"));
    qc.invalidateQueries({ queryKey: ["presets"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast.ok(`Padrão "${name}" salvo`);
  };

  return (
    <div>
      <Section title="Projeto">
        <TextInput value={project.name} onChange={(e) => edit((d) => void (d.name = e.target.value), { record: false })} aria-label="Nome do projeto" />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label>Quadros/s</Label>
            <Select value={String(project.fps)} onChange={(v) => edit((d) => void (d.fps = Number(v)))} options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} fps` }))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Fundo</Label>
            <input type="color" value={project.backgroundColor} onChange={(e) => edit((d) => void (d.backgroundColor = e.target.value), { record: false })} aria-label="Cor de fundo" />
          </div>
        </div>
      </Section>
      <Section title="Formato (Story / Feed / Reels)">
        <div className="[&>div>div:first-child]:grid-cols-2">
          <FormatPicker value={target} onChange={setTarget} compact />
        </div>
        {target !== project.formatId && (
          <Button
            variant="primary"
            onClick={() => {
              useEditor.getState().reformat(target);
              setTarget(null);
              toast.ok(`Projeto convertido para ${getFormat(target).label} ${getFormat(target).ratio}`);
            }}
          >
            Converter para {getFormat(target).label} {getFormat(target).ratio}
          </Button>
        )}
        <p className="text-[11px] text-muted">Converter reposiciona e redimensiona os elementos para o novo quadro. Dá para desfazer com Ctrl+Z.</p>
      </Section>
      <Section title="Padrões">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label>Duração de imagens/textos</Label>
            <NumberField value={project.settings.defaultClipSeconds} onChange={(v) => edit((d) => void (d.settings.defaultClipSeconds = v))} min={0.5} max={120} step={0.5} precision={1} suffix="s" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Transição automática</Label>
            <Select
              value={project.settings.defaultTransition?.type ?? "none"}
              onChange={(v) => edit((d) => void (d.settings.defaultTransition = v === "none" ? null : { type: v as TransitionType, duration: Math.round(d.fps * 0.4) }))}
              options={[{ value: "none", label: "Nenhuma" }, ...Object.entries(TRANSITION_LABELS).map(([k, l]) => ({ value: k, label: l }))]}
            />
          </div>
        </div>
        <Button onClick={saveAsPreset}>
          <Save size={13} /> Salvar configurações como padrão
        </Button>
      </Section>
      <p className="p-3 text-[12px] text-muted">Selecione um clipe na timeline ou no preview para editar suas propriedades.</p>
    </div>
  );
}

const PROP_META: Record<AnimProp, { label: string; step: number; precision: number; suffix?: string; min?: number; max?: number; display?: (v: number) => number; parse?: (v: number) => number }> = {
  x: { label: "X", step: 1, precision: 0, suffix: "px" },
  y: { label: "Y", step: 1, precision: 0, suffix: "px" },
  scale: { label: "Escala", step: 1, precision: 0, suffix: "%", min: 1, display: (v) => v * 100, parse: (v) => v / 100 },
  rotation: { label: "Rotação", step: 1, precision: 1, suffix: "°" },
  opacity: { label: "Opacidade", step: 1, precision: 0, suffix: "%", min: 0, max: 100, display: (v) => v * 100, parse: (v) => v / 100 },
};

function ClipProperties({ clip, locked }: { clip: Clip; locked: boolean }) {
  const frame = useEditor((s) => s.frame);
  const fps = useEditor((s) => s.project!.fps);
  const project = useEditor((s) => s.project)!;
  const local = Math.min(Math.max(0, frame - clip.start), clip.duration - 1);
  const anim = getAnimatedState(clip, local);
  const set = (fn: (c: Clip) => void) => liveEdit(fn, clip.id);

  const setAnimProp = (prop: AnimProp, v: number) =>
    set((c) => {
      if (c.keyframes[prop]?.length) setKeyframe(c, prop, local, v);
      else if (prop === "opacity") c.opacity = v;
      else c.transform[prop] = v;
    });

  const toggleKey = (prop: AnimProp) =>
    useEditor.getState().updateClip(clip.id, (c) => {
      const has = c.keyframes[prop]?.some((k) => k.frame === local);
      if (has) removeKeyframe(c, prop, local);
      else setKeyframe(c, prop, local, anim[prop]);
    });

  return (
    <div className={cn(locked && "pointer-events-none opacity-60")}>
      {locked && <p className="pointer-events-auto bg-yellow-500/10 px-3 py-2 text-[12px] text-yellow-300">Faixa bloqueada — desbloqueie para editar.</p>}
      <Section title={clip.type === "text" ? "Texto" : clip.type === "component" ? "Animação" : clip.type === "shape" ? "Forma" : clip.type === "image" ? "Imagem" : clip.type === "audio" ? "Áudio" : "Vídeo"}>
        <TextInput value={clip.name} onChange={(e) => set((c) => void (c.name = e.target.value))} aria-label="Nome do clipe" />
        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
          <span>Início {timecode(clip.start, fps)}</span>
          <span>Duração {timecode(clip.duration, fps)}</span>
        </div>
        <NumberField
          label="⏱"
          value={clip.duration / fps}
          step={0.1}
          precision={2}
          min={1 / fps}
          suffix="s"
          onChange={(v) => {
            const s = useEditor.getState();
            s.edit((d) => {
              const c = findClip(d, clip.id)!.clip;
              trimClip(d, clip.id, "end", c.start + Math.round(v * fps), srcFramesFor(s.assets, fps));
            });
          }}
        />
      </Section>

      {clip.type !== "audio" && (
        <Section
          title="Transformação"
          actions={
            <div className="flex gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                title="Centralizar"
                onClick={() =>
                  useEditor.getState().updateClip(clip.id, (c) => {
                    c.transform.x = Math.round((project.width - c.transform.width) / 2);
                    c.transform.y = Math.round((project.height - c.transform.height) / 2);
                    delete c.keyframes.x;
                    delete c.keyframes.y;
                  })
                }
              >
                <Crosshair size={13} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Preencher a tela"
                onClick={() =>
                  useEditor.getState().updateClip(clip.id, (c) => {
                    Object.assign(c.transform, { x: 0, y: 0, width: project.width, height: project.height, scale: 1, rotation: 0 });
                    delete c.keyframes.x;
                    delete c.keyframes.y;
                    delete c.keyframes.scale;
                    delete c.keyframes.rotation;
                  })
                }
              >
                <Maximize size={13} />
              </Button>
            </div>
          }
        >
          {(["x", "y", "scale", "rotation", "opacity"] as AnimProp[]).map((prop) => {
            const m = PROP_META[prop];
            const kfs = clip.keyframes[prop] ?? [];
            const onKey = kfs.some((k) => k.frame === local);
            const v = anim[prop];
            return (
              <div key={prop} className="grid grid-cols-[70px_1fr_22px] items-center gap-2">
                <span className="text-[12px] text-muted">{m.label}</span>
                <NumberField
                  value={m.display ? m.display(v) : v}
                  onChange={(nv) => setAnimProp(prop, m.parse ? m.parse(nv) : nv)}
                  step={m.step}
                  precision={m.precision}
                  suffix={m.suffix}
                  min={m.min}
                  max={m.max}
                />
                <button
                  onClick={() => toggleKey(prop)}
                  title={onKey ? "Remover keyframe neste quadro" : "Adicionar keyframe neste quadro"}
                  aria-label={`Keyframe de ${m.label}`}
                  className={cn("flex h-5 w-5 items-center justify-center rounded", kfs.length ? "text-yellow-300" : "text-muted hover:text-fg")}
                >
                  <Diamond size={12} fill={onKey ? "currentColor" : "none"} />
                </button>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="L" value={clip.transform.width} onChange={(v) => set((c) => void (c.transform.width = Math.max(1, v)))} suffix="px" />
            <NumberField label="A" value={clip.transform.height} onChange={(v) => set((c) => void (c.transform.height = Math.max(1, v)))} suffix="px" />
          </div>
          {(clip.type === "video" || clip.type === "image") && (
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-muted">Ajuste</span>
              <Select
                value={clip.fit}
                onChange={(v) => set((c) => void ((c as MediaClip).fit = v as MediaClip["fit"]))}
                options={[
                  { value: "contain", label: "Conter (sem cortes)" },
                  { value: "cover", label: "Preencher (corta bordas)" },
                  { value: "fill", label: "Esticar" },
                ]}
              />
            </div>
          )}
          <KeyframeList clip={clip} />
        </Section>
      )}

      {clip.type === "text" && <TextSection clip={clip} />}
      {clip.type === "shape" && <ShapeSection clip={clip} />}
      {clip.type === "component" && <ComponentSection clip={clip} />}
      {(clip.type === "video" || clip.type === "audio") && <AiSection clip={clip} />}
      {(clip.type === "video" || clip.type === "audio") && <MediaSection clip={clip} />}
      {clip.type !== "audio" && <EffectsSection clip={clip} />}
      {clip.type !== "audio" && <TransitionsSection clip={clip} />}
    </div>
  );
}

function KeyframeList({ clip }: { clip: Clip }) {
  const fps = useEditor((s) => s.project!.fps);
  const entries = (Object.entries(clip.keyframes) as [AnimProp, { frame: number; value: number; easing: Easing }[]][]).filter(([, k]) => k?.length);
  if (!entries.length) return <p className="text-[11px] text-muted">Clique no ◇ ao lado de uma propriedade para animá-la com keyframes.</p>;
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-md border border-line bg-bg/50 p-2">
      <Label>Keyframes</Label>
      {entries.map(([prop, kfs]) =>
        kfs.map((k) => (
          <div key={`${prop}${k.frame}`} className="grid grid-cols-[60px_64px_1fr_20px] items-center gap-1.5 text-[11px]">
            <span className="text-muted">{PROP_META[prop].label}</span>
            <button className="text-left font-mono hover:text-accent" onClick={() => seek(clip.start + k.frame)}>
              {timecode(k.frame, fps)}
            </button>
            <select
              className="h-6 rounded border border-line bg-bg px-1 text-[11px]"
              value={k.easing}
              aria-label="Suavização"
              onChange={(e) =>
                useEditor.getState().updateClip(clip.id, (c) => {
                  const x = c.keyframes[prop]!.find((q) => q.frame === k.frame);
                  if (x) x.easing = e.target.value as Easing;
                })
              }
            >
              <option value="linear">Linear</option>
              <option value="ease-in">Acelerar</option>
              <option value="ease-out">Desacelerar</option>
              <option value="ease-in-out">Suave</option>
            </select>
            <button aria-label="Remover keyframe" className="text-muted hover:text-danger" onClick={() => useEditor.getState().updateClip(clip.id, (c) => removeKeyframe(c, prop, k.frame))}>
              <Trash2 size={11} />
            </button>
          </div>
        )),
      )}
    </div>
  );
}

function TextSection({ clip }: { clip: TextClip }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();
  const styles = useQuery({ queryKey: ["styles"], queryFn: api.styles });
  useEffect(() => {
    const focus = () => ref.current?.focus();
    window.addEventListener("ms:focus-text", focus);
    return () => window.removeEventListener("ms:focus-text", focus);
  }, []);
  const st = clip.style;
  const setStyle = (patch: Partial<TextStyle>) => liveEdit((c) => Object.assign((c as TextClip).style, patch), clip.id);
  const textStyles = (styles.data ?? []).filter((s) => s.kind === "text");

  return (
    <Section title="Conteúdo e estilo do texto">
      <textarea
        ref={ref}
        value={clip.text}
        onChange={(e) => liveEdit((c) => void ((c as TextClip).text = e.target.value), clip.id)}
        rows={3}
        className="w-full resize-y rounded-md border border-line bg-bg p-2 text-[13px] outline-none focus:border-accent"
        aria-label="Texto"
      />
      {textStyles.length > 0 && (
        <Select
          ariaLabel="Aplicar estilo salvo"
          value=""
          onChange={(id) => {
            const s = textStyles.find((x) => x.id === id);
            if (s) useEditor.getState().updateClip(clip.id, (c) => void ((c as TextClip).style = { ...(s.data as TextStyle) }));
          }}
          options={[{ value: "", label: "Aplicar estilo salvo…" }, ...textStyles.map((s) => ({ value: s.id, label: s.name }))]}
        />
      )}
      <div className="grid grid-cols-[1fr_76px] gap-2">
        <Select value={st.fontFamily} onChange={(v) => setStyle({ fontFamily: v })} options={FONT_FAMILIES.map((f) => ({ value: f, label: f }))} ariaLabel="Fonte" />
        <NumberField value={st.fontSize} onChange={(v) => setStyle({ fontSize: Math.max(4, v) })} suffix="px" />
      </div>
      <div className="flex items-center gap-1">
        <IconToggle on={st.fontWeight >= 700} onClick={() => setStyle({ fontWeight: st.fontWeight >= 700 ? 400 : 800 })} label="Negrito">
          <Bold size={13} />
        </IconToggle>
        <IconToggle on={st.italic} onClick={() => setStyle({ italic: !st.italic })} label="Itálico">
          <Italic size={13} />
        </IconToggle>
        <IconToggle on={st.uppercase} onClick={() => setStyle({ uppercase: !st.uppercase })} label="Maiúsculas">
          <CaseUpper size={13} />
        </IconToggle>
        <div className="mx-1 h-4 w-px bg-line" />
        {(["left", "center", "right"] as const).map((a) => (
          <IconToggle key={a} on={st.align === a} onClick={() => setStyle({ align: a })} label={`Alinhar ${a}`}>
            {a === "left" ? <AlignLeft size={13} /> : a === "center" ? <AlignCenter size={13} /> : <AlignRight size={13} />}
          </IconToggle>
        ))}
        <div className="flex-1" />
        <input type="color" value={st.color} onChange={(e) => setStyle({ color: e.target.value })} aria-label="Cor do texto" title="Cor do texto" />
      </div>
      <SliderField label="Entrelinha" value={st.lineHeight} min={0.7} max={2.5} step={0.05} onChange={(v) => setStyle({ lineHeight: v })} format={(v) => v.toFixed(2)} />
      <SliderField label="Espaçamento" value={st.letterSpacing} min={-10} max={40} step={0.5} onChange={(v) => setStyle({ letterSpacing: v })} />
      <div className="flex items-center justify-between gap-2">
        <Toggle label="Caixa de fundo" checked={st.background !== null} onChange={(v) => setStyle({ background: v ? "#000000" : null })} />
        {st.background !== null && <input type="color" value={st.background} onChange={(e) => setStyle({ background: e.target.value })} aria-label="Cor da caixa" />}
      </div>
      {st.background !== null && (
        <>
          <SliderField label="Margem" value={st.padding} min={0} max={120} step={1} onChange={(v) => setStyle({ padding: v })} />
          <SliderField label="Arredondar" value={st.borderRadius} min={0} max={120} step={1} onChange={(v) => setStyle({ borderRadius: v })} />
        </>
      )}
      <div className="flex items-center gap-2">
        <span className="w-[84px] text-[12px] text-muted">Contorno</span>
        <input type="range" min={0} max={20} step={0.5} value={st.strokeWidth} onChange={(e) => setStyle({ strokeWidth: Number(e.target.value) })} className="flex-1" aria-label="Espessura do contorno" />
        <input type="color" value={st.strokeColor} onChange={(e) => setStyle({ strokeColor: e.target.value })} aria-label="Cor do contorno" />
      </div>
      <Toggle label="Sombra" checked={st.shadow} onChange={(v) => setStyle({ shadow: v })} />
      <div className="grid grid-cols-[84px_1fr] items-center gap-2">
        <span className="text-[12px] text-muted">Animação</span>
        <Select value={st.animation} onChange={(v) => setStyle({ animation: v as TextStyle["animation"] })} options={Object.entries(TEXT_ANIMATION_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
      </div>
      <Button
        size="sm"
        onClick={async () => {
          const name = prompt("Nome do estilo de texto:", "Meu estilo");
          if (!name) return;
          await api.saveStyle({ id: uid("sty_"), kind: "text", name, data: st });
          qc.invalidateQueries({ queryKey: ["styles"] });
          toast.ok(`Estilo "${name}" salvo — reutilize na aba Estilos ou neste painel.`);
        }}
      >
        <Save size={13} /> Salvar estilo de texto
      </Button>
    </Section>
  );
}

function IconToggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button title={label} aria-label={label} aria-pressed={on} onClick={onClick} className={cn("flex h-6 w-6 items-center justify-center rounded", on ? "bg-accent/25 text-accent" : "text-muted hover:bg-panel-3")}>
      {children}
    </button>
  );
}

function ComponentSection({ clip }: { clip: ComponentClip }) {
  const def = CUSTOM_COMPONENTS[clip.componentId];
  if (!def) {
    return (
      <Section title="Animação">
        <p className="text-[12px] text-danger">Animação “{clip.componentId}” não encontrada no registro.</p>
      </Section>
    );
  }
  const props = { ...def.defaultProps, ...clip.props };
  const setProp = (k: string, v: unknown) => liveEdit((c) => void ((c as ComponentClip).props = { ...(c as ComponentClip).props, [k]: v }), clip.id);
  return (
    <Section title={def.label}>
      <p className="text-[11px] text-muted">{def.description}</p>
      {Object.entries(def.propSpecs).map(([k, spec]) => {
        const v = props[k];
        return (
          <div key={k} className="grid grid-cols-[96px_1fr] items-center gap-2">
            <span className="truncate text-[12px] text-muted">{spec.label}</span>
            {spec.kind === "number" ? (
              <NumberField value={Number(v ?? 0)} onChange={(nv) => setProp(k, nv)} min={spec.min} max={spec.max} step={spec.step ?? 1} precision={spec.step && spec.step < 1 ? 2 : 0} />
            ) : spec.kind === "color" ? (
              <input type="color" value={String(v ?? "#ffffff").slice(0, 7)} onChange={(e) => setProp(k, e.target.value)} aria-label={spec.label} />
            ) : spec.kind === "boolean" ? (
              <Toggle label="" checked={Boolean(v)} onChange={(b) => setProp(k, b)} />
            ) : (
              <TextInput value={String(v ?? "")} onChange={(e) => setProp(k, e.target.value)} aria-label={spec.label} />
            )}
          </div>
        );
      })}
    </Section>
  );
}

function ShapeSection({ clip }: { clip: ShapeClip }) {
  const set = (fn: (c: ShapeClip) => void) => liveEdit((c) => fn(c as ShapeClip), clip.id);
  return (
    <Section title="Forma">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted">Preenchimento</span>
        <input type="color" value={clip.fill} onChange={(e) => set((c) => void (c.fill = e.target.value))} aria-label="Cor de preenchimento" />
      </div>
      {clip.shape === "rect" && <SliderField label="Arredondar" value={clip.radius} min={0} max={500} step={1} onChange={(v) => set((c) => void (c.radius = v))} />}
      <div className="flex items-center gap-2">
        <span className="w-[84px] text-[12px] text-muted">Borda</span>
        <input type="range" min={0} max={60} step={1} value={clip.strokeWidth} onChange={(e) => set((c) => void (c.strokeWidth = Number(e.target.value)))} className="flex-1" aria-label="Espessura da borda" />
        <input type="color" value={clip.strokeColor} onChange={(e) => set((c) => void (c.strokeColor = e.target.value))} aria-label="Cor da borda" />
      </div>
    </Section>
  );
}

function MediaSection({ clip }: { clip: MediaClip }) {
  const fps = useEditor((s) => s.project!.fps);
  const asset = useEditor((s) => s.assets[clip.assetId]);
  const [busy, setBusy] = useState(false);
  const set = (fn: (c: MediaClip) => void) => liveEdit((c) => fn(c as MediaClip), clip.id);
  return (
    <Section title="Mídia e áudio">
      {asset && (
        <p className="text-[11px] text-muted">
          {asset.width ? `${asset.width}×${asset.height} · ` : ""}
          {asset.fps ? `${asset.fps} fps · ` : ""}
          {asset.duration.toFixed(1)} s{asset.hasProxy ? " · proxy pronto" : ""}
        </p>
      )}
      {!clip.freeze && (
        <div className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-[12px] text-muted">Velocidade</span>
          <NumberField
            value={clip.speed}
            step={0.05}
            precision={2}
            min={0.1}
            max={16}
            suffix="x"
            onChange={(v) => useEditor.getState().edit((d) => setSpeed(d, clip.id, v, srcFramesFor(useEditor.getState().assets, d.fps)))}
          />
        </div>
      )}
      {!clip.freeze && (
        <div className="grid grid-cols-[84px_1fr] items-center gap-2" title="Desloca o trecho usado da mídia sem mover o clipe (slip). Também: Alt+arrastar na timeline.">
          <span className="text-[12px] text-muted">Início na mídia</span>
          <NumberField
            value={clip.trimStart / fps}
            step={0.04}
            precision={2}
            min={0}
            suffix="s"
            onChange={(v) => useEditor.getState().edit((d) => slipClip(d, clip.id, v * fps, srcFramesFor(useEditor.getState().assets, d.fps)))}
          />
        </div>
      )}
      {(clip.type === "audio" || !clip.videoMuted) && !clip.freeze && (
        <>
          <SliderField label="Volume" value={clip.volume} min={0} max={2} step={0.01} onChange={(v) => set((c) => void (c.volume = v))} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderField label="Fade in" value={clip.audioFadeIn / fps} min={0} max={Math.min(10, clip.duration / fps)} step={0.1} onChange={(v) => set((c) => void (c.audioFadeIn = Math.round(v * fps)))} format={(v) => `${v.toFixed(1)}s`} />
          <SliderField label="Fade out" value={clip.audioFadeOut / fps} min={0} max={Math.min(10, clip.duration / fps)} step={0.1} onChange={(v) => set((c) => void (c.audioFadeOut = Math.round(v * fps)))} format={(v) => `${v.toFixed(1)}s`} />
        </>
      )}
      {clip.type === "video" && clip.videoMuted && (
        <Button size="sm" variant="ghost" onClick={() => useEditor.getState().updateClip(clip.id, (c) => void ((c as MediaClip).videoMuted = false))}>
          Reativar áudio do vídeo
        </Button>
      )}
      <div className="flex flex-wrap gap-1.5">
        {clip.type === "video" && (
          <>
            <Button size="sm" onClick={() => useEditor.getState().freezeFrame()}>
              Congelar quadro
            </Button>
            <Button size="sm" disabled={!asset?.hasAudio || clip.videoMuted} onClick={() => useEditor.getState().detachAudio()}>
              Separar áudio
            </Button>
            <Button
              size="sm"
              disabled={busy || !asset}
              title="Gera uma cópia leve (720p) para o preview fluir. A exportação sempre usa o original."
              onClick={async () => {
                setBusy(true);
                toast.info("Gerando proxy de preview…");
                try {
                  useEditor.getState().upsertAsset(await api.makeProxy(clip.assetId));
                  toast.ok("Proxy pronto: o preview passa a usá-lo");
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {asset?.hasProxy ? "Regerar proxy" : "Gerar proxy"}
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}

export const FILTER_PRESETS: { name: string; f: Partial<Filters> }[] = [
  { name: "Original", f: {} },
  { name: "P&B", f: { grayscale: 1, contrast: 1.1 } },
  { name: "Sépia", f: { sepia: 0.8 } },
  { name: "Vintage", f: { sepia: 0.35, contrast: 0.9, saturation: 0.8, brightness: 1.05 } },
  { name: "Vívido", f: { saturation: 1.45, contrast: 1.12 } },
  { name: "Frio", f: { hue: 190, saturation: 0.9, sepia: 0.15 } },
  { name: "Drama", f: { contrast: 1.35, brightness: 0.92, saturation: 0.85 } },
  { name: "Suave", f: { contrast: 0.88, brightness: 1.08, saturation: 0.92 } },
];

export function applyFilterPreset(clipId: string, f: Partial<Filters>) {
  useEditor.getState().updateClip(clipId, (c) => void (c.filters = { ...DEFAULT_FILTERS, ...f }));
}

function EffectsSection({ clip }: { clip: Clip }) {
  const qc = useQueryClient();
  const f = clip.filters;
  const setF = (patch: Partial<Filters>) => liveEdit((c) => Object.assign(c.filters, patch), clip.id);
  return (
    <Section
      title="Cor e efeitos"
      actions={
        <Button size="icon" variant="ghost" title="Restaurar" onClick={() => applyFilterPreset(clip.id, {})}>
          <RotateCcw size={13} />
        </Button>
      }
    >
      <div className="flex flex-wrap gap-1">
        {FILTER_PRESETS.map((p) => (
          <button key={p.name} className="rounded border border-line bg-panel-2 px-2 py-0.5 text-[11px] hover:border-accent" onClick={() => applyFilterPreset(clip.id, p.f)}>
            {p.name}
          </button>
        ))}
      </div>
      <SliderField label="Brilho" value={f.brightness} min={0} max={2} step={0.01} onChange={(v) => setF({ brightness: v })} format={(v) => v.toFixed(2)} />
      <SliderField label="Contraste" value={f.contrast} min={0} max={2} step={0.01} onChange={(v) => setF({ contrast: v })} format={(v) => v.toFixed(2)} />
      <SliderField label="Saturação" value={f.saturation} min={0} max={3} step={0.01} onChange={(v) => setF({ saturation: v })} format={(v) => v.toFixed(2)} />
      <SliderField label="Matiz" value={f.hue} min={-180} max={180} step={1} onChange={(v) => setF({ hue: v })} format={(v) => `${v}°`} />
      <SliderField label="P&B" value={f.grayscale} min={0} max={1} step={0.01} onChange={(v) => setF({ grayscale: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <SliderField label="Sépia" value={f.sepia} min={0} max={1} step={0.01} onChange={(v) => setF({ sepia: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <SliderField label="Desfoque" value={f.blur} min={0} max={60} step={0.5} onChange={(v) => setF({ blur: v })} format={(v) => `${v}px`} />
      <Button
        size="sm"
        onClick={async () => {
          const name = prompt("Nome do look (cor + transições):", "Meu look");
          if (!name) return;
          const data: LookData = { filters: clip.filters, transitionIn: clip.transitionIn, transitionOut: clip.transitionOut };
          await api.saveStyle({ id: uid("sty_"), kind: "look", name, data });
          qc.invalidateQueries({ queryKey: ["styles"] });
          toast.ok(`Look "${name}" salvo`);
        }}
      >
        <Save size={13} /> Salvar look
      </Button>
    </Section>
  );
}

function TransitionsSection({ clip }: { clip: Clip }) {
  const fps = useEditor((s) => s.project!.fps);
  const row = (which: "transitionIn" | "transitionOut", label: string) => {
    const t: Transition | null = clip[which];
    return (
      <div className="grid grid-cols-[52px_1fr_70px] items-center gap-2">
        <span className="text-[12px] text-muted">{label}</span>
        <Select
          ariaLabel={`Transição de ${label}`}
          value={t?.type ?? "none"}
          onChange={(v) =>
            useEditor.getState().updateClip(clip.id, (c) => void (c[which] = v === "none" ? null : { type: v as TransitionType, duration: t?.duration ?? Math.round(fps * 0.5) }))
          }
          options={[{ value: "none", label: "Nenhuma" }, ...Object.entries(TRANSITION_LABELS).map(([k, l]) => ({ value: k, label: l }))]}
        />
        <NumberField
          value={(t?.duration ?? 0) / fps}
          step={0.05}
          precision={2}
          min={0.05}
          max={clip.duration / fps}
          suffix="s"
          onChange={(v) => t && liveEdit((c) => void (c[which] = { ...t, duration: Math.max(1, Math.round(v * fps)) }), clip.id)}
        />
      </div>
    );
  };
  return (
    <Section title="Transições">
      {row("transitionIn", "Entrada")}
      {row("transitionOut", "Saída")}
    </Section>
  );
}
