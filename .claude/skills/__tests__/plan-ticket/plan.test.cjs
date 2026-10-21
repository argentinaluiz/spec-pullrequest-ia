// Testes do parser da skill de plano, pela interface que a página e o conferidor do aceite do projeto
// usam: o texto do arquivo de aceite e o da mensagem do commit de plano na entrada, os dados na
// saída. Rodam com o runner nativo do Node (`node --test`), sem dependências. Nenhum título cita o ID
// de um critério de aceite: os testes de aceite de um projeto ficam nos testes dele.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseAcceptanceFile, parseMessage, parseTestMap, CHECKS, TEST_MAP_NAME } = require('../../plan-ticket/scripts/plan.cjs');

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
  const parsed = parseMessage('docs: plan x (PROJ-123)\n\nAcceptance file docs/tickets/PROJ-1/PROJ-123/aceite.md.\n\nDecision: one.\n');
  assert.deepEqual(parsed.decisions, ['one.']);
  assert.equal(parsed.files, null);
  assert.equal(parsed.tests, null);
  assert.equal(parsed.data, null);
});

test('lê o mapa de testes: uma ligação por linha, com o ID, o arquivo e o nome inteiro do caso, e pula o comentário e a linha em branco', () => {
  const map = [
    '# ligações do ticket',
    '',
    'EX-1-CA1\tscripts/test/a.test.cjs\tlê a introdução',
    'EX-1-CA2\tscripts/test/b.test.sh\tum nome\tcom tabulação dentro',
    '',
  ].join('\n');
  assert.equal(TEST_MAP_NAME, 'mapa-de-testes.txt');
  assert.deepEqual(parseTestMap(map), {
    links: [
      { id: 'EX-1-CA1', file: 'scripts/test/a.test.cjs', name: 'lê a introdução', line: 3 },
      { id: 'EX-1-CA2', file: 'scripts/test/b.test.sh', name: 'um nome\tcom tabulação dentro', line: 4 },
    ],
    problems: [],
  });
});

test('aponta a linha do mapa mal formada: faltam campos, ou o ID não tem a forma do critério', () => {
  const { links, problems } = parseTestMap('EX-1-CA1\tscripts/test/a.test.cjs\nnão-é-id\tarquivo\tcaso\nEX-1-CA3\tarquivo\tcaso\n');
  assert.deepEqual(links, [{ id: 'EX-1-CA3', file: 'arquivo', name: 'caso', line: 3 }]);
  assert.deepEqual(
    problems.map((problem) => problem.line),
    [1, 2],
  );
  assert.match(problems[0].reason, /ID, do arquivo de teste e do nome do caso/);
  assert.match(problems[1].reason, /não tem a forma/);
});
