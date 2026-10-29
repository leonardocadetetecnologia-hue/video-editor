"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { bytes, cn, relativeDate } from "@/lib/utils";
import { useEditor } from "@/store/editor";
import { Button, Dialog, Label, TextInput, Toggle } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { SHORTCUT_ACTIONS, comboFromEvent } from "./shortcuts";

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [capturing, setCapturing] = useState<string | null>(null);
  const keymap = settings.data?.keymap ?? {};

  useEffect(() => {
    if (!capturing) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setCapturing(null);
      const combo = comboFromEvent(e);
      if (!combo) return;
      const clash = SHORTCUT_ACTIONS.find((a) => a.id !== capturing && (keymap[a.id] ?? a.combo) === combo);
      if (clash) toast.info(`"${combo}" estava em "${clash.label}" — removido de lá.`);
      const next = { ...keymap, [capturing]: combo };
      if (clash) next[clash.id] = "";
      await api.updateSettings({ keymap: next });
      qc.invalidateQueries({ queryKey: ["settings"] });
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, keymap, qc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Atalhos de teclado" description="Clique em um atalho e pressione a nova combinação. Esc cancela." className="w-[min(560px,calc(100vw-32px))]">
      <div className="flex max-h-[60vh] flex-col overflow-y-auto">
        {SHORTCUT_ACTIONS.map((a) => {
          const combo = keymap[a.id] ?? a.combo;
          return (
            <div key={a.id} className="flex items-center justify-between border-b border-line py-1.5 text-[12px]">
              <span>{a.label}</span>
              <button
                onClick={() => setCapturing(a.id)}
                className={cn("min-w-28 rounded border px-2 py-0.5 font-mono text-[11px]", capturing === a.id ? "animate-pulse border-accent text-accent" : "border-line bg-panel-2")}
              >
                {capturing === a.id ? "pressione…" : combo || "—"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          variant="ghost"
          onClick={async () => {
            await api.updateSettings({ keymap: {} });
            qc.invalidateQueries({ queryKey: ["settings"] });
          }}
        >
          Restaurar padrões
        </Button>
      </div>
    </Dialog>
  );
}

export function StorageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings, enabled: open });
  const system = useQuery({ queryKey: ["system"], queryFn: api.system, enabled: open });
  const [mediaDraft, setMediaDir] = useState<string | null>(null);
  const [exportDraft, setExportDir] = useState<string | null>(null);
  const mediaDir = mediaDraft ?? settings.data?.mediaDir ?? "";
  const exportDir = exportDraft ?? settings.data?.exportDir ?? "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Armazenamento e desempenho" className="w-[min(620px,calc(100vw-32px))]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label>Pasta das mídias importadas</Label>
          <TextInput value={mediaDir} onChange={(e) => setMediaDir(e.target.value)} />
          <p className="text-[11px] text-muted">Novas importações vão para esta pasta. Mídias já importadas continuam onde estão.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Pasta das exportações</Label>
          <TextInput value={exportDir} onChange={(e) => setExportDir(e.target.value)} />
        </div>
        {settings.data && (
          <Toggle
            label="Usar proxies no preview (mais fluido com arquivos pesados)"
            checked={settings.data.useProxies}
            onChange={async (v) => {
              await api.updateSettings({ useProxies: v });
              qc.invalidateQueries({ queryKey: ["settings"] });
            }}
          />
        )}
        {system.data && (
          <div className="rounded-md border border-line bg-panel-2 p-2 font-mono text-[11px] text-muted">
            <div>{system.data.ffmpeg}</div>
            <div className="truncate">FFmpeg: {system.data.ffmpegPath}</div>
            <div>Dados: {system.data.dataDir}</div>
            <div>Node {system.data.node}</div>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={async () => {
              await api.updateSettings({ mediaDir: mediaDir.trim(), exportDir: exportDir.trim() });
              qc.invalidateQueries({ queryKey: ["settings"] });
              toast.ok("Configurações salvas");
              onOpenChange(false);
            }}
          >
            Salvar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function VersionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const project = useEditor((s) => s.project)!;
  const snaps = useQuery({ queryKey: ["snapshots", project.id], queryFn: () => api.snapshots(project.id), enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Versões anteriores" description="O app guarda automaticamente uma versão a cada 2 minutos de edição (até 30). Restaurar pode ser desfeito com Ctrl+Z.">
      <div className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto">
        {snaps.data?.length === 0 && <p className="text-[12px] text-muted">Nenhuma versão ainda.</p>}
        {snaps.data?.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-md border border-line bg-panel-2 px-3 py-2 text-[12px]">
            <span className="flex-1">
              {new Date(s.created_at).toLocaleString("pt-BR")} <span className="text-muted">· {relativeDate(s.created_at)} · {bytes(s.size)}</span>
            </span>
            <Button
              size="sm"
              onClick={async () => {
                const p = await api.snapshot(project.id, s.id);
                useEditor.getState().edit((d) => {
                  Object.assign(d, p);
                });
                toast.ok("Versão restaurada");
                onOpenChange(false);
              }}
            >
              Restaurar
            </Button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
