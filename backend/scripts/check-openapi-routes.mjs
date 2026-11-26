import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function routePath(routeRoot, file) {
  const relative = path.relative(routeRoot, path.dirname(file));
  const segments = relative === '.' ? [] : relative.split(path.sep);
  const converted = segments.map(segment => {
    const dynamic = /^\[([^.[\]]+)\]$/.exec(segment);
    if (dynamic) return `{${dynamic[1]}}`;
    if (/^\[/.test(segment)) throw new Error(`Unsupported dynamic route segment: ${segment}`);
    return segment;
  });
  return `/api${converted.length ? `/${converted.join('/')}` : ''}`;
}

async function routeFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await routeFiles(fullPath));
    else if (entry.isFile() && entry.name === 'route.ts') files.push(fullPath);
  }
  return files.sort();
}

export async function collectImplementedOperations(routeRoot) {
  const operations = new Set();
  const emptyHandlers = [];
  const exportPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;

  for (const file of await routeFiles(routeRoot)) {
    const source = await readFile(file, 'utf8');
    const pathName = routePath(routeRoot, file);
    let found = false;
    for (const match of source.matchAll(exportPattern)) {
      found = true;
      operations.add(`${match[1] ?? match[2]} ${pathName}`);
    }
    if (!found) emptyHandlers.push(path.relative(routeRoot, file));
  }

  return { files: (await routeFiles(routeRoot)).length, operations, emptyHandlers };
}

export function auditContract(implemented, document) {
  const documented = new Set();
  const missingSchemas = [];
  const incompleteOperations = [];

  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      const upperMethod = method.toUpperCase();
      if (!methods.has(upperMethod)) continue;
      const key = `${upperMethod} ${route}`;
      documented.add(key);
      if (!operation.operationId || !operation.summary || !Object.keys(operation.responses ?? {}).length) {
        incompleteOperations.push(`${key} (operationId, summary, or responses missing)`);
      }
      if (operation.requestBody) {
        const media = Object.values(operation.requestBody.content ?? {});
        if (!media.length || media.some(item => !item.schema)) missingSchemas.push(`${key} requestBody`);
      }
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        const content = Object.values(response.content ?? {});
        if (status.startsWith('2') && status !== '204' && (!content.length || content.some(item => !item.schema))) {
          missingSchemas.push(`${key} response ${status}`);
        }
        if ((status.startsWith('4') || status.startsWith('5')) && (!content.length || content.some(item => !item.schema))) {
          missingSchemas.push(`${key} error ${status}`);
        }
      }
    }
  }

  return {
    missingOperations: [...implemented].filter(operation => !documented.has(operation)).sort(),
    staleOperations: [...documented].filter(operation => !implemented.has(operation)).sort(),
    missingSchemas: [...new Set(missingSchemas)].sort(),
    incompleteOperations: incompleteOperations.sort(),
  };
}

function selfTest() {
  const document = {
    paths: {
      '/api/docs': {
        get: { operationId: 'getDocs', summary: 'Docs', responses: { 200: { content: { 'text/html': { schema: { type: 'string' } } } } } },
      },
      '/api/stale': {
        get: { operationId: 'stale', summary: 'Stale', responses: { 200: { content: { 'application/json': { schema: { type: 'object' } } } } } },
      },
    },
  };
  const result = auditContract(new Set(['GET /api/docs', 'POST /api/new']), document);
  if (result.missingOperations[0] !== 'POST /api/new' || result.staleOperations[0] !== 'GET /api/stale') {
    throw new Error('Route coverage self-test failed to detect missing and stale operations.');
  }
  const schemaResult = auditContract(new Set(), {
    paths: {
      '/api/bad': {
        post: { operationId: 'bad', summary: 'Bad', requestBody: { content: { 'application/json': {} } }, responses: { 200: { description: 'OK' }, 400: { description: 'Bad request' } } },
      },
    },
  });
  if (schemaResult.missingSchemas.length !== 3) throw new Error('Route coverage self-test failed to detect missing request and response schemas.');
  console.log('Route coverage self-test passed: missing routes, stale operations, and missing schemas are detected.');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const routeRoot = path.join(backendRoot, 'src', 'app', 'api');
  const contractPath = path.join(backendRoot, 'openapi', 'openapi.json');
  const inventory = await collectImplementedOperations(routeRoot);
  const document = JSON.parse(await readFile(contractPath, 'utf8'));
  const result = auditContract(inventory.operations, document);
  const errors = [
    ...inventory.emptyHandlers.map(file => `Route handler exports no HTTP method: ${file}`),
    ...result.missingOperations.map(operation => `Implemented operation lacks OpenAPI documentation: ${operation}`),
    ...result.staleOperations.map(operation => `OpenAPI operation has no implemented route: ${operation}`),
    ...result.incompleteOperations.map(item => `Incomplete operation: ${item}`),
  ];
  if (errors.length) {
    for (const error of errors) console.error(`ERROR ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`OpenAPI route coverage passed: ${inventory.files} route files, ${inventory.operations.size} methods, ${Object.keys(document.paths).length} paths.`);
    if (result.missingSchemas.length) {
      console.warn(`OpenAPI schema gaps remain documented for follow-up: ${result.missingSchemas.length} request/response/error bodies.`);
    }
  }
}
