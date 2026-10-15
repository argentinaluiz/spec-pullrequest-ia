"use client";

import { CircleCheck } from "lucide-react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Quanto o aviso de confirmação fica na tela, em milissegundos. */
const TOAST_DURATION_MS = 5_000;

type ToastApi = {
  /** Mostra uma confirmação breve, que some sozinha. */
  show: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = use(ToastContext);
  if (!api) throw new Error("Use dentro de um ToastProvider.");
  return api;
}

/**
 * O `{component.toast}`: confirmação breve no canto inferior esquerdo, que some em 5 segundos.
 * Vive no layout do Drive, para o aviso sobreviver à atualização da lista que o dispara.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const show = useCallback((message: string) => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        role="status"
        className="pointer-events-none fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)]"
      >
        {toast && (
          <p
            key={toast.id}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-hairline bg-surface-raised px-4 py-3 text-ui text-ink shadow-overlay transition-[opacity,translate] duration-200 starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
          >
            <CircleCheck className="size-5 shrink-0 text-success" />
            {toast.message}
          </p>
        )}
      </div>
    </ToastContext>
  );
}
