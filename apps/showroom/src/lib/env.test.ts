import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies FR-015 defaults', () => {
    expect(parseEnv({})).toEqual({
      intakeUrl: 'http://localhost:3000/api/intake/leads',
      apiKey: 'showroom-dev-key',
      showDemoToolbar: true,
      mockIntake: false,
    });
  });
  it('parses booleans from strings', () => {
    const e = parseEnv({ VITE_SHOW_DEMO_TOOLBAR: 'false', VITE_MOCK_INTAKE: 'true' });
    expect(e.showDemoToolbar).toBe(false);
    expect(e.mockIntake).toBe(true);
  });
  it('throws on an invalid URL', () => {
    expect(() => parseEnv({ VITE_INTAKE_URL: 'nope' })).toThrow();
  });
});
