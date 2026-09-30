import { monotonicFactory } from 'ulid';
import { SeededRng } from './rng';

// Seeded ULID factory with its own PRNG, so ids are reproducible for a given SEED and id
// generation never consumes draws from the shared data rng.
let factory = monotonicFactory(() => 0.5);
let idRng = new SeededRng(0);

export function resetIds(seed: number): void {
  idRng = new SeededRng((seed ^ 0x9e3779b9) >>> 0);
  factory = monotonicFactory(() => idRng.next());
}

export function newId(timeMs: number): string {
  return factory(Math.round(timeMs));
}
