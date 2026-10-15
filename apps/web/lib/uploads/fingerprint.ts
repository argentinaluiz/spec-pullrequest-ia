/** O que identifica um arquivo local sem guardá-lo: nome, tamanho e data de modificação (docs/lld.md, seção 7.4). */
export interface Fingerprint {
  name: string;
  sizeBytes: number;
  lastModified: number;
}

export function fingerprintOf(file: File): Fingerprint {
  return { name: file.name, sizeBytes: file.size, lastModified: file.lastModified };
}

/** Os dois são o mesmo arquivo: nome, tamanho e data iguais. */
export function sameFile(a: Fingerprint, b: Fingerprint): boolean {
  return a.name === b.name && a.sizeBytes === b.sizeBytes && a.lastModified === b.lastModified;
}
