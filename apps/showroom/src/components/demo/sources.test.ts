import { describe, expect, it } from 'vitest';
import { loadSourceId, saveSourceId, selectionFor, SOURCE_STORAGE_KEY } from './sources';

describe('sources', () => {
  it('Instagram + autumn-suv → INSTAGRAM', () => {
    expect(selectionFor('instagram')).toEqual({ source: 'INSTAGRAM', sourceDetail: 'autumn-suv' });
  });
  it('unknown id falls back to WEBSITE', () => {
    expect(selectionFor('zzz')).toEqual({ source: 'WEBSITE' });
  });
  it('persists in localStorage', () => {
    expect(loadSourceId()).toBe('website');
    saveSourceId('facebook');
    expect(localStorage.getItem(SOURCE_STORAGE_KEY)).toBe('facebook');
    expect(loadSourceId()).toBe('facebook');
  });
});
