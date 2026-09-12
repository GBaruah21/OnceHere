/** Server-only configuration shared by Render and Vercel. */
function firstValue(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

export function getSupabaseUrl(): string | undefined {
  return firstValue(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL)?.replace(/\/$/, '');
}

export function getSupabaseSecret(): string | undefined {
  return firstValue(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.service_role
  );
}

export function getSessionSecret(): string | undefined {
  return firstValue(process.env.SESSION_SECRET, getSupabaseSecret());
}

export function getDeploymentProvider(): 'vercel' | 'render' | 'local' {
  if (process.env.VERCEL) return 'vercel';
  if (process.env.RENDER) return 'render';
  return 'local';
}

export function getRuntimeReadiness() {
  const supabase = Boolean(getSupabaseUrl() && getSupabaseSecret());
  const sessionSigning = Boolean(getSessionSecret());
  const objectStorage = [
    process.env.OBJECT_STORAGE_ENDPOINT,
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    process.env.OBJECT_STORAGE_BUCKET
  ].every((value) => Boolean(value?.trim()));

  return {
    ready: supabase && sessionSigning && objectStorage,
    provider: getDeploymentProvider(),
    services: { supabase, sessionSigning, objectStorage }
  };
}
