// Confere o aceite dos tickets contra os relatórios das suítes: todo critério que exige teste (os
// arquivos de aceite) tem de ter um teste com o ID dele no título, e esse teste tem de ter rodado
// e passado. Confere também a seção `## Aceite` do corpo do pull request. O desenho está no
// docs/harness.md, e o formato do arquivo de aceite, no AGENTS.md da raiz.
//
// Roda dentro do contêiner `api`, lido pela entrada padrão (ver scripts/verify.sh):
//   node - <--required|--optional> <corpo do PR> <pasta dos arquivos de aceite> <vitest|playwright>:<relatório>...

const fs = require('node:fs');
const path = require('node:path');

const [mode, bodyFile, acceptDir, ...reportSpecs] = process.argv.slice(2);

const HEADING = /^#{1,6}\s*aceite\s*$/i;
const CRITERION_HEADING = /^#{1,6}\s*([A-Z][A-Z0-9]*-\d+-CA\d+)\b/;
const TEST_TOKEN = /@([A-Z][A-Z0-9]*-\d+-CA\d+)/g;
const ACCEPTANCE_PATH = /docs\/aceite\/([^\s`)\]]+\.md)/;

// As marcas de conferência. Só as três primeiras exigem teste.
const CHECKS = new Map([
  ['teste http', true],
  ['teste no playwright', true],
  ['teste de unidade', true],
  ['revisão humana', false],
  ['documento', false],
]);

const errors = [];
function error(message) {
  errors.push(message);
  // O formato `::error` vira anotação no PR quando roda no GitHub Actions.
  console.log(`::error title=Aceite::${message}`);
}

function finish() {
  if (errors.length > 0) {
    console.error(`\nAceite: ${errors.length} problema(s).`);
    process.exit(1);
  }
  process.exit(0);
}

/** Problema que impede de conferir o resto: registra e encerra o processo, sem retornar. */
function fatal(message) {
  error(message);
  finish();
}

function normalize(text) {
  return text.replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * O corpo da seção `## Aceite`: as linhas até o próximo título. Devolve `null` quando a seção
 * não existe.
 */
function acceptSection(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADING.test(line.trim()));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}\s/.test(line.trim()));
  return normalize((end === -1 ? rest : rest.slice(0, end)).join(' ').replace(/\*/g, ''));
}

/** Confere a seção `## Aceite` do corpo do PR e devolve o arquivo citado, se houver. */
function checkSection(section, files) {
  const cited = section.match(ACCEPTANCE_PATH);
  if (cited) {
    if (!files.has(cited[1])) {
      error(
        `a seção "Aceite" cita docs/aceite/${cited[1]}, que não existe. ` +
          'Cite o arquivo de aceite do ticket, criado pelo commit de plano.',
      );
    }
    return;
  }
  const none = section.match(/^nenhum\b[\s:.\-–—,]*(.*)$/i);
  if (!none || none[1].trim() === '') {
    error(
      'a seção "Aceite" não cita um arquivo de aceite nem diz "nenhum" com o motivo. ' +
        'Escreva o caminho do arquivo (docs/aceite/<ticket>.md) ou "nenhum" seguido do motivo (refatoração, harness, documento).',
    );
  }
}

/** Os critérios de um arquivo de aceite: ID e marca, lidos dos títulos `## <ticket>-CA<n>`. */
function parseAcceptanceFile(name, text) {
  const criteria = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.trim().match(CRITERION_HEADING);
    if (heading) {
      current = { id: heading[1], file: name, check: null };
      criteria.push(current);
      continue;
    }
    const check = current && line.match(/^\s*[-*]?\s*\*\*marca:\*\*\s*(.+)$/i);
    if (check) current.check = normalize(check[1]).toLowerCase().replace(/[.;]+$/, '');
  }
  for (const criterion of criteria) {
    if (!CHECKS.has(criterion.check)) {
      error(
        `${criterion.id} em docs/aceite/${name}: marca "${criterion.check ?? 'ausente'}" desconhecida. ` +
          'Use uma destas, na linha "**Marca:**": teste HTTP, teste no Playwright, teste de unidade, revisão humana ou documento.',
      );
    }
  }
  return criteria;
}

/** Todos os testes de um relatório do Vitest: o título (só o do próprio teste, e não o dos `describe`) e o estado. */
function vitestTests(report) {
  return report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      names: [test.title],
      status: test.status === 'passed' ? 'passed' : test.status === 'failed' ? 'failed' : 'skipped',
    })),
  );
}

/** Todos os testes de um relatório do Playwright: o título do próprio teste, as tags e o estado. */
function playwrightTests(report) {
  const walk = (suite, ancestors) => {
    const own = (suite.specs ?? []).map((spec) => {
      const statuses = spec.tests.map((test) => test.status);
      return {
        names: [spec.title, ...(spec.tags ?? []), ...spec.tests.flatMap((test) => test.tags ?? [])],
        status: statuses.includes('unexpected')
          ? 'failed'
          : statuses.every((status) => status === 'skipped')
            ? 'skipped'
            : 'passed',
      };
    });
    const nested = (suite.suites ?? []).flatMap((child) => walk(child, [...ancestors, child.title]));
    return [...own, ...nested];
  };
  // O primeiro nível é o arquivo, que não faz parte do nome do teste.
  return report.suites.flatMap((suite) => walk(suite, []));
}

/** Os IDs de critério que um teste cita, no título ou numa tag (que o relatório do Playwright pode trazer sem o `@`). */
function idsOf(test) {
  const ids = test.names.flatMap((name) => {
    const tag = String(name).match(/^@?([A-Z][A-Z0-9]*-\d+-CA\d+)$/);
    return tag ? [tag[1]] : [...String(name).matchAll(TEST_TOKEN)].map((match) => match[1]);
  });
  return new Set(ids);
}

if (!['--required', '--optional'].includes(mode) || !bodyFile || !acceptDir || reportSpecs.length === 0) {
  console.error(
    'Uso: node - <--required|--optional> <corpo do PR> <pasta de aceite> <tipo>:<relatório>...',
  );
  process.exit(2);
}

// Sem corpo de PR, só a cobertura é conferida. Onde a seção é exigida, a falta do corpo reprova.
const bodyExists = fs.existsSync(bodyFile);
if (!bodyExists && mode === '--required') {
  fatal(`o corpo do pull request (${bodyFile}) não foi encontrado. Sem ele, não há seção "Aceite" para conferir.`);
}

// Os arquivos de aceite de todos os tickets.
const files = new Map();
if (fs.existsSync(acceptDir)) {
  for (const name of fs.readdirSync(acceptDir).filter((entry) => entry.endsWith('.md'))) {
    files.set(name, fs.readFileSync(path.join(acceptDir, name), 'utf8'));
  }
}

// A seção "Aceite" do PR.
const section = acceptSection(bodyExists ? fs.readFileSync(bodyFile, 'utf8') : '');
if (section === null) {
  if (mode === '--required') {
    error(
      'o pull request altera código em apps/ e não tem a seção "Aceite". ' +
        'Acrescente "## Aceite" ao corpo do PR, citando o arquivo de aceite do ticket ou "nenhum" com o motivo.',
    );
  } else {
    console.log('Aceite: seção não exigida, porque o pull request não altera nada em apps/.');
  }
} else {
  checkSection(section, files);
}

// Os critérios, de todos os tickets.
const criteria = [...files].flatMap(([name, text]) => parseAcceptanceFile(name, text));
const known = new Set(criteria.map((criterion) => criterion.id));
const duplicated = criteria.find((criterion, index) => criteria.findIndex((other) => other.id === criterion.id) !== index);
if (duplicated) {
  error(`o ID ${duplicated.id} aparece em mais de um critério de aceite. Cada ID é único: renumere o novo critério.`);
}

// Os testes das suítes. Relatório ausente ou ilegível reprova, sem aprovar critério.
const tests = [];
for (const spec of reportSpecs) {
  const [, kind, file] = spec.match(/^(vitest|playwright):(.+)$/) ?? [];
  try {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    tests.push(...(kind === 'vitest' ? vitestTests(report) : playwrightTests(report)));
  } catch (cause) {
    error(`o relatório ${spec} não pôde ser lido (${cause.message}). Sem ele, o aceite não pode ser conferido.`);
  }
}
if (errors.length > 0) finish();

// Estado dos testes por ID.
const byId = new Map();
for (const test of tests) {
  for (const id of idsOf(test)) {
    byId.set(id, [...(byId.get(id) ?? []), test.status]);
  }
}

for (const id of byId.keys()) {
  if (!known.has(id)) {
    error(
      `um teste cita @${id}, que não está em nenhum arquivo de aceite. ` +
        'Confira o ID digitado ou acrescente o critério ao arquivo de aceite do ticket.',
    );
  }
}

let covered = 0;
for (const criterion of criteria.filter((entry) => CHECKS.get(entry.check))) {
  const statuses = byId.get(criterion.id) ?? [];
  if (statuses.length === 0) {
    error(
      `${criterion.id} (docs/aceite/${criterion.file}) não tem nenhum teste. ` +
        `Escreva o teste e ponha @${criterion.id} no título dele. Se um teste foi apagado, restaure-o.`,
    );
  } else if (statuses.some((status) => status !== 'passed')) {
    const state = statuses.includes('failed') ? 'falhou' : 'foi pulado';
    error(`${criterion.id}: um teste com o ID dele ${state}. Um critério só é coberto por teste que rodou e passou.`);
  } else {
    covered += 1;
    console.log(`${criterion.id}: coberto por ${statuses.length} teste(s).`);
  }
}

if (errors.length === 0) {
  console.log(`\nAceite: ${covered} critério(s) com teste, todos cobertos por teste que passou.`);
}
finish();
