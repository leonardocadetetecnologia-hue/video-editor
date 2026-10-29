"use client";

import { Dialog as RDialog } from "radix-ui";
import { X } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gradient";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "icon" }
>(({ className, variant = "secondary", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors select-none",
      "focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
      size === "sm" && "h-7 px-2.5 text-[12px]",
      size === "md" && "h-8 px-3 text-[13px]",
      size === "icon" && "h-7 w-7",
      variant === "primary" && "bg-accent text-white hover:bg-accent/85",
      variant === "gradient" && "ig-gradient text-white hover:brightness-110",
      variant === "secondary" && "border border-line bg-panel-3 text-fg hover:bg-[#2b303a]",
      variant === "ghost" && "text-muted hover:bg-panel-3 hover:text-fg",
      variant === "danger" && "bg-danger/90 text-white hover:bg-danger",
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={(o) => (dismissible || o ? onOpenChange(o) : undefined)}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />
        <RDialog.Content
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
            "rounded-xl border border-line bg-panel p-5 shadow-2xl focus:outline-none",
            className,
          )}
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <RDialog.Title className="text-[16px] font-semibold">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-[13px] text-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            {dismissible && (
              <RDialog.Close className="rounded p-1 text-muted hover:bg-panel-3 hover:text-fg" aria-label="Fechar">
                <X size={16} />
              </RDialog.Close>
            )}
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[11px] font-medium tracking-wide text-muted uppercase", className)}>{children}</span>;
}

export const inputClass =
  "h-7 w-full rounded-md border border-line bg-bg px-2 text-[12px] text-fg outline-none focus:border-accent/80 disabled:opacity-50";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "pr-1", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Campo numérico que aceita arrastar o rótulo horizontalmente para ajustar (estilo After Effects). */
export function NumberField({
  label,
  value,
  onChange,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
  precision = 0,
  className,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  precision?: number;
  className?: string;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const round = (v: number) => Number(v.toFixed(precision));
  const onLabelDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = value;
    const move = (ev: PointerEvent) => {
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      onChange(round(clamp(start + (ev.clientX - startX) * step * mult)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <label className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {label && (
        <span onPointerDown={onLabelDown} className="w-4 shrink-0 cursor-ew-resize text-[11px] text-muted select-none" title="Arraste para ajustar">
          {label}
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          inputMode="decimal"
          className={cn(inputClass, suffix && "pr-6")}
          value={draft ?? String(round(value))}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            if (draft !== null) {
              const v = Number(draft.replace(",", "."));
              if (!Number.isNaN(v)) {
                onChange(round(clamp(v)));
                onCommit?.();
              }
            }
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              onChange(round(clamp(value + d)));
              setDraft(null);
              onCommit?.();
            }
          }}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[10px] text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  onCommit,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="grid grid-cols-[84px_1fr_44px] items-center gap-2">
      <span className="truncate text-[12px] text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="h-1 w-full"
      />
      <span className="text-right font-mono text-[11px] text-muted">{format ? format(value) : value}</span>
    </label>
  );
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
        {actions}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px]">
      <span className="text-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-accent" : "bg-panel-3 border border-line")}
      >
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", checked ? "left-3.5" : "left-0.5")} />
      </button>
    </label>
  );
}
