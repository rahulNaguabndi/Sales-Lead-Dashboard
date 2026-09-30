import { describe, expect, it } from 'vitest';
import {
  activeFilterKeys,
  clearFilters,
  lenientParams,
  patchParams,
  toggleCsv,
  toQueryString,
} from './inbox-params';

describe('lenientParams', () => {
  it('keeps valid values and drops bad or unknown ones', () => {
    expect(
      lenientParams({ stage: 'QUALIFIED', source: 'NOPE', page: 'abc', evil: '1', sort: 'newest' }),
    ).toEqual({ stage: 'QUALIFIED', sort: 'newest' });
  });
  it('drops search under 2 chars and takes the first of repeated params', () => {
    expect(lenientParams({ q: 'a' })).toEqual({});
    expect(lenientParams({ stage: ['NEW', 'WON'] })).toEqual({ stage: 'NEW' });
  });
  it('reads URLSearchParams', () => {
    expect(lenientParams(new URLSearchParams('stage=NEW,QUALIFIED&pageSize=30'))).toEqual({
      stage: 'NEW,QUALIFIED',
    });
  });
});

describe('toQueryString', () => {
  it('is order-independent and omits page=1', () => {
    expect(toQueryString({ source: 'FACEBOOK', stage: 'QUALIFIED', page: '1' })).toBe(
      'source=FACEBOOK&stage=QUALIFIED',
    );
    expect(toQueryString({ stage: 'QUALIFIED', source: 'FACEBOOK' })).toBe(
      toQueryString({ source: 'FACEBOOK', stage: 'QUALIFIED' }),
    );
  });
});

describe('patchParams / clearFilters', () => {
  it('resets the page on filter changes but not on page changes', () => {
    expect(patchParams({ page: '3', stage: 'NEW' }, { source: 'WEBSITE' })).toEqual({
      stage: 'NEW',
      source: 'WEBSITE',
    });
    expect(patchParams({ page: '3' }, { page: '4' })).toEqual({ page: '4' });
  });
  it('removes keys patched to undefined', () => {
    expect(patchParams({ stage: 'NEW' }, { stage: undefined })).toEqual({});
  });
  it('clear keeps the tab and sort', () => {
    const cleared = clearFilters({
      view: 'unassigned',
      sort: 'newest',
      stage: 'NEW',
      q: 'abc',
      page: '2',
    });
    expect(cleared).toEqual({ view: 'unassigned', sort: 'newest' });
    expect(activeFilterKeys({ stage: 'NEW', view: 'mine' })).toEqual(['stage']);
  });
});

describe('toggleCsv', () => {
  it('adds and removes values', () => {
    expect(toggleCsv(undefined, 'NEW')).toBe('NEW');
    expect(toggleCsv('NEW', 'WON')).toBe('NEW,WON');
    expect(toggleCsv('NEW,WON', 'NEW')).toBe('WON');
    expect(toggleCsv('NEW', 'NEW')).toBeUndefined();
  });
});
