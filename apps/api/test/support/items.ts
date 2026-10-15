import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { PrismaService } from '../../src/infra/database/prisma.service.js';

/** Um Item a gravar direto no banco de testes, com os padrões de um arquivo ativo. */
export interface SeedItem {
  name: string;
  type?: 'file' | 'folder';
  status?: 'pending' | 'active' | 'trashed';
  sizeBytes?: number;
  mimeType?: string | null;
  updatedAt?: Date;
}

/** Põe o token de acesso no cabeçalho quando ele é passado. */
function withAuth(call: request.Test, accessToken?: string): request.Test {
  return accessToken
    ? call.set('Authorization', `Bearer ${accessToken}`)
    : call;
}

/** As chamadas da lista de Itens, contra uma aplicação de teste. */
export function itemRoutes(app: INestApplication<App>) {
  /** `GET /items/{id}/children`, com o token de acesso no cabeçalho quando ele é passado. */
  const listChildren = (
    id: string,
    accessToken?: string,
    query: Record<string, string | number> = {},
  ) => {
    return withAuth(
      request(app.getHttpServer()).get(`/v1/items/${id}/children`).query(query),
      accessToken,
    );
  };

  /** `GET /items/{id}/download-url`, com o token de acesso no cabeçalho quando ele é passado. */
  const downloadUrl = (id: string, accessToken?: string) => {
    return withAuth(
      request(app.getHttpServer()).get(`/v1/items/${id}/download-url`),
      accessToken,
    );
  };

  /** `GET /items/{id}`, com o token de acesso no cabeçalho quando ele é passado. */
  const get = (id: string, accessToken?: string) => {
    return withAuth(
      request(app.getHttpServer()).get(`/v1/items/${id}`),
      accessToken,
    );
  };

  /** `POST /folders`, com o token de acesso no cabeçalho quando ele é passado. */
  const createFolder = (accessToken: string | undefined, input: object) => {
    return withAuth(
      request(app.getHttpServer()).post('/v1/folders').send(input),
      accessToken,
    );
  };

  /**
   * O id da Pasta raiz do Usuário. Ela nasce pelo caminho real, a primeira
   * listagem pelo atalho `root`, e só então é lida no banco.
   */
  const rootId = async (accessToken: string, userId: string) => {
    await listChildren('root', accessToken).expect(200);
    const root = await app.get(PrismaService).item.findFirstOrThrow({
      where: { ownerId: userId, parentId: null },
      select: { id: true },
    });
    return root.id;
  };

  /**
   * Grava os Itens direto no banco, dentro da pasta `parentId`, como
   * preparação: até o upload existir, nenhuma rota cria um Item. Devolve os
   * ids na ordem recebida.
   */
  const seed = async (
    ownerId: string,
    parentId: string,
    items: SeedItem[],
  ): Promise<string[]> => {
    const rows = items.map((item) => {
      const type = item.type ?? 'file';
      const isFile = type === 'file';
      return {
        id: uuidv7(),
        ownerId,
        parentId,
        type,
        name: item.name,
        status: item.status ?? 'active',
        sizeBytes: BigInt(item.sizeBytes ?? (isFile ? 1024 : 0)),
        mimeType:
          item.mimeType === undefined
            ? isFile
              ? 'text/plain'
              : null
            : item.mimeType,
        objectKey: isFile ? uuidv7() : null,
        updatedAt: item.updatedAt ?? new Date(),
      };
    });
    await app.get(PrismaService).item.createMany({ data: rows });
    return rows.map((row) => row.id);
  };

  return { listChildren, downloadUrl, get, createFolder, rootId, seed };
}
