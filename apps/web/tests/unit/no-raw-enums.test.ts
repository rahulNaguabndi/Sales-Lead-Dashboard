import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the shared label layer (@leaddesk/shared labels.ts): components must not format enum
 * values ad hoc ("WALK_IN".replace('_', ' ').toLowerCase()), which is how four different source
 * vocabularies and lowercase stage names reached the UI.
 */
const ROOT = join(__dirname, '../../components');
const AD_HOC = [
  /\.replace\(\s*['"]_['"]\s*,\s*['"] ['"]\s*\)/,
  /\.replace\(\s*\/_\/g\s*,\s*['"] ['"]\s*\)/,
];
// Generic text helpers that legitimately transform non-enum strings.
const ALLOWED = new Set(['components/audit/labels.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe('no ad-hoc enum formatting in components', () => {
  it('uses the shared label helpers instead', () => {
    const offenders = files(ROOT)
      .map((f) => f.split(sep).join('/'))
      .filter((f) => !ALLOWED.has(f.slice(f.indexOf('components/'))))
      .filter((f) => AD_HOC.some((re) => re.test(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
