// Testes do renderizador da visão do contrato, pela interface que o scripts/verify/api.sh usa: dois
// snapshots da OpenAPI na entrada e o texto na saída. Rodam com o runner nativo do Node, dentro do
// contêiner `api`.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { render } = require('../contract-view.cjs');

const PROBLEM = { $ref: '#/components/schemas/ProblemDetailsDto' };

/** Um erro no formato que o decorator `ApiProblem` gera: o problema com o `code` restrito. */
function problem(...codes) {
  return {
    description: codes.join(', '),
    content: {
      'application/problem+json': {
        schema: { allOf: [PROBLEM], properties: { code: { type: 'string', enum: codes } } },
      },
    },
  };
}

function snapshot(paths, schemas = {}) {
  return {
    openapi: '3.0.0',
    info: { title: 'API', version: '1' },
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        ProblemDetailsDto: {
          type: 'object',
          properties: { type: { type: 'string' }, code: { type: 'string' } },
          required: ['type', 'code'],
        },
        MeDto: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
        ...schemas,
      },
    },
  };
}

const ME = {
  get: {
    operationId: 'MeController_me',
    responses: {
      200: { description: '', content: { 'application/json': { schema: { $ref: '#/components/schemas/MeDto' } } } },
      401: problem('unauthenticated'),
    },
    security: [{ bearer: [] }],
  },
};

function children(errors) {
  return {
    get: {
      operationId: 'ItemsController_listChildren',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: '' }, ...errors },
      security: [{ bearer: [] }],
    },
  };
}

const COPIES = {
  post: {
    operationId: 'ItemsController_copy',
    summary: 'Copia um item',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } },
    ],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/CopyItemDto' } } },
    },
    responses: {
      201: {
        description: '',
        headers: { Location: { required: true, schema: { type: 'string' } } },
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CopiedItemDto' } } },
      },
      404: problem('not_found'),
      409: problem('name_conflict', 'quota_exceeded'),
    },
    security: [{ bearer: [] }],
  },
};

const NEW_SCHEMAS = {
  CopyItemDto: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      parentId: { type: 'string' },
    },
    required: ['name'],
  },
  CopiedItemDto: {
    type: 'object',
    properties: { id: { type: 'string' }, sizeBytes: { type: 'number' } },
    required: ['id', 'sizeBytes'],
  },
};

/** O bloco de uma rota na saída: do título dela até a linha em branco seguinte. */
function block(out, title) {
  const start = out.indexOf(`${title}\n`);
  assert.notEqual(start, -1, `a saída não traz "${title}":\n${out}`);
  const end = out.indexOf('\n\n', start);
  return out.slice(start, end === -1 ? undefined : end).trimEnd();
}

test('mostra o contrato completo da rota nova e da alterada, e omite a que não mudou @LUI-172-CA1', () => {
  const base = snapshot({ '/v1/me': ME, '/v1/items/{id}/children': children({ 404: problem('not_found') }) });
  const head = snapshot(
    {
      '/v1/me': ME,
      '/v1/items/{id}/children': children({ 404: problem('not_found'), 403: problem('forbidden') }),
      '/v1/items/{id}/copies': COPIES,
    },
    NEW_SCHEMAS,
  );

  const out = render(base, head);

  assert.equal(
    block(out, 'Rota nova: POST /v1/items/{id}/copies'),
    [
      'Rota nova: POST /v1/items/{id}/copies',
      '  Autenticação: protegida (bearer)',
      '  Parâmetros:',
      '    id (caminho): string, obrigatório',
      '  Cabeçalhos de entrada:',
      '    Idempotency-Key: string, obrigatório',
      '  Corpo (application/json), obrigatório:',
      '    name: string, obrigatório, de 1 a 255 caracteres',
      '    parentId: string, opcional',
      '  Sucesso:',
      '    201 (application/json)',
      '      id: string, obrigatório',
      '      sizeBytes: number, obrigatório',
      '      Cabeçalho Location: string, obrigatório',
      '  Erros:',
      '    404: not_found',
      '    409: name_conflict, quota_exceeded',
    ].join('\n'),
  );
  assert.equal(
    block(out, 'Rota alterada: GET /v1/items/{id}/children'),
    [
      'Rota alterada: GET /v1/items/{id}/children',
      '  Autenticação: protegida (bearer)',
      '  Parâmetros:',
      '    id (caminho): string, obrigatório',
      '  Sucesso:',
      '    200 (sem corpo)',
      '  Erros:',
      '    403: forbidden',
      '    404: not_found',
    ].join('\n'),
  );
  assert.doesNotMatch(out, /\/v1\/me\b/);
});

test('diz que o contrato não muda quando os snapshots são iguais, inclusive se só o texto mudou @LUI-172-CA1', () => {
  const base = snapshot({ '/v1/me': ME });
  const head = snapshot({ '/v1/me': { get: { ...ME.get, summary: 'Quem sou eu', description: 'Texto novo' } } });

  assert.equal(render(base, base).trim(), 'O contrato não muda.');
  assert.equal(render(base, head).trim(), 'O contrato não muda.');
});

test('conta como alterada a rota cuja mudança o texto renderizado não mostra', () => {
  const body = (schema) => ({
    post: {
      requestBody: { required: true, content: { 'application/json': { schema } } },
      responses: { 204: { description: '' } },
    },
  });
  const tags = { type: 'object', properties: { tags: { type: 'object' } } };

  const out = render(
    snapshot({ '/v1/tags': body(tags) }),
    snapshot({ '/v1/tags': body({ ...tags, minProperties: 1 }) }),
  );

  assert.match(out, /^Rota alterada: POST \/v1\/tags$/m);
});

test('conta um campo chamado description como contrato, e não como texto', () => {
  const dto = (properties) => ({ type: 'object', properties });
  const route = {
    get: {
      responses: {
        200: { description: '', content: { 'application/json': { schema: { $ref: '#/components/schemas/TagDto' } } } },
      },
    },
  };

  const out = render(
    snapshot({ '/v1/tag': route }, { TagDto: dto({ name: { type: 'string' }, description: { type: 'string' } }) }),
    snapshot({ '/v1/tag': route }, { TagDto: dto({ name: { type: 'string' } }) }),
  );

  assert.match(out, /^Rota alterada: GET \/v1\/tag$/m);
});

test('não conta como alterada a rota que só trocou o schema inline por um $ref igual, a ordem das chaves ou o texto de um componente', () => {
  const inline = { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] };
  const route = (schema) => ({
    get: { responses: { 200: { description: '', content: { 'application/json': { schema } } } } },
  });

  const base = snapshot({ '/v1/me': route(inline) });
  const head = snapshot(
    { '/v1/me': route({ $ref: '#/components/schemas/MeDto' }) },
    { MeDto: { required: ['email'], description: 'Quem está logado', properties: { email: { type: 'string', example: 'a@b.c' } }, type: 'object' } },
  );

  assert.equal(render(base, head).trim(), 'O contrato não muda.');
});

test('mostra a união, cada tipo de conteúdo e a rota e o campo obsoletos', () => {
  const upload = {
    put: {
      deprecated: true,
      parameters: [
        { name: 'ref', in: 'query', required: true, deprecated: true, schema: { oneOf: [{ type: 'string' }, { type: 'integer' }] } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } },
          'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } },
        },
      },
      responses: {
        200: {
          description: '',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  owner: { anyOf: [{ $ref: '#/components/schemas/MeDto' }, { type: 'string', readOnly: true }] },
                  size: { type: 'integer', minimum: 0, exclusiveMinimum: true, exclusiveMaximum: 10 },
                },
              },
            },
            'application/vnd.app+json': {
              schema: { type: 'object', properties: { owner: { type: 'string' } } },
            },
          },
        },
      },
    },
  };

  const out = render(snapshot({}), snapshot({ '/v1/uploads': upload }));

  assert.equal(
    block(out, 'Rota nova: PUT /v1/uploads'),
    [
      'Rota nova: PUT /v1/uploads',
      '  Autenticação: pública',
      '  Obsoleta (deprecated)',
      '  Parâmetros:',
      '    ref (consulta): string ou integer, obrigatório, obsoleto',
      '  Corpo (application/json), obrigatório:',
      '    name: string, opcional',
      '  Corpo (multipart/form-data), obrigatório:',
      '    file: string (binary), opcional',
      '  Sucesso:',
      '    200 (application/json)',
      '      owner: MeDto ou string, opcional',
      '        Opção MeDto:',
      '          email: string, obrigatório',
      '      size: integer, opcional, maior que 0, menor que 10',
      '    200 (application/vnd.app+json)',
      '      owner: string, opcional',
    ].join('\n'),
  );
});

test('junta os tipos de conteúdo com o mesmo schema numa linha só', () => {
  const schema = { type: 'object', properties: { name: { type: 'string' } } };
  const route = {
    post: {
      requestBody: { content: { 'application/json': { schema }, 'application/x-www-form-urlencoded': { schema } } },
      responses: { 204: { description: '' } },
    },
  };

  const out = render(snapshot({}), snapshot({ '/v1/names': route }));

  assert.match(out, /^ {2}Corpo \(application\/json, application\/x-www-form-urlencoded\), opcional:\n {4}name: string, opcional$/m);
});

test('põe o default nos erros, depois dos status, com os status em ordem numérica', () => {
  const route = {
    get: {
      responses: {
        default: problem('internal'),
        500: problem('unavailable'),
        '4XX': problem('bad_request'),
        404: problem('not_found'),
        200: { description: '' },
      },
    },
  };

  const out = render(snapshot({}), snapshot({ '/v1/ping': route }));

  assert.equal(
    block(out, 'Rota nova: GET /v1/ping'),
    [
      'Rota nova: GET /v1/ping',
      '  Autenticação: pública',
      '  Sucesso:',
      '    200 (sem corpo)',
      '  Erros:',
      '    404: not_found',
      '    4XX: bad_request',
      '    500: unavailable',
      '    default: internal',
    ].join('\n'),
  );
});

test('usa o parâmetro da operação no lugar do parâmetro do caminho com o mesmo nome e o mesmo in', () => {
  const out = render(
    snapshot({}),
    snapshot({
      '/v1/items/{id}': {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'query', schema: { type: 'string' } },
        ],
        get: {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 204: { description: '' } },
        },
      },
    }),
  );

  assert.equal(
    block(out, 'Rota nova: GET /v1/items/{id}'),
    [
      'Rota nova: GET /v1/items/{id}',
      '  Autenticação: pública',
      '  Parâmetros:',
      '    id (caminho): integer, obrigatório',
      '    id (consulta): string, opcional',
      '  Sucesso:',
      '    204 (sem corpo)',
    ].join('\n'),
  );
});

test('lê o corpo obrigatório através do $ref do requestBody', () => {
  const rename = {
    patch: {
      requestBody: { $ref: '#/components/requestBodies/Rename' },
      responses: { 204: { description: '' } },
    },
  };
  const head = snapshot({ '/v1/items/{id}': rename });
  head.components.requestBodies = {
    Rename: {
      required: true,
      content: {
        'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
      },
    },
  };

  const out = render(snapshot({}), head);

  assert.match(out, /^ {2}Corpo \(application\/json\), obrigatório:\n {4}name: string, obrigatório$/m);
});

test('lista a rota removida, sem o contrato dela', () => {
  const out = render(snapshot({ '/v1/me': ME }), snapshot({}));

  assert.equal(out.trim(), 'Rota removida: GET /v1/me');
});

test('expande o objeto aninhado e a lista de objetos, com o tipo, o nulo e os limites', () => {
  const list = {
    get: {
      parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'number', minimum: 1, maximum: 200, default: 50 } },
      ],
      responses: {
        200: {
          description: '',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: '#/components/schemas/ItemDto' } },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items', 'nextCursor'],
              },
            },
          },
        },
      },
    },
  };
  const ItemDto = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['file', 'folder'] },
      updatedAt: { type: 'string', format: 'date-time' },
    },
    required: ['type'],
  };

  const out = render(snapshot({}), snapshot({ '/v1/items': list }, { ItemDto }));

  assert.equal(
    block(out, 'Rota nova: GET /v1/items'),
    [
      'Rota nova: GET /v1/items',
      '  Autenticação: pública',
      '  Parâmetros:',
      '    limit (consulta): number, opcional, mínimo 1, máximo 200, padrão 50',
      '  Sucesso:',
      '    200 (application/json)',
      '      items: array de objeto, obrigatório',
      '        type: string ("file" | "folder"), obrigatório',
      '        updatedAt: string (date-time), opcional',
      '      nextCursor: string, obrigatório, aceita null',
    ].join('\n'),
  );
});
