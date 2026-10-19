import "server-only";
import {
  createFolder as createApiFolder,
  getFolder as getApiFolder,
  getItemDownloadUrl,
  listChildren,
  updateItem,
} from "@/lib/api/items";
import type {
  ApiResult,
  CreateFolderInput,
  DownloadUrl,
  Item,
  ItemDetail,
  ItemPage,
  UpdateItemInput,
} from "@/lib/api/types";
import { withSession } from "@/lib/dal/session";

/**
 * Uma página dos Itens de uma pasta do Usuário da Sessão (`root` para a Pasta raiz). A
 * conferência da Sessão é a da própria listagem, por `withSession`, sem uma chamada a mais. Os
 * outros erros voltam como valor, para quem chama decidir: a página falha (ou mostra "não
 * encontrado"), e o "Carregar mais" mostra a mensagem.
 */
export function getFolderItems(
  folderId: string,
  cursor?: string,
): Promise<ApiResult<ItemPage>> {
  return withSession((token) => listChildren(token, folderId, cursor));
}

/** A pasta e o caminho do topo até ela, ou `not_found`. */
export function getFolder(folderId: string): Promise<ApiResult<ItemDetail>> {
  return withSession((token) => getApiFolder(token, folderId));
}

/** Cria uma pasta para o Usuário da Sessão. */
export function createFolder(input: CreateFolderInput): Promise<ApiResult<Item>> {
  return withSession((token) => createApiFolder(token, input));
}

/** Troca o nome de um Item do Usuário da Sessão. */
export function renameItem(
  id: string,
  input: UpdateItemInput,
): Promise<ApiResult<Item>> {
  return withSession((token) => updateItem(token, id, input));
}

/** A URL assinada de download de um arquivo do Usuário da Sessão. */
export function getDownloadUrl(id: string): Promise<ApiResult<DownloadUrl>> {
  return withSession((token) => getItemDownloadUrl(token, id));
}
