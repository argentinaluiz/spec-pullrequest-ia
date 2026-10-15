// Renderiza, em texto, o contrato completo de cada rota nova ou alterada entre dois snapshots da
// OpenAPI, no formato da seção 3 do docs/lld.md. É a parte da visão do contrato que o `oasdiff
// changelog` não dá: numa rota nova, ele só diz que ela foi acrescentada. O desenho está no
// docs/harness.md, etapa 8.
//
// Roda dentro do contêiner `api` (ver scripts/verify/api.sh):
//   node contract-view.cjs <snapshot da base> <snapshot novo>

const fs = require('node:fs');

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const LOCATIONS = { path: 'caminho', query: 'consulta', cookie: 'cookie' };
// O texto de documentação, que não muda o contrato. São os mesmos elementos que o `oasdiff diff`
// ignora no scripts/verify/api.sh.
const TEXT = new Set(['description', 'summary', 'example', 'examples']);
// Os objetos cujas chaves são nomes (de campo, de cabeçalho), e não palavras da OpenAPI: um campo
// chamado `description` é contrato.
const NAME_MAPS = new Set(['properties', 'headers', 'encoding']);

/** O nó para o qual um `$ref` local (`#/components/...`) aponta. */
function target(doc, ref) {
  return ref
    .slice(2)
    .split('/')
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, key) => node?.[key], doc);
}

/** O schema com o `$ref` local resolvido e o `allOf` juntado num objeto só. */
function resolve(doc, schema, seen = new Set()) {
  if (!schema) return {};
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { type: 'object' };
    return resolve(doc, target(doc, schema.$ref), new Set([...seen, schema.$ref]));
  }
  if (!schema.allOf) return schema;
  const { allOf, ...own } = schema;
  return [...allOf.map((part) => resolve(doc, part, seen)), own].reduce((merged, part) => ({
    ...merged,
    ...part,
    properties: { ...merged.properties, ...part.properties },
    required: [...(merged.required ?? []), ...(part.required ?? [])],
  }));
}

/**
 * As operações de um snapshot, por `MÉTODO caminho`, com os parâmetros do caminho e a segurança
 * global. Um parâmetro da operação com o mesmo nome e o mesmo `in` substitui o do caminho, como
 * manda a OpenAPI.
 */
function operations(doc) {
  const result = new Map();
  for (const [route, item] of Object.entries(doc?.paths ?? {})) {
    for (const method of METHODS.filter((name) => item[name])) {
      const op = item[method];
      const parameters = new Map();
      for (const param of [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p) => resolve(doc, p))) {
        parameters.set(`${param.in} ${param.name}`, param);
      }
      result.set(`${method.toUpperCase()} ${route}`, {
        ...op,
        parameters: [...parameters.values()],
        security: op.security ?? doc.security ?? [],
      });
    }
  }
  return result;
}

/**
 * Uma operação pronta para a comparação: os `$ref` resolvidos, o texto de documentação tirado e as
 * chaves em ordem. Duas operações com o mesmo contrato dão o mesmo resultado, mesmo que o renderizador
 * não mostre a diferença entre elas.
 */
function normalized(doc, node, names = false, seen = new Set()) {
  if (Array.isArray(node)) return node.map((item) => normalized(doc, item, false, seen));
  if (!node || typeof node !== 'object') return node;
  if (!names && typeof node.$ref === 'string') {
    if (seen.has(node.$ref)) return { $ref: node.$ref };
    return normalized(doc, target(doc, node.$ref), false, new Set([...seen, node.$ref]));
  }
  const out = {};
  for (const key of Object.keys(node).sort()) {
    if (!names && TEXT.has(key)) continue;
    out[key] = normalized(doc, node[key], !names && NAME_MAPS.has(key), seen);
  }
  return out;
}

/** As opções de um `oneOf` ou de um `anyOf`, quando o schema é uma união. */
function variants(schema) {
  return schema.oneOf ?? schema.anyOf;
}

/** O nome de uma opção da união: o do schema referenciado, ou o tipo dela. */
function variantName(doc, schema) {
  return schema.$ref ? schema.$ref.split('/').pop() : typeOf(doc, schema);
}

/** O tipo de um schema, em texto: `string (date-time)`, `array de objeto`, `string ou integer`. */
function typeOf(doc, schema) {
  const resolved = resolve(doc, schema);
  const union = variants(resolved);
  if (union) return union.map((option) => variantName(doc, option)).join(' ou ');
  const type = Array.isArray(resolved.type) ? resolved.type.join(' ou ') : resolved.type;
  if (resolved.enum) return `${type ?? 'valor'} (${resolved.enum.map((value) => JSON.stringify(value)).join(' | ')})`;
  if (resolved.const !== undefined) return `${type ?? 'valor'} (${JSON.stringify(resolved.const)})`;
  if (type === 'array') return `array de ${typeOf(doc, resolved.items)}`;
  if (resolved.properties) return 'objeto';
  if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
    return `objeto de chaves livres, com valor ${typeOf(doc, resolved.additionalProperties)}`;
  }
  return resolved.format ? `${type} (${resolved.format})` : (type ?? 'qualquer');
}

/** Um limite inferior ou superior, com o exclusivo da OpenAPI 3.0 (booleano) e o da 3.1 (número). */
function bound(schema, inclusive, exclusive, inclusiveText, exclusiveText) {
  if (typeof schema[exclusive] === 'number') return `${exclusiveText} ${schema[exclusive]}`;
  if (schema[inclusive] === undefined) return null;
  return `${schema[exclusive] === true ? exclusiveText : inclusiveText} ${schema[inclusive]}`;
}

/** As marcas e os limites de um schema, em texto. */
function limits(schema) {
  const parts = [];
  if (schema.deprecated) parts.push('obsoleto');
  if (schema.readOnly) parts.push('só na resposta');
  if (schema.writeOnly) parts.push('só na entrada');
  if (schema.nullable) parts.push('aceita null');
  if (schema.minLength !== undefined && schema.maxLength !== undefined) {
    parts.push(`de ${schema.minLength} a ${schema.maxLength} caracteres`);
  } else if (schema.minLength !== undefined) {
    parts.push(`ao menos ${schema.minLength} caractere(s)`);
  } else if (schema.maxLength !== undefined) {
    parts.push(`até ${schema.maxLength} caracteres`);
  }
  parts.push(
    ...[
      bound(schema, 'minimum', 'exclusiveMinimum', 'mínimo', 'maior que'),
      bound(schema, 'maximum', 'exclusiveMaximum', 'máximo', 'menor que'),
    ].filter(Boolean),
  );
  if (schema.multipleOf !== undefined) parts.push(`múltiplo de ${schema.multipleOf}`);
  if (schema.minItems !== undefined) parts.push(`ao menos ${schema.minItems} item(ns)`);
  if (schema.maxItems !== undefined) parts.push(`até ${schema.maxItems} item(ns)`);
  if (schema.uniqueItems) parts.push('sem itens repetidos');
  if (schema.pattern !== undefined) parts.push(`no padrão /${schema.pattern}/`);
  if (schema.default !== undefined) parts.push(`padrão ${JSON.stringify(schema.default)}`);
  return parts;
}

/** Uma linha de campo: `nome: tipo, obrigatório, limites`. O `extra` são as marcas do próprio parâmetro. */
function line(doc, name, schema, required, extra = {}) {
  const resolved = resolve(doc, schema);
  return [
    `${name}: ${typeOf(doc, schema)}`,
    required ? 'obrigatório' : 'opcional',
    ...limits({ ...resolved, deprecated: resolved.deprecated || extra.deprecated }),
  ].join(', ');
}

/**
 * Os campos de um objeto, um por linha, com os objetos aninhados e os itens das listas expandidos.
 * Numa união, os campos de cada opção vêm abaixo do nome dela.
 */
function fields(doc, schema, indent, seen = new Set()) {
  let resolved = resolve(doc, schema);
  if (resolved.type === 'array') resolved = resolve(doc, resolved.items);
  const union = variants(resolved);
  if (union) {
    return union.flatMap((option) => {
      const own = fields(doc, option, `${indent}  `, seen);
      return own.length ? [`${indent}Opção ${variantName(doc, option)}:`, ...own] : [];
    });
  }
  const required = new Set(resolved.required ?? []);
  return Object.entries(resolved.properties ?? {}).flatMap(([name, child]) => {
    const own = `${indent}${line(doc, name, child, required.has(name))}`;
    const key = JSON.stringify(child);
    if (seen.has(key)) return [own];
    return [own, ...fields(doc, child, `${indent}  `, new Set([...seen, key]))];
  });
}

/**
 * Os tipos de conteúdo de um corpo, juntando os que têm o mesmo schema: `[{ types, schema }]`.
 * Vazio quando o corpo não tem conteúdo.
 */
function contents(doc, body) {
  const groups = new Map();
  for (const [type, media] of Object.entries(body?.content ?? {})) {
    const key = JSON.stringify(normalized(doc, media.schema ?? {}));
    if (!groups.has(key)) groups.set(key, { types: [], schema: media.schema });
    groups.get(key).types.push(type);
  }
  return [...groups.values()];
}

/** Os `code` de um erro no formato do `ApiProblem`, de todos os tipos de conteúdo dele. */
function codes(doc, response) {
  const values = contents(doc, response).flatMap(
    ({ schema }) => resolve(doc, schema).properties?.code?.enum ?? [],
  );
  return values.length ? [...new Set(values)].join(', ') : 'sem code declarado';
}

function headers(doc, response, indent) {
  return Object.entries(response.headers ?? {}).map(([name, header]) => {
    const resolved = resolve(doc, header);
    return `${indent}Cabeçalho ${line(doc, name, resolved.schema, resolved.required, resolved)}`;
  });
}

/** A ordem dos status: numérica, com as faixas (`4XX`) depois dos status delas e o `default` no fim. */
function rank(status) {
  if (/^\d{3}$/.test(status)) return Number(status);
  if (/^[1-5]XX$/i.test(status)) return Number(status[0]) * 100 + 99.5;
  return Infinity;
}

/** Erro é o status 4xx ou 5xx, e o `default`, que cobre o que a rota não declara. */
function isError(status) {
  return /^[45]/.test(status) || status === 'default';
}

/**
 * O contrato completo de uma operação, no formato da seção 3 do LLD. Só traz o que o formato
 * descreve, então descrições, resumos, exemplos, o operationId e as tags não mudam o texto.
 */
function contract(doc, op) {
  const out = [];
  const schemes = op.security.flatMap((requirement) => Object.keys(requirement));
  out.push(`  Autenticação: ${schemes.length ? `protegida (${[...new Set(schemes)].join(', ')})` : 'pública'}`);
  if (op.deprecated) out.push('  Obsoleta (deprecated)');

  const inputs = op.parameters.filter((param) => param.in !== 'header');
  if (inputs.length) {
    out.push('  Parâmetros:');
    for (const param of inputs) {
      out.push(`    ${line(doc, `${param.name} (${LOCATIONS[param.in] ?? param.in})`, param.schema, param.required, param)}`);
    }
  }
  const inputHeaders = op.parameters.filter((param) => param.in === 'header');
  if (inputHeaders.length) {
    out.push('  Cabeçalhos de entrada:');
    for (const param of inputHeaders) out.push(`    ${line(doc, param.name, param.schema, param.required, param)}`);
  }

  const requestBody = resolve(doc, op.requestBody);
  for (const { types, schema } of contents(doc, requestBody)) {
    out.push(`  Corpo (${types.join(', ')}), ${requestBody.required ? 'obrigatório' : 'opcional'}:`);
    out.push(...fields(doc, schema, '    '));
  }

  const responses = Object.entries(op.responses ?? {})
    .map(([status, response]) => [status, resolve(doc, response)])
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  const success = responses.filter(([status]) => !isError(status));
  const errors = responses.filter(([status]) => isError(status));
  if (success.length) {
    out.push('  Sucesso:');
    for (const [status, response] of success) {
      const bodies = contents(doc, response);
      if (!bodies.length) out.push(`    ${status} (sem corpo)`);
      for (const { types, schema } of bodies) {
        out.push(`    ${status} (${types.join(', ')})`);
        out.push(...fields(doc, schema, '      '));
      }
      out.push(...headers(doc, response, '      '));
    }
  }
  if (errors.length) {
    out.push('  Erros:');
    for (const [status, response] of errors) {
      out.push(`    ${status}: ${codes(doc, response)}`);
      out.push(...headers(doc, response, '      '));
    }
  }
  return out.join('\n');
}

/**
 * A visão das rotas novas, alteradas e removidas entre dois snapshots. Uma rota conta como alterada
 * quando a operação, sem o texto de documentação, muda, e não só quando o texto renderizado muda:
 * assim, uma mudança que o renderizador não mostra ainda aparece, e o changelog do `oasdiff` a
 * detalha.
 */
function render(base, head) {
  const before = operations(base);
  const after = operations(head);
  const same = (key) =>
    JSON.stringify(normalized(base, before.get(key))) === JSON.stringify(normalized(head, after.get(key)));
  const blocks = [];
  for (const [key, op] of after) {
    if (!before.has(key)) {
      blocks.push(`Rota nova: ${key}\n${contract(head, op)}`);
    } else if (!same(key)) {
      blocks.push(`Rota alterada: ${key}\n${contract(head, op)}`);
    }
  }
  for (const key of before.keys()) {
    if (!after.has(key)) blocks.push(`Rota removida: ${key}`);
  }
  return `${blocks.length ? blocks.join('\n\n') : 'O contrato não muda.'}\n`;
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (require.main === module) {
  const [baseFile, headFile] = process.argv.slice(2);
  if (!baseFile || !headFile) {
    console.error('Uso: node contract-view.cjs <snapshot da base> <snapshot novo>');
    process.exit(2);
  }
  process.stdout.write(render(read(baseFile), read(headFile)));
}

module.exports = { render };
