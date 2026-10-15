"use client";

import { useEffect } from "react";
import { useUploadActions } from "@/components/uploads/upload-provider";

/**
 * Entrega ao provider o Usuário do Drive, para os envios incompletos de antes de fechar a aba
 * voltarem ao painel. Não renderiza nada.
 */
export function UploadUserBinder({ userId }: { userId: string }) {
  const { bindUser } = useUploadActions();
  useEffect(() => {
    bindUser(userId);
  }, [bindUser, userId]);
  return null;
}
