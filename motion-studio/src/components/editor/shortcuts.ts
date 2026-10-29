"use client";

import { useEffect } from "react";

export const SHORTCUT_ACTIONS = [
  { id: "playPause", label: "Reproduzir / pausar", combo: "Space" },
  { id: "split", label: "Dividir no cursor", combo: "S" },
  { id: "delete", label: "Excluir seleção", combo: "Delete" },
  { id: "rippleDelete", label: "Excluir e fechar lacuna", combo: "Shift+Delete" },
  { id: "undo", label: "Desfazer", combo: "Ctrl+Z" },
  { id: "redo", label: "Refazer", combo: "Ctrl+Shift+Z" },
  { id: "redoAlt", label: "Refazer (alternativo)", combo: "Ctrl+Y" },
  { id: "copy", label: "Copiar", combo: "Ctrl+C" },
  { id: "paste", label: "Colar no cursor", combo: "Ctrl+V" },
  { id: "duplicate", label: "Duplicar", combo: "Ctrl+D" },
  { id: "selectAll", label: "Selecionar tudo", combo: "Ctrl+A" },
  { id: "prevFrame", label: "Quadro anterior", combo: "ArrowLeft" },
  { id: "nextFrame", label: "Próximo quadro", combo: "ArrowRight" },
  { id: "back10", label: "Voltar 10 quadros", combo: "Shift+ArrowLeft" },
  { id: "fwd10", label: "Avançar 10 quadros", combo: "Shift+ArrowRight" },
  { id: "home", label: "Ir para o início", combo: "Home" },
  { id: "end", label: "Ir para o fim", combo: "End" },
  { id: "marker", label: "Adicionar marcador", combo: "M" },
  { id: "zoomIn", label: "Aumentar zoom da timeline", combo: "=" },
  { id: "zoomOut", label: "Diminuir zoom da timeline", combo: "-" },
  { id: "toolSelect", label: "Ferramenta seleção", combo: "V" },
  { id: "toolBlade", label: "Ferramenta lâmina", combo: "C" },
  { id: "addText", label: "Adicionar texto", combo: "T" },
  { id: "save", label: "Salvar", combo: "Ctrl+S" },
  { id: "export", label: "Exportar", combo: "Ctrl+E" },
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]["id"];

export function comboFromEvent(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  let key = e.key === " " ? "Space" : e.key;
  if (key.length === 1) key = key.toUpperCase();
  if (key === "+") key = "=";
  if (key === "_") key = "-";
  parts.push(key);
  return parts.join("+");
}

export function resolveKeymap(overrides: Record<string, string>): Record<string, ShortcutAction> {
  const map: Record<string, ShortcutAction> = {};
  for (const a of SHORTCUT_ACTIONS) map[overrides[a.id] ?? a.combo] = a.id;
  return map;
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return true;
  if (tag === "INPUT") {
    const type = (t as HTMLInputElement).type;
    return !["range", "checkbox", "radio", "button", "color"].includes(type);
  }
  return false;
}

export function useShortcuts(keymap: Record<string, string>, handlers: Partial<Record<ShortcutAction, () => void>>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const map = resolveKeymap(keymap);
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      const action = map[combo];
      const fn = action && handlers[action];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keymap, handlers, enabled]);
}
