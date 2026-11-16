import { readFile } from 'node:fs/promises';

let mongoUri;
try {
  const reference = process.env.MONGODB_URI_FILE;
  if (!reference) throw new Error();
  mongoUri = (await readFile(reference, 'utf8')).trim();
  if (!mongoUri) throw new Error();
} catch {
  console.error('notifications.worker.startup.error', 'MONGODB_URI_SECRET_UNAVAILABLE');
  process.exit(1);
}

process.env.MONGODB_URI = mongoUri;
try {
  await import('../src/bootstrap/run-notification-worker.ts');
} catch {
  console.error('notifications.worker.startup.error', 'WORKER_STARTUP_FAILED');
  process.exit(1);
}
