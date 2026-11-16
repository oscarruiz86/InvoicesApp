import { createRequire } from 'node:module';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve('swagger-ui-dist/package.json'));
await mkdir('public/docs-assets', { recursive: true });
for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) await copyFile(path.join(source, file), path.join('public/docs-assets', file));
