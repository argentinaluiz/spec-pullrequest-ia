// Testes do parser da skill de plano, pela interface que a página e o conferidor do aceite do projeto
// usam: o texto do arquivo de aceite e o da mensagem do commit de plano na entrada, os dados na
// saída. Rodam com o runner nativo do Node (`node --test`), sem dependências. Nenhum título cita o ID
// de um critério de aceite: os testes de aceite de um projeto ficam nos testes dele.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseAcceptanceFile, parseMessage, CHECKS } = require('../plan.cjs');

test('lê a introdução e os critérios do aceite, com o subtítulo dentro do critério e sem teste previsto no de documento', () => {
  const acceptance = [
    '# Aceite do EX-1',
    '',
    'Introdução.',
    '',
    '## EX-1-CA1',
    '',
    '### Contexto',
    '',
    '**Marca:** Teste de unidade.',
    '',
    '**Cenário:** Dado um título,',
    'então ele sai normalizado.',
    '',
    '**Teste previsto:** testes de unidade, `guia.test.js`.',
    '',
    '## EX-1-CA2',
    '',
    '**Marca:** documento',
    '',
    '**Cenário:** Dado o guia, quando se lê, então diz a regra.',
    '',
  ].join('\n');

  assert.deepEqual(parseAcceptanceFile('EX-1.md', acceptance), {
    intro: 'Introdução.',
    criteria: [
      {
        id: 'EX-1-CA1',
        file: 'EX-1.md',
        check: 'teste de unidade',
        scenario: 'Dado um título,\nentão ele sai normalizado.',
        plannedTest: 'testes de unidade, `guia.test.js`.',
      },
      { id: 'EX-1-CA2', file: 'EX-1.md', check: 'documento', scenario: 'Dado o guia, quando se lê, então diz a regra.', plannedTest: null },
    ],
  });
});

test('as marcas são seis, e só as quatro de teste exigem teste', () => {
  assert.deepEqual(
    [...CHECKS.values()].map(({ name, test: required }) => `${name}:${required}`),
    [
      'teste HTTP:true',
      'teste no Playwright:true',
      'teste de unidade:true',
      'teste de integração:true',
      'revisão humana:false',
      'documento:false',
    ],
  );
});

test('a mensagem sem um bloco o devolve nulo, e o texto antes do primeiro rótulo não é de nenhum bloco', () => {
  const parsed = parseMessage('docs: plan x (LUI-902)\n\nAcceptance file docs/aceite/LUI-902.md.\n\nDecision: one.\n');
  assert.deepEqual(parsed.decisions, ['one.']);
  assert.equal(parsed.files, null);
  assert.equal(parsed.tests, null);
  assert.equal(parsed.data, null);
});
