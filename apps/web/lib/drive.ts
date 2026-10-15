/** O nome da Pasta raiz na interface: título da página, navegação e lista. */
export const ROOT_FOLDER_LABEL = "Meus arquivos";

/** O endereço de uma pasta que não é a raiz. */
export function folderPath(id: string): string {
  return `/pasta/${id}`;
}
