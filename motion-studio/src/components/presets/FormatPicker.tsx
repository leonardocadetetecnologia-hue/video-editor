"use client";

import { Film, Grid3x3, MonitorPlay, Smartphone } from "lucide-react";
import { FORMAT_GROUPS, formatsInGroup, getFormat } from "@/lib/model/formats";
import type { FormatGroup, FormatId } from "@/lib/model/types";
import { cn } from "@/lib/utils";

const GROUP_ICON: Record<FormatGroup, React.ElementType> = {
  story: Smartphone,
  reels: Film,
  feed: Grid3x3,
  outros: MonitorPlay,
};

const GROUP_DEFAULT: Record<FormatGroup, FormatId> = {
  story: "ig-story",
  reels: "ig-reels",
  feed: "ig-feed-portrait",
  outros: "fhd-1080",
};

function RatioBox({ w, h, active }: { w: number; h: number; active: boolean }) {
  const max = 34;
  const s = max / Math.max(w, h);
  return (
    <div className="flex h-9 w-9 items-center justify-center">
      <div
        className={cn("rounded-[3px] border-2", active ? "border-white bg-white/15" : "border-muted/70")}
        style={{ width: Math.round(w * s), height: Math.round(h * s) }}
      />
    </div>
  );
}

/** Seleção de formato de destino. Story, Feed e Reels aparecem primeiro, sempre. */
export function FormatPicker({ value, onChange, compact = false }: { value: FormatId | null; onChange: (id: FormatId) => void; compact?: boolean }) {
  const current = value ? getFormat(value) : null;
  const group = current?.group ?? null;
  const variants = group ? formatsInGroup(group) : [];
  return (
    <div className="flex flex-col gap-3">
      <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}>
        {FORMAT_GROUPS.map((g) => {
          const Icon = GROUP_ICON[g.id];
          const active = group === g.id;
          const sample = getFormat(GROUP_DEFAULT[g.id]);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onChange(active && value ? value : GROUP_DEFAULT[g.id])}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                active ? "ig-gradient border-transparent text-white shadow-lg" : "border-line bg-panel-2 hover:border-muted/60",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon size={16} />
                <span className="text-[14px] font-semibold">{g.label}</span>
              </div>
              {!compact && <RatioBox w={sample.width} h={sample.height} active={active} />}
              {!compact && <span className={cn("text-[11px] leading-tight", active ? "text-white/85" : "text-muted")}>{g.hint}</span>}
            </button>
          );
        })}
      </div>
      {variants.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {variants.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(f.id)}
              aria-pressed={value === f.id}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]",
                value === f.id ? "border-accent bg-accent/15 text-fg" : "border-line bg-panel-2 text-muted hover:text-fg",
              )}
            >
              <span className="font-semibold">{f.ratio}</span>
              <span>{f.label}</span>
              <span className="font-mono text-[11px] opacity-70">
                {f.width}×{f.height}
              </span>
            </button>
          ))}
        </div>
      )}
      {current && <p className="text-[12px] text-muted">{current.description}</p>}
    </div>
  );
}
