import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptRoot, '../src');
const sharedRoot = path.resolve(scriptRoot, '../../shared');
const candidates = file => [file, `${file}.ts`, `${file}.tsx`, `${file}.js`, path.join(file, 'index.ts')];
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@shared/')) {
    const target = path.resolve(sharedRoot, specifier.slice('@shared/'.length));
    const match = candidates(target).find(existsSync);
    if (match) return { url: pathToFileURL(match).href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const target = path.resolve(srcRoot, specifier.slice(2));
    const match = candidates(target).find(existsSync);
    if (match) return { url: pathToFileURL(match).href, shortCircuit: true };
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!path.extname(target)) {
      const match = candidates(target).find(existsSync);
      if (match) return { url: pathToFileURL(match).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, sourceMap: false, inlineSourceMap: false } });
    return { format: 'module', source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}