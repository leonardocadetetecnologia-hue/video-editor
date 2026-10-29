"use client";

import { create } from "zustand";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "ok" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

const useToasts = create<{ items: ToastItem[]; push: (kind: Kind, text: string) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-4), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === "error" ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  ok: (text: string) => useToasts.getState().push("ok", text),
  error: (text: string) => useToasts.getState().push("error", text),
  info: (text: string) => useToasts.getState().push("info", text),
};

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => {
        const Icon = t.kind === "ok" ? CheckCircle2 : t.kind === "error" ? AlertTriangle : Info;
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-lg border bg-panel-2 px-3 py-2.5 text-[13px] shadow-xl",
              t.kind === "error" ? "border-danger/50" : "border-line",
            )}
          >
            <Icon size={16} className={cn("mt-0.5 shrink-0", t.kind === "ok" ? "text-ok" : t.kind === "error" ? "text-danger" : "text-accent")} />
            <span className="flex-1 leading-snug">{t.text}</span>
            <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Fechar aviso">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
