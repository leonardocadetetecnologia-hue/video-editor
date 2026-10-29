"use client";

import { FONT_FAMILIES } from "@/lib/model/defaults";
import { FPS_OPTIONS } from "@/lib/model/formats";
import type { ExportCodec, ExportQuality, TextAnimation, TransitionType, VideoPreset } from "@/lib/model/types";
import { Label, NumberField, Select, TextInput } from "@/components/ui/primitives";
import { FormatPicker } from "./FormatPicker";
import { CODEC_LABELS, QUALITY_LABELS, TEXT_ANIMATION_LABELS, TRANSITION_LABELS } from "./labels";

/** Formulário do padrão de vídeo: tudo que não precisa ser perguntado de novo a cada projeto. */
export function PresetForm({ value, onChange }: { value: VideoPreset; onChange: (p: VideoPreset) => void }) {
  const set = <K extends keyof VideoPreset>(k: K, v: VideoPreset[K]) => onChange({ ...value, [k]: v });
  const ts = value.defaultTextStyle;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Nome do padrão</Label>
        <TextInput value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Reels da marca" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Formato mais usado</Label>
        <FormatPicker value={value.formatId} onChange={(id) => set("formatId", id)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Quadros/s</Label>
          <Select value={String(value.fps)} onChange={(v) => set("fps", Number(v))} options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} fps` }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Duração padrão</Label>
          <NumberField value={value.defaultClipSeconds} onChange={(v) => set("defaultClipSeconds", v)} min={0.5} max={60} step={0.5} precision={1} suffix="s" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Fundo</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={value.backgroundColor} onChange={(e) => set("backgroundColor", e.target.value)} aria-label="Cor de fundo" />
            <span className="font-mono text-[11px] text-muted">{value.backgroundColor}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Transição automática</Label>
          <Select
            value={value.defaultTransition?.type ?? "none"}
            onChange={(v) => set("defaultTransition", v === "none" ? null : { type: v as TransitionType, duration: Math.round(value.fps * 0.4) })}
            options={[{ value: "none", label: "Nenhuma (corte seco)" }, ...Object.entries(TRANSITION_LABELS).map(([k, l]) => ({ value: k, label: l }))]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Animação de texto</Label>
          <Select
            value={ts.animation}
            onChange={(v) => set("defaultTextStyle", { ...ts, animation: v as TextAnimation })}
            options={Object.entries(TEXT_ANIMATION_LABELS).map(([k, l]) => ({ value: k, label: l }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_90px_auto] items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Fonte dos textos</Label>
          <Select value={ts.fontFamily} onChange={(v) => set("defaultTextStyle", { ...ts, fontFamily: v })} options={FONT_FAMILIES.map((f) => ({ value: f, label: f }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tamanho</Label>
          <NumberField value={ts.fontSize} onChange={(v) => set("defaultTextStyle", { ...ts, fontSize: v })} min={12} max={400} suffix="px" />
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <input type="color" value={ts.color} onChange={(e) => set("defaultTextStyle", { ...ts, color: e.target.value })} aria-label="Cor do texto" />
          <input
            type="color"
            value={ts.background ?? "#000000"}
            onChange={(e) => set("defaultTextStyle", { ...ts, background: e.target.value })}
            aria-label="Cor da caixa do texto"
            title="Caixa atrás do texto"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Exportação</Label>
          <Select
            value={value.export.codec}
            onChange={(v) => set("export", { ...value.export, codec: v as ExportCodec })}
            options={Object.entries(CODEC_LABELS).map(([k, l]) => ({ value: k, label: l }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Qualidade</Label>
          <Select
            value={value.export.quality}
            onChange={(v) => set("export", { ...value.export, quality: v as ExportQuality })}
            options={Object.entries(QUALITY_LABELS).map(([k, l]) => ({ value: k, label: l }))}
          />
        </div>
      </div>
    </div>
  );
}
