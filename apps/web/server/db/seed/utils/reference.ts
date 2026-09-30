let counter = 0;
let year = new Date().getUTCFullYear();

export function resetReferences(y = new Date().getUTCFullYear()): void {
  counter = 0;
  year = y;
}

/** Sequential human-readable reference: EDM-2026-00001, EDM-2026-00002, ... */
export function nextReference(y = year): string {
  counter += 1;
  return `EDM-${y}-${String(counter).padStart(5, '0')}`;
}

export const generateReference = nextReference;
