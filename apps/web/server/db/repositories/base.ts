export type { Tx } from '../client';
// withTx is the ONLY sanctioned path for multi-row writes: it enforces a single atomic
// transaction boundary so a lead, its activity, and its audit row never diverge.
export { withTx } from '../client';
