// Confere a tabela de aceite do corpo do pull request contra os relatórios das suítes: cada
// linha cita um teste, e ele tem de existir, ter rodado e ter passado. O desenho está no
// docs/harness.md, e o formato da tabela, no AGENTS.md da raiz.
//
// Roda dentro do contêiner `api`, lido pela entrada padrão (ver scripts/verify.sh):
//   node - <--required|--optional> <corpo do PR> <prefixo>=<vitest|playwright>:<relatório>...
//
// O prefixo é a pasta do repositório a que os caminhos do relatório são relativos.

const fs = require('node:fs');
const path = require('node:path');

const [mode, bodyFile, ...reportSpecs] = process.argv.slice(2);
const HEADING = /^#{1,6}\s*(tabela de aceite|acceptance table)\s*$/i;

const errors = [];
function error(message) {
  errors.push(message);
  // O formato `::error` vira anotação no PR quando roda no GitHub Actions.
  console.log(`::error title=Tabela de aceite::${message}`);
}

function finish() {
  if (errors.length > 0) {
    console.error(`\nTabela de aceite: ${errors.length} problema(s).`);
    process.exit(1);
  }
  process.exit(0);
}

/** Tira os acentos graves do Markdown e junta os espaços, para comparar nomes. */
function normalize(text) {
  return text.replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/** Separa as células de uma linha de tabela. `\|` é uma barra dentro da célula. */
function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => normalize(cell.replace(/\\\|/g, '|')));
}

/**
 * As linhas da primeira tabela depois do título, sem o cabeçalho e o separador.
 * Devolve `null` quando não há a seção e `'malformed'` quando a tabela não começa pelo
 * cabeçalho de três colunas e pela linha separadora. Sem essa conferência, uma tabela só
 * com linhas de critério perderia as duas primeiras, que ficariam sem verificação.
 */
function tableRows(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADING.test(line.trim()));
  if (start === -1) return null;

  const table = [];
  for (const line of lines.slice(start + 1)) {
    const isRow = line.trim().startsWith('|');
    if (isRow) table.push(line);
    else if (table.length > 0 || line.trim() !== '') break;
  }
  if (table.length === 0) return [];

  const [header, separator = []] = table.slice(0, 2).map(cells);
  const isSeparator = separator.length >= 3 && separator.every((cell) => /^:?-+:?$/.test(cell));
  if (header.length < 3 || !isSeparator) return 'malformed';

  return table.slice(2).map(cells);
}

/** Todos os testes de um relatório do Vitest: arquivo, nomes aceitos e estado. */
function vitestTests(report, prefix) {
  return report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      file: path.posix.join(prefix, path.relative(process.cwd(), file.name)),
      names: [test.title, test.fullName, [...test.ancestorTitles, test.title].join(' › ')],
      status: test.status === 'passed' ? 'passed' : test.status === 'failed' ? 'failed' : 'skipped',
    })),
  );
}

/** Todos os testes de um relatório do Playwright: arquivo, nomes aceitos e estado. */
function playwrightTests(report, prefix) {
  const walk = (suite, ancestors) => {
    const own = (suite.specs ?? []).map((spec) => {
      const statuses = spec.tests.map((test) => test.status);
      return {
        file: path.posix.join(prefix, spec.file),
        names: [spec.title, [...ancestors, spec.title].join(' '), [...ancestors, spec.title].join(' › ')],
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

if (!['--required', '--optional'].includes(mode) || !bodyFile || reportSpecs.length === 0) {
  console.error('Uso: node - <--required|--optional> <corpo do PR> <prefixo>=<tipo>:<relatório>...');
  process.exit(2);
}

if (!fs.existsSync(bodyFile)) {
  error(`o corpo do pull request (${bodyFile}) não foi encontrado. Sem ele, não há tabela para conferir.`);
  finish();
}

const rows = tableRows(fs.readFileSync(bodyFile, 'utf8'));

if (rows === null) {
  if (mode === '--optional') {
    console.log('Tabela de aceite: não exigida, porque o pull request não altera nada em apps/.');
    finish();
  }
  error(
    'o pull request altera código em apps/ e não tem a seção "Tabela de aceite". ' +
      'Acrescente-a ao corpo do PR, no formato descrito no AGENTS.md da raiz.',
  );
  finish();
}

if (rows === 'malformed') {
  error(
    'a tabela da seção "Tabela de aceite" está malformada. Ela começa pela linha de cabeçalho, ' +
      'com as três colunas (critério, arquivo de teste e nome do teste), seguida da linha separadora (| --- | --- | --- |).',
  );
  finish();
}

if (rows.length === 0) {
  error('a seção "Tabela de aceite" não tem nenhuma linha de critério.');
  finish();
}

// Só agora os relatórios são lidos: relatório ausente ou ilegível reprova, sem aprovar linha.
const tests = [];
for (const spec of reportSpecs) {
  const [, prefix, kind, file] = spec.match(/^(.+?)=(vitest|playwright):(.+)$/) ?? [];
  try {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    tests.push(...(kind === 'vitest' ? vitestTests(report, prefix) : playwrightTests(report, prefix)));
  } catch (cause) {
    error(`o relatório ${spec} não pôde ser lido (${cause.message}). Sem ele, a tabela não pode ser conferida.`);
  }
}
if (errors.length > 0) finish();

rows.forEach((row, index) => {
  const [criterion = '', file = '', name = ''] = row;
  const label = `Linha ${index + 1} ("${criterion || 'sem critério'}")`;

  if (!criterion || !file || !name) {
    error(`${label}: faltam colunas. Cada linha traz o critério, o arquivo de teste e o nome do teste.`);
    return;
  }

  const inFile = tests.filter((test) => test.file === file);
  if (inFile.length === 0) {
    error(`${label}: nenhum teste de ${file} rodou. Confira o caminho, a partir da raiz do repositório.`);
    return;
  }

  const matches = inFile.filter((test) => test.names.some((candidate) => normalize(candidate) === name));
  if (matches.length === 0) {
    error(`${label}: não existe em ${file} um teste chamado "${name}". Copie o nome exato do teste.`);
    return;
  }

  const bad = matches.find((test) => test.status !== 'passed');
  if (bad) {
    const state = bad.status === 'failed' ? 'falhou' : 'foi pulado';
    error(`${label}: o teste "${name}" ${state}. Um critério só é coberto por um teste que passou.`);
    return;
  }

  console.log(`${label}: coberto por "${name}" em ${file}.`);
});

if (errors.length === 0) {
  console.log(`\nTabela de aceite: ${rows.length} critério(s), todos cobertos por teste que passou.`);
}
finish();
