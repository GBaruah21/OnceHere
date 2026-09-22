import { afterEach, describe, expect, it } from 'vitest';
import { getSessionSecret } from '../server/runtime-config';

const originalSessionSecret = process.env.SESSION_SECRET;
const originalTursoToken = process.env.TURSO_AUTH_TOKEN;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('SESSION_SECRET', originalSessionSecret);
  restore('TURSO_AUTH_TOKEN', originalTursoToken);
});

describe('runtime session signing', () => {
  it('prefers an explicit SESSION_SECRET', () => {
    process.env.SESSION_SECRET = 'explicit-session-secret';
    process.env.TURSO_AUTH_TOKEN = 'turso-token';
    expect(getSessionSecret()).toBe('explicit-session-secret');
  });

  it('derives a stable domain-separated secret from Turso when SESSION_SECRET is absent', () => {
    delete process.env.SESSION_SECRET;
    process.env.TURSO_AUTH_TOKEN = 'stable-turso-token-for-test';
    const first = getSessionSecret();
    const second = getSessionSecret();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);

    process.env.TURSO_AUTH_TOKEN = 'rotated-turso-token-for-test';
    expect(getSessionSecret()).not.toBe(first);
  });

  it('reports no signing secret only when both stable sources are absent', () => {
    delete process.env.SESSION_SECRET;
    delete process.env.TURSO_AUTH_TOKEN;
    expect(getSessionSecret()).toBeUndefined();
  });
});
