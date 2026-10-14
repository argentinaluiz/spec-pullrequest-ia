// Testes do conferidor de aceite, pela mesma interface que o scripts/verify.sh usa: o corpo do PR,
// os arquivos de aceite e os relatórios das suítes na entrada; o código de saída e as mensagens
// na saída. Rodam com o runner nativo do Node, dentro do contêiner `api`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHECKER = path.join(__dirname, '..', 'check-acceptance.cjs');

function acceptanceFile(criteria) {
  return criteria
    .map(([id, check]) => `## ${id}\n\n- **Marca:** ${check}\n- **Cenário:** Dado, Quando, Então.\n`)
    .join('\n');
}

function vitestReport(tests) {
  return {
    testResults: [
      {
        name: '/work/apps/api/test/x.e2e-spec.ts',
        assertionResults: tests.map(([title, status]) => ({
          title,
          fullName: title,
          ancestorTitles: [],
          status,
        })),
      },
    ],
  };
}

function playwrightReport(tests) {
  return {
    suites: [
      {
        title: 'x.spec.ts',
        specs: tests.map(([title, status, tags = []]) => ({
          title,
          file: 'e2e/x.spec.ts',
          tags,
          tests: [{ status, tags }],
        })),
      },
    ],
  };
}

/** Monta uma pasta de trabalho e roda o conferidor. */
function check({ mode = '--required', body = '## Aceite\n\nnenhum, refatoração.\n', files = {}, vitest = [], playwright = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceite-'));
  const acceptDir = path.join(dir, 'aceite');
  fs.mkdirSync(acceptDir);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(acceptDir, name), text);
  fs.writeFileSync(path.join(dir, 'body.md'), body);
  fs.writeFileSync(path.join(dir, 'unit.json'), JSON.stringify(vitestReport(vitest)));
  fs.writeFileSync(path.join(dir, 'e2e.json'), JSON.stringify(playwrightReport(playwright)));
  const result = spawnSync(
    process.execPath,
    [
      CHECKER,
      mode,
      path.join(dir, 'body.md'),
      acceptDir,
      `vitest:${path.join(dir, 'unit.json')}`,
      `playwright:${path.join(dir, 'e2e.json')}`,
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: result.status, out: result.stdout + result.stderr };
}

const TICKET = { 'LUI-1.md': acceptanceFile([['LUI-1-CA1', 'teste HTTP']]) };

test('reprova um ID com marca de teste sem nenhum teste, e a mensagem diz como corrigir', () => {
  const { code, out } = check({ files: TICKET });
  assert.equal(code, 1);
  assert.match(out, /LUI-1-CA1 .*não tem nenhum teste/);
  assert.match(out, /ponha @LUI-1-CA1 no título/);
});

test('reprova um ID de critério num teste que não está em nenhum arquivo de aceite', () => {
  const { code, out } = check({ files: TICKET, vitest: [['@LUI-1-CA1 ok', 'passed'], ['@LUI-9-CA3 órfão', 'passed']] });
  assert.equal(code, 1);
  assert.match(out, /@LUI-9-CA3, que não está em nenhum arquivo de aceite/);
});

test('reprova um teste com ID de critério que foi pulado', () => {
  const { code, out } = check({ files: TICKET, vitest: [['@LUI-1-CA1 pulado', 'pending']] });
  assert.equal(code, 1);
  assert.match(out, /LUI-1-CA1: um teste com o ID dele foi pulado/);
});

test('reprova um teste com ID de critério que falhou', () => {
  const { code, out } = check({ files: TICKET, vitest: [['@LUI-1-CA1 quebrado', 'failed']] });
  assert.equal(code, 1);
  assert.match(out, /um teste com o ID dele falhou/);
});

test('um ID com marca de revisão humana ou de documento não exige teste', () => {
  const files = { 'LUI-1.md': acceptanceFile([['LUI-1-CA1', 'revisão humana'], ['LUI-1-CA2', 'documento']]) };
  assert.equal(check({ files }).code, 0);
});

test('reprova o teste apagado que cobria o critério de outro ticket', () => {
  const files = {
    'LUI-1.md': acceptanceFile([['LUI-1-CA1', 'teste HTTP']]),
    'LUI-2.md': acceptanceFile([['LUI-2-CA1', 'teste no Playwright']]),
  };
  const { code, out } = check({ files, vitest: [['@LUI-1-CA1 ok', 'passed']] });
  assert.equal(code, 1);
  assert.match(out, /LUI-2-CA1 \(docs\/aceite\/LUI-2.md\) não tem nenhum teste/);
});

test('passa quando todos os IDs de teste estão cobertos por testes que passaram, no Vitest e no Playwright', () => {
  const files = {
    'LUI-1.md': acceptanceFile([['LUI-1-CA1', 'teste HTTP'], ['LUI-1-CA2', 'teste no Playwright']]),
  };
  const { code, out } = check({
    files,
    vitest: [['@LUI-1-CA1 devolve 201', 'passed']],
    playwright: [['o Usuário envia', 'passed', ['@LUI-1-CA2']]],
  });
  assert.equal(code, 0, out);
  assert.match(out, /2 critério\(s\) com teste/);
});

test('reprova uma marca desconhecida no arquivo de aceite', () => {
  const files = { 'LUI-1.md': acceptanceFile([['LUI-1-CA1', 'teste manual']]) };
  const { code, out } = check({ files });
  assert.equal(code, 1);
  assert.match(out, /marca "teste manual" desconhecida/);
});

test('reprova o PR que altera apps/ sem a seção Aceite', () => {
  const { code, out } = check({ body: '## Resumo\n\ntexto\n' });
  assert.equal(code, 1);
  assert.match(out, /não tem a seção "Aceite"/);
});

test('passa o PR com "nenhum" e o motivo, e reprova "nenhum" sem motivo', () => {
  assert.equal(check({ body: '## Aceite\n\nNenhum: refatoração sem mudança de comportamento.\n' }).code, 0);
  const { code, out } = check({ body: '## Aceite\n\nnenhum\n' });
  assert.equal(code, 1);
  assert.match(out, /"nenhum" com o motivo/);
});

test('passa o PR que cita um arquivo de aceite existente e reprova o que cita um inexistente', () => {
  const ok = check({
    body: '## Aceite\n\n`docs/aceite/LUI-1.md`\n',
    files: { 'LUI-1.md': acceptanceFile([['LUI-1-CA1', 'revisão humana']]) },
  });
  assert.equal(ok.code, 0, ok.out);
  const missing = check({ body: '## Aceite\n\ndocs/aceite/LUI-7.md\n' });
  assert.equal(missing.code, 1);
  assert.match(missing.out, /docs\/aceite\/LUI-7.md, que não existe/);
});

test('sem a seção Aceite, o PR que não altera apps/ passa, mas a cobertura continua conferida', () => {
  assert.equal(check({ mode: '--optional', body: 'só documento' }).code, 0);
  assert.equal(check({ mode: '--optional', body: 'só documento', files: TICKET }).code, 1);
});

test('o ID num describe não cobre os testes de dentro dele, e a tag do Playwright vale com ou sem o @', () => {
  const report = vitestReport([['um teste sem relação', 'passed']]);
  report.testResults[0].assertionResults[0].fullName = '@LUI-1-CA1 grupo um teste sem relação';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceite-'));
  fs.mkdirSync(path.join(dir, 'aceite'));
  fs.writeFileSync(path.join(dir, 'aceite', 'LUI-1.md'), acceptanceFile([['LUI-1-CA1', 'teste HTTP']]));
  fs.writeFileSync(path.join(dir, 'body.md'), '## Aceite\n\nnenhum: teste.\n');
  fs.writeFileSync(path.join(dir, 'unit.json'), JSON.stringify(report));
  const run = () =>
    spawnSync(process.execPath, [CHECKER, '--required', path.join(dir, 'body.md'), path.join(dir, 'aceite'), `vitest:${path.join(dir, 'unit.json')}`], { encoding: 'utf8' });
  assert.equal(run().status, 1);
  assert.equal(check({ files: TICKET, playwright: [['o Usuário envia', 'passed', ['LUI-1-CA1']]] }).code, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('aceita título de critério com texto depois do ID, marca com ponto final e "nenhum" em negrito', () => {
  const files = { 'LUI-1.md': '## LUI-1-CA1 · Bloqueio na sexta tentativa\n\n- **Marca:** Teste HTTP.\n' };
  const { code, out } = check({ files, body: '## Aceite\n\n**nenhum**: refatoração.\n', vitest: [['@LUI-1-CA1 ok', 'passed']] });
  assert.equal(code, 0, out);
});

test('sem corpo de PR, o modo opcional confere só a cobertura, e o obrigatório reprova', () => {
  const run = (mode) =>
    spawnSync(process.execPath, [CHECKER, mode, '/nao/existe.md', '/nao/existe', 'vitest:/nao/existe.json'], { encoding: 'utf8' });
  // O relatório também falta, então os dois reprovam; a mensagem mostra qual falta apareceu primeiro.
  assert.match(run('--required').stdout, /corpo do pull request/);
  assert.doesNotMatch(run('--optional').stdout, /corpo do pull request/);
});

test('reprova o relatório ausente em vez de aprovar sem conferir', () => {
  const result = spawnSync(process.execPath, [CHECKER, '--optional', '/nao/existe.md', '/nao/existe', 'vitest:/x.json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
});
