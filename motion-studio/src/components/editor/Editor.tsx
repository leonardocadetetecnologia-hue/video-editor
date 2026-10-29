"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menubar } from "radix-ui";
import { Check, ChevronRight, Clapperboard, Cloud, CloudOff, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { api } from "@/lib/api";
import { getFormat } from "@/lib/model/formats";
import { cn } from "@/lib/utils";
import { ownSave, playerRef, seek, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { NewProjectDialog, PresetsManagerDialog } from "@/components/presets/dialogs";
import { ExportDialog } from "./ExportDialog";
import { LeftPanel, useUploader } from "./LeftPanel";
import { Preview } from "./Preview";
import { PropertiesPanel } from "./PropertiesPanel";
import { ShortcutsDialog, StorageDialog, VersionsDialog } from "./SettingsDialogs";
import { Timeline, type TimelineTool } from "./Timeline";
import { VibeBadge, useVibeContext, useVibeSync } from "./vibe";
import { useShortcuts, type ShortcutAction, SHORTCUT_ACTIONS } from "./shortcuts";

const LAYOUT_IDS = ["ms-vertical", "ms-top"];

/** Layout dos painéis salvo no navegador; no servidor (SSR) não há localStorage. */
function layoutStorage(): Pick<Storage, "getItem" | "setItem"> {
  if (typeof window === "undefined") return { getItem: () => null, setItem: () => {} };
  return {
    getItem: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    setItem: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
  };
}

export function Editor({ projectId }: { projectId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const project = useEditor((s) => s.project);
  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: api.assets });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [tool, setTool] = useState<TimelineTool>("select");
  const [dialog, setDialog] = useState<null | "export" | "new" | "presets" | "shortcuts" | "storage" | "versions">(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasAssets = useEditor((s) => Object.keys(s.assets).length > 0);

  // Carrega do servidor sempre que o estado não tem este projeto: na abertura e também
  // quando um hot reload (ex.: nova animação criada pelo Claude) reinicia o estado.
  useEffect(() => {
    if (project && project.id === projectId) return;
    let cancelled = false;
    api
      .project(projectId)
      .then((r) => !cancelled && useEditor.getState().load(r.project, r.revision))
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [project, projectId]);
  useEffect(() => {
    // hasAssets nas dependências: repovoa a biblioteca se o estado for reiniciado
    if (assetsQ.data) useEditor.getState().setAssets(assetsQ.data);
  }, [assetsQ.data, hasAssets]);

  useAutosave(settingsQ.data?.autosaveSeconds ?? 2);
  const vibe = useVibeSync(projectId);
  useVibeContext(projectId);

  const vLayout = useDefaultLayout({ id: "ms-vertical", storage: layoutStorage() });
  const hLayout = useDefaultLayout({ id: "ms-top", storage: layoutStorage() });

  const save = useCallback(async () => {
    const p = useEditor.getState().project;
    if (!p) return;
    useEditor.getState().setSaving(true);
    try {
      ownSave.json = JSON.stringify(p);
      const r = await api.saveProject(p);
      useEditor.setState({ dirty: false });
      useEditor.getState().markSaved(r.savedAt, r.revision);
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      useEditor.getState().setSaving(false);
    }
  }, []);

  const handlers = useMemo<Partial<Record<ShortcutAction, () => void>>>(() => {
    const s = useEditor.getState;
    return {
      playPause: () => playerRef.current?.toggle(),
      split: () => s().splitSelectionAtPlayhead(),
      delete: () => s().deleteSelection(false),
      rippleDelete: () => s().deleteSelection(true),
      undo: () => s().undo(),
      redo: () => s().redo(),
      redoAlt: () => s().redo(),
      copy: () => s().copySelection(),
      paste: () => s().paste(),
      duplicate: () => s().duplicateSelection(),
      selectAll: () => s().select(s().project!.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.map((c) => c.id))),
      prevFrame: () => seek(s().frame - 1),
      nextFrame: () => seek(s().frame + 1),
      back10: () => seek(s().frame - 10),
      fwd10: () => seek(s().frame + 10),
      home: () => seek(0),
      end: () => seek(Math.max(0, Math.max(0, ...s().project!.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration))) - 1)),
      marker: () => s().addMarker(),
      zoomIn: () => s().setZoom(s().pxPerFrame * 1.4),
      zoomOut: () => s().setZoom(s().pxPerFrame / 1.4),
      toolSelect: () => setTool("select"),
      toolBlade: () => setTool("blade"),
      addText: () => s().addText(),
      save: () => save().then(() => toast.ok("Projeto salvo")),
      export: () => setDialog("export"),
    };
  }, [save]);

  const keymap = settingsQ.data?.keymap ?? {};
  useShortcuts(keymap, handlers, Boolean(project));
  const kb = (id: ShortcutAction) => keymap[id] ?? SHORTCUT_ACTIONS.find((a) => a.id === id)?.combo ?? "";

  const { upload } = useUploader();
  const fileRef = useRef<HTMLInputElement>(null);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p>Projeto não encontrado.</p>
        <Link href="/" className="text-accent">
          Voltar aos projetos
        </Link>
      </div>
    );
  }
  if (!project || project.id !== projectId) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted">
        <Loader2 className="animate-spin" size={18} /> Abrindo projeto…
      </div>
    );
  }

  const fmt = getFormat(project.formatId);
  const s = useEditor.getState;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Link href="/" className="ig-gradient flex h-7 w-7 items-center justify-center rounded-md" title="Projetos">
          <Clapperboard size={15} className="text-white" />
        </Link>
        <Menubar.Root className="flex items-center gap-0.5">
          <Menu label="Projetos">
            <Item onSelect={() => router.push("/")}>Todos os projetos</Item>
            <Item onSelect={() => setDialog("new")}>Novo projeto…</Item>
          </Menu>
          <Menu label="Arquivo">
            <Item onSelect={() => save().then(() => toast.ok("Projeto salvo"))} kbd={kb("save")}>
              Salvar
            </Item>
            <Item onSelect={() => fileRef.current?.click()}>Importar mídia…</Item>
            <Item onSelect={() => setDialog("versions")}>Versões anteriores…</Item>
            <Sep />
            <Item onSelect={() => setDialog("export")} kbd={kb("export")}>
              Exportar…
            </Item>
          </Menu>
          <Menu label="Editar">
            <Item onSelect={() => s().undo()} kbd={kb("undo")}>
              Desfazer
            </Item>
            <Item onSelect={() => s().redo()} kbd={kb("redo")}>
              Refazer
            </Item>
            <Sep />
            <Item onSelect={() => s().copySelection()} kbd={kb("copy")}>
              Copiar
            </Item>
            <Item onSelect={() => s().paste()} kbd={kb("paste")}>
              Colar no cursor
            </Item>
            <Item onSelect={() => s().duplicateSelection()} kbd={kb("duplicate")}>
              Duplicar
            </Item>
            <Item onSelect={() => s().splitSelectionAtPlayhead()} kbd={kb("split")}>
              Dividir no cursor
            </Item>
            <Item onSelect={() => s().deleteSelection(false)} kbd={kb("delete")}>
              Excluir
            </Item>
            <Item onSelect={() => s().deleteSelection(true)} kbd={kb("rippleDelete")}>
              Excluir e fechar lacuna
            </Item>
            <Sep />
            <Item onSelect={handlers.selectAll!} kbd={kb("selectAll")}>
              Selecionar tudo
            </Item>
          </Menu>
          <Menu label="Exibir">
            <Item onSelect={() => s().setView({ safeArea: !s().view.safeArea })}>Área segura do Instagram</Item>
            <Item onSelect={() => s().setView({ grid: !s().view.grid })}>Grade</Item>
            <Item onSelect={() => s().setView({ thirds: !s().view.thirds })}>Regra dos terços</Item>
            <Item onSelect={() => s().setView({ previewZoom: "fit" })}>Ajustar preview à janela</Item>
            <Sep />
            <Item
              onSelect={() => {
                for (const k of Object.keys(localStorage)) if (LAYOUT_IDS.some((id) => k.includes(id))) localStorage.removeItem(k);
                location.reload();
              }}
            >
              Restaurar layout dos painéis
            </Item>
          </Menu>
          <Menu label="Composição">
            <Item onSelect={() => s().select([])}>Configurações do projeto e formato</Item>
            <Item onSelect={() => s().addTrack("visual")}>Nova faixa de vídeo</Item>
            <Item onSelect={() => s().addTrack("audio")}>Nova faixa de áudio</Item>
            <Item onSelect={() => s().addMarker()} kbd={kb("marker")}>
              Adicionar marcador
            </Item>
            <Item onSelect={() => s().addText()} kbd={kb("addText")}>
              Adicionar texto
            </Item>
          </Menu>
          <Menu label="Efeitos">
            <Item onSelect={() => s().setLeftTab("effects")}>Cor e looks</Item>
            <Item onSelect={() => s().setLeftTab("transitions")}>Transições</Item>
            <Item onSelect={() => s().setLeftTab("text")}>Textos animados</Item>
            <Item onSelect={() => s().setLeftTab("elements")}>Elementos gráficos</Item>
          </Menu>
          <Menu label="Exportar">
            <Item onSelect={() => setDialog("export")} kbd={kb("export")}>
              Exportar vídeo ou quadro…
            </Item>
          </Menu>
          <Menu label="Configurações">
            <Item onSelect={() => setDialog("presets")}>Padrões e estilos…</Item>
            <Item onSelect={() => setDialog("shortcuts")}>Atalhos de teclado…</Item>
            <Item onSelect={() => setDialog("storage")}>Armazenamento e desempenho…</Item>
          </Menu>
        </Menubar.Root>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-[12px]">
          <span className="truncate font-medium">{project.name}</span>
          <span className="rounded bg-panel-3 px-1.5 py-0.5 text-[11px] text-muted">
            {fmt.label} {fmt.ratio}
          </span>
        </div>
        <VibeBadge projectId={projectId} status={vibe} />
        <SaveStatus />
        <Button variant="gradient" size="sm" onClick={() => setDialog("export")}>
          <Download size={13} /> Exportar
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*,.mkv,.mov"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              s().setLeftTab("media");
              upload(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </header>

      <Group id="ms-vertical" orientation="vertical" className="min-h-0 flex-1" defaultLayout={vLayout.defaultLayout} onLayoutChanged={vLayout.onLayoutChanged}>
        <Panel id="top" defaultSize="62" minSize="25">
          <Group id="ms-top" orientation="horizontal" defaultLayout={hLayout.defaultLayout} onLayoutChanged={hLayout.onLayoutChanged}>
            <Panel id="left" defaultSize="22" minSize="14" maxSize="40">
              <LeftPanel />
            </Panel>
            <Separator className="w-px" />
            <Panel id="center" defaultSize="56" minSize="25">
              <Preview useProxies={settingsQ.data?.useProxies ?? true} />
            </Panel>
            <Separator className="w-px" />
            <Panel id="right" defaultSize="22" minSize="15" maxSize="40">
              <div className="h-full overflow-y-auto bg-panel">
                <PropertiesPanel />
              </div>
            </Panel>
          </Group>
        </Panel>
        <Separator className="h-px" />
        <Panel id="bottom" defaultSize="38" minSize="15">
          <Timeline tool={tool} setTool={setTool} />
        </Panel>
      </Group>

      <ExportDialog open={dialog === "export"} onOpenChange={(o) => setDialog(o ? "export" : null)} />
      <NewProjectDialog
        open={dialog === "new"}
        onOpenChange={(o) => setDialog(o ? "new" : null)}
        onCreated={async (p) => {
          await save();
          qc.invalidateQueries({ queryKey: ["projects"] });
          router.push(`/editor/${p.id}`);
        }}
      />
      <PresetsManagerDialog open={dialog === "presets"} onOpenChange={(o) => setDialog(o ? "presets" : null)} />
      <ShortcutsDialog open={dialog === "shortcuts"} onOpenChange={(o) => setDialog(o ? "shortcuts" : null)} />
      <StorageDialog open={dialog === "storage"} onOpenChange={(o) => setDialog(o ? "storage" : null)} />
      <VersionsDialog open={dialog === "versions"} onOpenChange={(o) => setDialog(o ? "versions" : null)} />
    </div>
  );
}

function useAutosave(seconds: number) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = async (keepalive = false) => {
      const st = useEditor.getState();
      if (!st.project || !st.dirty || st.gestureBase) return;
      st.setSaving(true);
      try {
        ownSave.json = JSON.stringify(st.project);
        const r = await api.saveProject(st.project, keepalive);
        // só limpa "dirty" se nada mudou durante o envio
        if (useEditor.getState().project === st.project) useEditor.setState({ dirty: false });
        useEditor.getState().markSaved(r.savedAt, r.revision);
      } catch {
        // mantém dirty: nova tentativa na próxima alteração
      } finally {
        useEditor.getState().setSaving(false);
      }
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project !== prev.project && s.dirty) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => flush(), seconds * 1000);
      }
    });
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        flush(true);
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeunload", onUnload);
      flush(true);
    };
  }, [seconds]);
}

function SaveStatus() {
  const dirty = useEditor((s) => s.dirty);
  const saving = useEditor((s) => s.saving);
  const last = useEditor((s) => s.lastSavedAt);
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted" aria-live="polite">
      {saving ? (
        <>
          <Loader2 size={12} className="animate-spin" /> Salvando…
        </>
      ) : dirty ? (
        <>
          <CloudOff size={12} /> Alterações pendentes
        </>
      ) : (
        <>
          {last ? <Check size={12} className="text-ok" /> : <Cloud size={12} />} {last ? "Salvo" : "Sincronizado"}
        </>
      )}
    </span>
  );
}

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Menubar.Menu>
      <Menubar.Trigger className="rounded px-2 py-1 text-[12px] text-muted outline-none hover:bg-panel-3 hover:text-fg data-[state=open]:bg-panel-3 data-[state=open]:text-fg">
        {label}
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content align="start" sideOffset={4} className="z-50 min-w-56 rounded-lg border border-line bg-panel-2 p-1 shadow-2xl">
          {children}
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}

function Item({ children, onSelect, kbd }: { children: React.ReactNode; onSelect: () => void; kbd?: string }) {
  return (
    <Menubar.Item
      onSelect={onSelect}
      className={cn("flex cursor-default items-center rounded px-2 py-1.5 text-[12px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white")}
    >
      {children}
      {kbd ? <span className="ml-auto pl-6 font-mono text-[10px] opacity-60">{kbd}</span> : <ChevronRight size={0} />}
    </Menubar.Item>
  );
}

function Sep() {
  return <Menubar.Separator className="my-1 h-px bg-line" />;
}
