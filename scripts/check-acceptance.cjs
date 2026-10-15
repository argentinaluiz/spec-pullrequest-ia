// Confere o aceite dos tickets contra os relatórios das suítes: todo critério que exige teste (os
// arquivos de aceite) tem de ter um teste com o ID dele no título, e esse teste tem de ter rodado
// e passado. Confere também a seção `## Aceite` do corpo do pull request. O desenho está no
// docs/harness.md, e o formato do arquivo de aceite, na skill de plano (formatos/aceite.md).
//
// Roda no contêiner `api`, sobre o repositório montado (ver o `node_in_api`, no scripts/verify.sh):
//   node check-acceptance.cjs <--required|--optional> - <pasta dos tickets> <vitest|playwright>:<relatório>...
//   node check-acceptance.cjs --cited - <pasta dos tickets>
// O `-` é o corpo do PR, que chega pela entrada padrão; a entrada vazia conta como sem corpo. A
// pasta dos tickets vai relativa à raiz do repositório, onde o Node roda, porque é o caminho que o
// corpo do PR cita e o que as mensagens mostram. O arquivo de aceite de cada ticket fica na pasta
// dele, com o nome que a skill de plano define (`ACCEPTANCE_NAME`); o resto da pasta dos tickets não
// é lido. O segundo modo só imprime o arquivo de aceite citado na seção, para o verify.sh achar o
// commit de plano e a pasta do ticket, e nada quando a seção diz "nenhum", não existe ou não há corpo.
//
// O parser do arquivo de aceite (`parseAcceptanceFile`), as marcas (`CHECKS`) e o nome do arquivo de
// aceite são os da skill de plano (.claude/skills/plan-ticket/scripts/plan.cjs), que a página de
// revisão do plano também usa: os dois leem o aceite com as mesmas regras.

const fs = require('node:fs');
const path = require('node:path');

const { parseAcceptanceFile, CHECKS, ACCEPTANCE_NAME } = require('../.claude/skills/plan-ticket/scripts/plan.cjs');

const HEADING = /^#{1,6}\s*aceite\s*$/i;
const TEST_TOKEN = /@([A-Z][A-Z0-9]*-\d+-CA\d+)/g;
// O caminho do aceite de antes da pasta do ticket (`docs/aceite/<ticket>.md`), com o ticket.
const OLD_ACCEPTANCE_PATH = /docs\/aceite\/([^\s`)\]/]+)\.md/;

/** O texto como trecho literal de uma expressão regular. */
function literal(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** O caminho de um arquivo de aceite na pasta dos tickets dada, como o corpo do PR o cita. */
function acceptancePath(tickets) {
  return new RegExp(`${literal(tickets)}/[^\\s\`)\\]/]+/${literal(ACCEPTANCE_NAME)}`);
}

/** A pasta dos tickets como o corpo do PR e as mensagens a escrevem: sem `./` nem barra no fim. */
function ticketsFolder(dir) {
  return path.posix.normalize(dir).replace(/\/+$/, '');
}

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

/** Confere a seção `## Aceite` do corpo do PR contra os arquivos de aceite, pelo caminho de cada um. */
function checkSection(section, files, tickets) {
  const cited = section.match(acceptancePath(tickets));
  if (cited) {
    if (!files.has(cited[0])) {
      error(
        `a seção "Aceite" cita ${cited[0]}, que não existe. ` +
          'Cite o arquivo de aceite do ticket, criado pelo commit de plano.',
      );
    }
    return;
  }
  const old = section.match(OLD_ACCEPTANCE_PATH);
  if (old) {
    error(
      `a seção "Aceite" cita ${old[0]}, o caminho antigo, de antes do aceite ir para a pasta do ticket. ` +
        `Cite ${tickets}/${old[1]}/${ACCEPTANCE_NAME}.`,
    );
    return;
  }
  const none = section.match(/^nenhum\b[\s:.\-–—,]*(.*)$/i);
  if (!none || none[1].trim() === '') {
    error(
      'a seção "Aceite" não cita um arquivo de aceite nem diz "nenhum" com o motivo. ' +
        `Escreva o caminho do arquivo (${tickets}/<ticket>/${ACCEPTANCE_NAME}) ou "nenhum" seguido do motivo (refatoração, harness, documento).`,
    );
  }
}

/** Reprova os critérios com marca desconhecida, dizendo as marcas que valem. */
function unknownChecks(criteria) {
  const names = [...CHECKS.values()].map((check) => check.name);
  const valid = `${names.slice(0, -1).join(', ')} ou ${names.at(-1)}`;
  for (const criterion of criteria) {
    if (!CHECKS.has(criterion.check)) {
      error(
        `${criterion.id} em ${criterion.file}: marca "${criterion.check ?? 'ausente'}" desconhecida. ` +
          `Use uma destas, na linha "**Marca:**": ${valid}.`,
      );
    }
  }
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

/** A linha de comando: os dois modos do cabeçalho. */
function main([mode, body, ticketsDir, ...reportSpecs]) {
  if (mode === '--cited' && body === '-' && ticketsDir && reportSpecs.length === 0) {
    const cited = acceptSection(fs.readFileSync(0, 'utf8'))?.match(acceptancePath(ticketsFolder(ticketsDir)));
    if (cited) console.log(cited[0]);
    process.exit(0);
  }

  if (!['--required', '--optional'].includes(mode) || body !== '-' || !ticketsDir || reportSpecs.length === 0) {
    console.error(
      'Uso: node check-acceptance.cjs <--required|--optional> - <pasta dos tickets> <tipo>:<relatório>...\n' +
        '     node check-acceptance.cjs --cited - <pasta dos tickets>\n' +
        'O corpo do PR vai pela entrada padrão.',
    );
    process.exit(2);
  }

  // Os arquivos de aceite de todos os tickets, pelo caminho, que é como o corpo do PR os cita e as
  // mensagens os mostram.
  const tickets = ticketsFolder(ticketsDir);
  const files = new Map();
  if (fs.existsSync(tickets)) {
    for (const entry of fs.readdirSync(tickets, { withFileTypes: true }).filter((item) => item.isDirectory())) {
      const file = path.posix.join(tickets, entry.name, ACCEPTANCE_NAME);
      if (fs.existsSync(file)) files.set(file, fs.readFileSync(file, 'utf8'));
    }
  }

  // A seção "Aceite" do PR. Sem corpo, só a cobertura é conferida, e onde a seção é exigida a falta
  // dela reprova.
  const section = acceptSection(fs.readFileSync(0, 'utf8'));
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
    checkSection(section, files, tickets);
  }

  // Os critérios, de todos os tickets.
  const criteria = [...files].flatMap(([file, text]) => parseAcceptanceFile(file, text).criteria);
  unknownChecks(criteria);
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
  for (const criterion of criteria.filter((entry) => CHECKS.get(entry.check)?.test)) {
    const statuses = byId.get(criterion.id) ?? [];
    if (statuses.length === 0) {
      error(
        `${criterion.id} (${criterion.file}) não tem nenhum teste. ` +
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
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseAcceptanceFile, CHECKS };
