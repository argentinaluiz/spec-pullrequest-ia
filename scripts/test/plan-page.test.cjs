// Testes da página de revisão do plano, pela interface que o scripts/verify.sh usa: as fontes do
// plano na entrada (o arquivo de aceite, o modelo das rotas, o changelog, os diffs e a mensagem
// proposta) e o HTML na saída. Rodam com o runner nativo do Node, dentro do contêiner `api`.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { build } = require('../plan-page.cjs');
const { parseAcceptanceFile } = require('../check-acceptance.cjs');
const { routeChanges } = require('../contract-view.cjs');
const { panel, text, snapshot } = require('./helpers.cjs');

const ACCEPTANCE = [
  '# Aceite do LUI-900',
  '',
  'Ticket de exemplo.',
  '',
  '## LUI-900-CA1',
  '',
  '**Marca:** teste HTTP',
  '',
  '**Cenário:** Dado um item, quando o Usuário o copia, então a cópia é criada.',
  '',
  '**Teste previsto:** testes de ponta a ponta da API, `items.e2e-spec.ts`, "copia o item @LUI-900-CA1".',
  '',
  '## LUI-900-CA2',
  '',
  '**Marca:** documento',
  '',
  '**Cenário:** Dado o LLD, quando se lê a seção de cópia, então ela descreve a cota.',
  '',
].join('\n');

test('mostra cada ID com a marca e o cenário, e o teste previsto ao expandir, lidos pelo parser do conferidor @LUI-173-CA3', () => {
  const { intro, criteria } = parseAcceptanceFile('LUI-900.md', ACCEPTANCE);

  assert.equal(intro, 'Ticket de exemplo.');
  assert.deepEqual(criteria, [
    {
      id: 'LUI-900-CA1',
      file: 'LUI-900.md',
      check: 'teste http',
      scenario: 'Dado um item, quando o Usuário o copia, então a cópia é criada.',
      plannedTest: 'testes de ponta a ponta da API, `items.e2e-spec.ts`, "copia o item @LUI-900-CA1".',
    },
    {
      id: 'LUI-900-CA2',
      file: 'LUI-900.md',
      check: 'documento',
      scenario: 'Dado o LLD, quando se lê a seção de cópia, então ela descreve a cota.',
      plannedTest: null,
    },
  ]);

  const aceite = panel(build({ ticket: 'LUI-900', origin: 'Montada da pasta de trabalho.', acceptance: ACCEPTANCE }), 'aceite');
  const rows = aceite.match(/<tr class="criterio"[\s\S]*?<\/tr>/g) ?? [];
  assert.equal(rows.length, 2, aceite);

  const [first, second] = rows;
  assert.match(text(first), /^LUI-900-CA1 teste HTTP Dado um item, quando o Usuário o copia, então a cópia é criada\./);
  assert.match(first, /<details><summary>Teste previsto<\/summary>[\s\S]*items\.e2e-spec\.ts[\s\S]*copia o item @LUI-900-CA1[\s\S]*<\/details>/);
  assert.match(text(second), /^LUI-900-CA2 documento Dado o LLD, quando se lê a seção de cópia, então ela descreve a cota\.$/);
  assert.doesNotMatch(second, /<details/);
});

const COPY_ROUTE = {
  post: {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: { 201: { description: '' } },
    security: [{ bearer: [] }],
  },
};

const SCHEMA_DIFF = [
  'diff --git a/apps/api/prisma/schema.prisma b/apps/api/prisma/schema.prisma',
  'index 1111111..2222222 100644',
  '--- a/apps/api/prisma/schema.prisma',
  '+++ b/apps/api/prisma/schema.prisma',
  '@@ -10,6 +10,8 @@ model Item {',
  '   name      String',
  '+  /// A cópia de onde o item saiu.',
  '+  copiedFrom String? @map("copied_from") @db.Uuid',
  '',
].join('\n');

const DOCS_DIFF = [
  'diff --git a/docs/lld.md b/docs/lld.md',
  'index 3333333..4444444 100644',
  '--- a/docs/lld.md',
  '+++ b/docs/lld.md',
  '@@ -1,3 +1,3 @@',
  ' # LLD',
  '-A cópia não existe.',
  '+A cópia reserva cota antes de gravar.',
  '',
].join('\n');

const MESSAGE = [
  'docs: plan the item copy (LUI-900)',
  '',
  'Acceptance file docs/aceite/LUI-900.md (CA1-CA2).',
  '',
  'Decision: the copy reserves quota before writing, so a full Disk fails early.',
  '',
  'Files and interfaces the implementation will touch:',
  '- apps/api/src/items/copy.service.ts: copy(itemId, parentId) -> Item.',
  '- apps/api/test/items.e2e-spec.ts (CA1).',
  '',
  'Data changes: none.',
  '',
].join('\n');

const SOURCES = {
  ticket: 'LUI-900',
  origin: 'Montada da pasta de trabalho.',
  acceptance: ACCEPTANCE.replace('quando o Usuário o copia', 'quando o Usuário o copia com o nome <script>alert(1)</script>'),
  routes: routeChanges(snapshot({}), snapshot({ '/v1/items/{id}/copies': COPY_ROUTE })),
  changelog: 'endpoint added POST /v1/items/{id}/copies\n',
  schemaDiff: SCHEMA_DIFF,
  docsDiff: DOCS_DIFF,
  message: MESSAGE,
};

test('monta a página com as seis abas, cada uma com o conteúdo da sua fonte @LUI-173-CA1', () => {
  const html = build(SOURCES);

  // As seis abas, nesta ordem, cada uma com o seu painel.
  const labels = [...html.matchAll(/<label for="tab-([a-z]+)">([^<]+)<\/label>/g)];
  assert.deepEqual(
    labels.map((match) => match[2]),
    ['Aceite', 'Contrato', 'Schema', 'Documentos', 'Arquivos e interfaces', 'Decisões'],
  );
  const ids = labels.map((match) => match[1]);
  assert.deepEqual(ids, ['aceite', 'contrato', 'schema', 'documentos', 'arquivos', 'decisoes']);

  // Cada aba traz o conteúdo da sua fonte.
  const aceite = text(panel(html, 'aceite'));
  assert.match(aceite, /LUI-900-CA1/);
  assert.match(aceite, /LUI-900-CA2/);
  const contrato = text(panel(html, 'contrato'));
  assert.match(contrato, /endpoint added POST \/v1\/items\/\{id\}\/copies/);
  assert.match(contrato, /Rota nova · POST \/v1\/items\/\{id\}\/copies · protegida \(bearer\)/);
  assert.match(panel(html, 'schema'), /<span class="mais">\+ {2}copiedFrom String\? @map\(&quot;copied_from&quot;\) @db\.Uuid<\/span>/);
  const documentos = panel(html, 'documentos');
  assert.match(documentos, /<h2><code>docs\/lld\.md<\/code><\/h2>/);
  assert.match(text(documentos), /\+A cópia reserva cota antes de gravar\./);
  const arquivos = panel(html, 'arquivos');
  assert.match(arquivos, /<li>apps\/api\/src\/items\/copy\.service\.ts: copy\(itemId, parentId\) -&gt; Item\.<\/li>/);
  assert.match(text(arquivos), /apps\/api\/test\/items\.e2e-spec\.ts \(CA1\)/);
  assert.match(text(arquivos), /Mudança de dados none\./);
  // O bloco que a mensagem não tem aparece como ausente, sem quebrar a página.
  assert.match(text(arquivos), /Ausente na mensagem proposta: falta o bloco Existing tests whose behavior changes:/);
  assert.match(text(panel(html, 'decisoes')), /the copy reserves quota before writing, so a full Disk fails early\./);

  // O que vem das fontes é texto, e não marcação.
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script/i);

  // Nenhum recurso externo: nem script, nem folha de estilo, nem imagem, nem fonte.
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /\b(src|href)\s*=/i);
  assert.doesNotMatch(html, /url\(|@import/i);

  // Sem diff de schema e sem documento, as abas dizem que nada muda.
  const unchanged = build({ ...SOURCES, schemaDiff: '', docsDiff: '' });
  assert.equal(text(panel(unchanged, 'schema')), 'O schema do Prisma não muda.');
  assert.equal(text(panel(unchanged, 'documentos')), 'Nenhum documento muda.');
});

test('separa o diff dos documentos pelo caminho de cada arquivo, com acento, espaço, aspas, apagado e binário', () => {
  const docsDiff = [
    'diff --git a/docs/decisões.md b/docs/decisões.md',
    'new file mode 100644',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/docs/decisões.md',
    '@@ -0,0 +1 @@',
    '+Nova decisão.',
    'diff --git a/docs/notas de b/ reunião.md b/docs/notas de b/ reunião.md',
    'index 1111111..2222222 100644',
    '--- a/docs/notas de b/ reunião.md\t',
    '+++ b/docs/notas de b/ reunião.md\t',
    '@@ -1 +1 @@',
    '-Antes.',
    '+Depois.',
    'diff --git a/docs/velho.md b/docs/velho.md',
    'deleted file mode 100644',
    'index 3333333..0000000',
    '--- a/docs/velho.md',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-Some.',
    'diff --git a/docs/figura nova.png b/docs/figura nova.png',
    'new file mode 100644',
    'index 0000000..4444444',
    'Binary files /dev/null and b/docs/figura nova.png differ',
    'diff --git "a/docs/com \\"aspas\\".md" "b/docs/com \\"aspas\\".md"',
    'index 5555555..6666666 100644',
    '--- "a/docs/com \\"aspas\\".md"',
    '+++ "b/docs/com \\"aspas\\".md"',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    'diff --git "a/docs/\\303\\241rvore.md" "b/docs/\\303\\241rvore.md"',
    'index 7777777..8888888 100644',
    '--- "a/docs/\\303\\241rvore.md"',
    '+++ "b/docs/\\303\\241rvore.md"',
    '@@ -1 +1 @@',
    '-c',
    '+d',
    '',
  ].join('\n');

  const documentos = panel(build({ ...SOURCES, docsDiff }), 'documentos');
  const files = [...documentos.matchAll(/<h2><code>([^<]*)<\/code><\/h2>/g)].map((match) => text(match[1]));
  assert.deepEqual(files, [
    'docs/decisões.md',
    'docs/notas de b/ reunião.md',
    'docs/velho.md',
    'docs/figura nova.png',
    'docs/com "aspas".md',
    'docs/árvore.md',
  ]);
  assert.match(text(documentos), /\+Nova decisão\./);
});

test('dentro de um trecho, a linha que parece cabeçalho é uma linha removida ou acrescentada', () => {
  const docsDiff = [
    'diff --git a/docs/lld.md b/docs/lld.md',
    'index 3333333..4444444 100644',
    '--- a/docs/lld.md',
    '+++ b/docs/lld.md',
    '@@ -1,3 +1,3 @@',
    ' # LLD',
    '--- item que sai',
    '+++ item que entra',
    '',
  ].join('\n');

  const documentos = panel(build({ ...SOURCES, docsDiff }), 'documentos');
  assert.match(documentos, /<span class="meta">--- a\/docs\/lld\.md<\/span>/);
  assert.match(documentos, /<span class="meta">\+\+\+ b\/docs\/lld\.md<\/span>/);
  assert.match(documentos, /<span class="menos">--- item que sai<\/span>/);
  assert.match(documentos, /<span class="mais">\+\+\+ item que entra<\/span>/);
});

test('lê cada bloco da mensagem do rótulo até o próximo rótulo ou as linhas de atribuição', () => {
  const message = [
    'docs: plan the item copy (LUI-900)',
    '',
    'Acceptance file docs/aceite/LUI-900.md (CA1-CA2).',
    '',
    'Decision: the copy reserves quota before writing.',
    '',
    'A second paragraph of the same decision, about the Disk.',
    '',
    'Decision: the copy keeps the name.',
    '',
    'Files and interfaces the implementation will touch:',
    '',
    '- apps/api/src/items/copy.service.ts: copy(itemId, parentId) -> Item.',
    '- apps/api/test/items.e2e-spec.ts (CA1).',
    '',
    'Existing tests whose behavior changes: none.',
    '',
    'Data changes: none.',
    '',
    'Co-Authored-By: Someone <someone@example.com>',
    'Claude-Session: https://example.com/session',
    '',
  ].join('\n');

  const html = build({ ...SOURCES, message });
  const decisions = panel(html, 'decisoes');
  const items = [...decisions.matchAll(/<ol class="decisoes">([\s\S]*?)<\/ol>/g)][0][1].match(/<li>[\s\S]*?<\/li>/g);
  assert.equal(items.length, 2, decisions);
  assert.match(items[0], /<p>the copy reserves quota before writing\.<\/p>\n<p>A second paragraph of the same decision, about the Disk\.<\/p>/);
  assert.equal(text(items[1]), 'the copy keeps the name.');
  assert.doesNotMatch(text(items[1]), /Files and interfaces/);

  const arquivos = panel(html, 'arquivos');
  assert.match(arquivos, /<ul><li>apps\/api\/src\/items\/copy\.service\.ts: copy\(itemId, parentId\) -&gt; Item\.<\/li><li>apps\/api\/test\/items\.e2e-spec\.ts \(CA1\)\.<\/li><\/ul>/);
  assert.match(text(arquivos), /Testes existentes cujo comportamento muda none\./);
  assert.match(text(arquivos), /Mudança de dados none\. *$/);
  assert.doesNotMatch(text(arquivos), /Co-Authored-By|Claude-Session/);
});

test('avisa no topo da página das mudanças fora do índice nos caminhos do plano, e não avisa sem elas', () => {
  const html = build({ ...SOURCES, pending: [' M docs/lld.md', '?? docs/<novo>.md'] });
  const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
  assert.match(header, /<div class="aviso" role="alert">/);
  assert.match(text(header), /Há mudanças fora do índice nos caminhos do plano\./);
  assert.match(header, /<li><code> M docs\/lld\.md<\/code><\/li><li><code>\?\? docs\/&lt;novo&gt;\.md<\/code><\/li>/);

  assert.doesNotMatch(build(SOURCES), /class="aviso"/);
});
