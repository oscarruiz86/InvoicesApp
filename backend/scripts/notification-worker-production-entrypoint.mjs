try {
  await import('../src/bootstrap/run-notification-worker.ts');
} catch (error) {
  const knownCodes = new Set(['SECRET_UNAVAILABLE', 'MONGODB_CONFIGURATION_INVALID', 'MONGODB_CONNECTION_FAILED', 'NOTIFICATION_CONFIGURATION_INVALID', 'INVALID_ENCRYPTION_KEY', 'UNSUPPORTED_ENCRYPTION_KEY_VERSION', 'ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'EACCES', 'ENOENT', 'MODULE_NOT_FOUND', 'WORKER_CONFIGURATION_INVALID', 'WORKER_MONGODB_UNAVAILABLE', 'WORKER_PAYLOAD_KEY_UNAVAILABLE', 'WORKER_HEALTH_LISTENER_FAILED']);
  const knownNames = new Set(['ConfigurationError', 'NotificationConfigurationError', 'IdentityProfileUnavailable']);
  const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  const moduleError = error instanceof Error && (error.message.startsWith('Cannot find package') || error.message.startsWith('Cannot find module'));
  const missingSpecifier = moduleError ? /Cannot find (?:package|module) ['"]([^'"]+)['"]/.exec(error.message)?.[1] : undefined;
  const safeSpecifier = missingSpecifier && /^[@A-Za-z0-9_./-]+$/.test(missingSpecifier) ? missingSpecifier : undefined;
  const sourceLocation = error instanceof Error ? /(?:file:\/\/\/app\/|\/app\/)([^/\s]+\.(?:ts|mjs)):(\d+):(\d+)/.exec(error.stack ?? '') : undefined;
  const safeErrorName = error instanceof Error && /^[A-Za-z]+$/.test(error.name) ? error.name.toUpperCase() : undefined;
  const code = error instanceof Error && knownCodes.has(error.message) ? error.message
    : safeSpecifier ? `MODULE_NOT_FOUND_${safeSpecifier.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 80)}`
    : knownCodes.has(errorCode) ? errorCode
    : moduleError ? 'MODULE_NOT_FOUND'
    : sourceLocation ? `STARTUP_${sourceLocation[1].replace(/[^A-Za-z0-9_]/g, '_')}_${sourceLocation[2]}`
    : safeErrorName ? `STARTUP_ERROR_${safeErrorName}`
    : error instanceof Error && knownNames.has(error.name) ? error.name : 'WORKER_STARTUP_FAILED';
  console.error('notifications.worker.startup.error', code);
  process.exit(1);
}
