/** Server-only configuration shared by Render and Vercel. */
function firstValue(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

export function getTursoDatabaseUrl(): string | undefined {
  return firstValue(process.env.TURSO_DATABASE_URL)?.replace(/\/$/, '');
}

export function getTursoAuthToken(): string | undefined {
  return firstValue(process.env.TURSO_AUTH_TOKEN);
}

export function getSessionSecret(): string | undefined {
  return firstValue(process.env.SESSION_SECRET);
}

export function getDeploymentProvider(): 'vercel' | 'render' | 'local' {
  if (process.env.VERCEL) return 'vercel';
  if (process.env.RENDER) return 'render';
  return 'local';
}

export function getRuntimeReadiness() {
  const turso = Boolean(getTursoDatabaseUrl() && getTursoAuthToken());
  const sessionSigning = Boolean(getSessionSecret());
  const objectStorage = [
    process.env.OBJECT_STORAGE_ENDPOINT,
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    process.env.OBJECT_STORAGE_BUCKET
  ].every((value) => Boolean(value?.trim()));

  return {
    ready: turso && sessionSigning && objectStorage,
    provider: getDeploymentProvider(),
    services: { turso, sessionSigning, objectStorage }
  };
}
