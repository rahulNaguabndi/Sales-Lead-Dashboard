import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// SC-004: permission logic lives only in server/policy/**. This guard fails on `role ===` / `role !==`
// comparisons anywhere else in apps/web. Allowlist (path fragments) is intentionally empty; add an entry
// here with a justification if a non-permission use (e.g. display formatting) ever needs one.
const ALLOWLIST: string[] = [];
const WEB_ROOT = path.resolve(__dirname, '../../..');
const SKIP_DIRS = new Set(['node_modules', '.next', 'policy', 'e2e', 'data']);
const PATTERN = /\brole\s*[!=]==?\s*['"`]/;

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

describe('no permission logic outside server/policy (SC-004)', () => {
  it('has no role comparisons in app code', () => {
    const files: string[] = [];
    walk(WEB_ROOT, files);
    const offenders = files
      .filter((f) => !ALLOWLIST.some((a) => f.replace(/\\/g, '/').includes(a)))
      .filter((f) => PATTERN.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(WEB_ROOT, f));
    expect(offenders).toEqual([]);
  });
});
