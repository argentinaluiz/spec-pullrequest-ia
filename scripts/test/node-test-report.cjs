// Repórter do `node:test` que grava o relatório no formato do Vitest, só com os testes e os totais:
// é o formato que o conferidor de aceite (scripts/check-acceptance.cjs) e o `check-report.cjs` leem,
// e assim eles continuam com dois formatos. O desenho está no docs/harness.md, seção "Testes do harness".
//
// Uso: node --test --test-reporter=<este arquivo> --test-reporter-destination=<relatório> <testes>

/** O estado no vocabulário do Vitest: o que o conferidor distingue é passou, falhou e pulado. */
function statusOf(event, passed) {
  if (!passed) return 'failed';
  if (event.skip) return 'pending';
  return event.todo ? 'todo' : 'passed';
}

module.exports = async function* nodeTestReport(source) {
  const files = new Map();
  for await (const { type, data } of source) {
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    // Os `describe` também chegam como eventos: o relatório só traz os testes.
    if (data.details?.type === 'suite') continue;
    const name = data.file ?? 'node:test';
    const results = files.get(name) ?? [];
    results.push({
      title: data.name,
      fullName: data.name,
      ancestorTitles: [],
      status: statusOf(data, type === 'test:pass'),
    });
    files.set(name, results);
  }
  const testResults = [...files].map(([name, assertionResults]) => ({ name, assertionResults }));
  const all = testResults.flatMap((file) => file.assertionResults);
  const count = (status) => all.filter((test) => test.status === status).length;
  yield JSON.stringify({
    numTotalTests: all.length,
    numFailedTests: count('failed'),
    numPendingTests: count('pending'),
    numTodoTests: count('todo'),
    testResults,
  });
};
