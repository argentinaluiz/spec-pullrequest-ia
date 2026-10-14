"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { putBytes } from "@/components/uploads/put-bytes";
import type {
  CompleteUpload,
  StartUpload,
  UploadEntry,
} from "@/components/uploads/types";

/** A mensagem de um envio cujos bytes não chegaram ao storage. */
const CONNECTION_FAILED = "A conexão falhou durante o envio";

type UploadsContextValue = {
  entries: UploadEntry[];
  /** Envia o arquivo para a Pasta raiz e o acompanha no painel. */
  send: (file: File) => void;
  /** Tira do painel o envio que terminou ou falhou. */
  dismiss: (key: string) => void;
  /** Esvazia o painel dos envios que terminaram ou falharam. */
  clearFinished: () => void;
};

const UploadsContext = createContext<UploadsContextValue | null>(null);

export function useUploads(): UploadsContextValue {
  const value = useContext(UploadsContext);
  if (!value) {
    throw new Error("useUploads só funciona dentro do UploadProvider.");
  }
  return value;
}

type UploadProviderProps = {
  startUpload: StartUpload;
  completeUpload: CompleteUpload;
  children: ReactNode;
};

/**
 * Guarda os envios da casca do Drive e conduz cada um: a API reserva o espaço e cria a sessão
 * (Server Action), o navegador manda os bytes direto ao storage e a API confere o arquivo
 * (Server Action). O estado vive no layout, então um envio continua enquanto a pessoa navega.
 */
export function UploadProvider({
  startUpload,
  completeUpload,
  children,
}: UploadProviderProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  // Uma chave por envio da sessão da página. `crypto.randomUUID` só existe em contexto seguro (HTTPS).
  const nextKey = useRef(0);

  const update = useCallback((key: string, change: Partial<UploadEntry>) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.key === key ? { ...entry, ...change } : entry,
      ),
    );
  }, []);

  const send = useCallback(
    (file: File) => {
      const key = String(nextKey.current++);
      const fail = (message: string) =>
        update(key, { status: "failed", message });
      setEntries((current) => [
        ...current,
        {
          key,
          name: file.name,
          mimeType: file.type,
          status: "uploading",
          progress: 0,
        },
      ]);

      void (async () => {
        try {
          await run();
        } catch {
          // Uma Server Action que falha de vez (rede, 5xx) não pode deixar o envio preso em "enviando".
          fail(CONNECTION_FAILED);
        }
      })();

      async function run() {
        const started = await startUpload({
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
        });
        if (!started.ok) return fail(started.message);

        const sent = await putBytes(started.uploadUrl, file, (progress) =>
          update(key, { progress }),
        );
        if (!sent.ok) return fail(CONNECTION_FAILED);

        const completed = await completeUpload(started.itemId);
        if (!completed.ok) return fail(completed.message);

        update(key, { status: "done", progress: 100 });
        // A lista é do servidor: ela é pedida de novo para trazer o arquivo.
        router.refresh();
      }
    },
    [startUpload, completeUpload, update, router],
  );

  const dismiss = useCallback((key: string) => {
    setEntries((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const clearFinished = useCallback(() => {
    setEntries((current) =>
      current.filter((entry) => entry.status === "uploading"),
    );
  }, []);

  const value = useMemo(
    () => ({ entries, send, dismiss, clearFinished }),
    [entries, send, dismiss, clearFinished],
  );

  return (
    <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>
  );
}
