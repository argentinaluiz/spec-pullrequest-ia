"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createUploadEngine, INITIAL_SNAPSHOT, isTransferring } from "@/lib/uploads/engine";
import { createBrowserIncompleteStore } from "@/lib/uploads/incomplete-store";
import { createRefreshBatcher } from "@/lib/uploads/refresh";
import { fetchTransport, timerSleep } from "@/lib/uploads/transport";
import type {
  CancelUploadResult,
  CompleteUploadResult,
  ResumeUploadResult,
  StartUploadInput,
  StartUploadResult,
  UploadEntry,
} from "@/lib/uploads/types";

/** O que o painel mostra. Muda a cada progresso. */
type UploadsState = {
  entries: UploadEntry[];
  /** Soltaram uma pasta: ela não é enviada, e o painel avisa. */
  folderDropped: boolean;
};

/** O que a tela pede ao motor. Não muda de identidade, então quem só envia não renderiza a cada progresso. */
type UploadsActions = {
  /** Põe os arquivos na fila, com `parentId` como destino. */
  send: (files: File[], parentId: string) => void;
  /** Acende o aviso de pasta solta. */
  notifyFolderDropped: () => void;
  pause: (key: string) => void;
  resume: (key: string) => void;
  cancel: (key: string) => void;
  retry: (key: string) => void;
  /** O arquivo que a pessoa escolheu para um envio que espera por ele. */
  selectFile: (key: string, file: File) => void;
  /** Liga o Usuário: traz de volta os envios incompletos que o navegador guardou para ele. */
  bindUser: (userId: string) => void;
  /** Tira do painel o envio que terminou ou falhou. */
  dismiss: (key: string) => void;
  /** Fecha o painel: tira os envios que terminaram ou falharam e o aviso de pasta. Os em andamento continuam. */
  close: () => void;
};

const UploadsStateContext = createContext<UploadsState | null>(null);
const UploadsActionsContext = createContext<UploadsActions | null>(null);

function required<T>(value: T | null): T {
  if (!value) throw new Error("Os envios só funcionam dentro do UploadProvider.");
  return value;
}

export function useUploadsState(): UploadsState {
  return required(useContext(UploadsStateContext));
}

export function useUploadActions(): UploadsActions {
  return required(useContext(UploadsActionsContext));
}

type UploadProviderProps = {
  startUpload: (input: StartUploadInput) => Promise<StartUploadResult>;
  completeUpload: (itemId: string) => Promise<CompleteUploadResult>;
  cancelUpload: (itemId: string) => Promise<CancelUploadResult>;
  resumeUpload: (itemId: string) => Promise<ResumeUploadResult>;
  children: ReactNode;
};

/** Conclusões dentro deste intervalo dividem um `router.refresh()`. */
const REFRESH_DELAY_MS = 500;

/**
 * Liga o motor de envio (`lib/uploads`) ao painel: a API reserva o espaço e cria a sessão
 * (Server Action), o navegador manda os chunks direto ao storage e a API confere o arquivo
 * (Server Action). O estado vive no layout, então um envio continua enquanto a pessoa navega.
 */
export function UploadProvider({
  startUpload,
  completeUpload,
  cancelUpload,
  resumeUpload,
  children,
}: UploadProviderProps) {
  const router = useRouter();
  const [folderDropped, setFolderDropped] = useState(false);
  // O motor fica com as primeiras ações e o primeiro roteador: uma Server Action é chamada pelo
  // id, então uma referência antiga chama a mesma ação, e o roteador do App Router não muda.
  const [{ engine, refresher }] = useState(() => {
    // A lista é do servidor: ela é pedida de novo para trazer o arquivo e a Cota.
    const refresher = createRefreshBatcher(() => router.refresh(), REFRESH_DELAY_MS);
    const engine = createUploadEngine({
      transport: fetchTransport,
      sleep: timerSleep,
      api: { start: startUpload, complete: completeUpload, cancel: cancelUpload, resume: resumeUpload },
      onDone: refresher.request,
    });
    return { engine, refresher };
  });

  // Sair do `(drive)` para os envios (docs/lld.md, seção 7.4): os uploads ficam `pending`, como
  // ao fechar a aba. O motor continua usável, então a montagem dupla do modo estrito não o quebra.
  useEffect(
    () => () => {
      engine.stop();
      refresher.dispose();
    },
    [engine, refresher],
  );

  // Soltar arquivos fora da lista não os envia, mas também não deixa o navegador abri-los na aba.
  useEffect(() => {
    const block = (event: DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      if (event.type === "dragover") event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const { entries } = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    () => INITIAL_SNAPSHOT,
  );

  // Fechar ou recarregar a aba com um envio que manda bytes ou espera na fila pede confirmação
  // (docs/lld.md, seção 7.4). O pausado, o que espera o arquivo e o terminado voltam como incompletos.
  const sending = entries.some(isTransferring);
  useEffect(() => {
    if (!sending) return;
    const confirm = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", confirm);
    return () => window.removeEventListener("beforeunload", confirm);
  }, [sending]);

  const actions = useMemo<UploadsActions>(
    () => ({
      send: (files, parentId) => {
        if (files.length > 0) engine.add(files, parentId);
      },
      notifyFolderDropped: () => setFolderDropped(true),
      pause: engine.pause,
      resume: engine.resume,
      cancel: engine.cancel,
      retry: engine.retry,
      selectFile: engine.selectFile,
      bindUser: (userId) => {
        void engine.bindStore(createBrowserIncompleteStore(userId));
      },
      dismiss: engine.dismiss,
      close: () => {
        engine.clearFinished();
        setFolderDropped(false);
      },
    }),
    [engine],
  );
  const state = useMemo(
    () => ({ entries, folderDropped }),
    [entries, folderDropped],
  );

  return (
    <UploadsActionsContext.Provider value={actions}>
      <UploadsStateContext.Provider value={state}>
        {children}
      </UploadsStateContext.Provider>
    </UploadsActionsContext.Provider>
  );
}
