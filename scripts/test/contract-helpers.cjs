// Auxiliares dos testes do renderizador do contrato: o snapshot de exemplo da OpenAPI e a leitura de um
// painel da página de revisão (esta, da skill de plano). Não termina em `.test.cjs`, então o `node --test` não o roda como teste.

// A leitura de um painel da página é a da skill de plano, que o renderizador do contrato reusa.
const { panel } = require('../../.claude/skills/__tests__/plan-ticket/helpers.cjs');

/** Um snapshot da OpenAPI com as rotas dadas, o esquema `bearer`, o problema e o `MeDto`. */
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

module.exports = { snapshot, panel };
