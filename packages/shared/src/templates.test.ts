import { describe, expect, it, vi } from 'vitest';
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  TEMPLATE_LANGS,
  isTemplateAvailable,
  renderTemplate,
  resolveTemplateLang,
} from './templates';

const vars = {
  firstName: 'Émile',
  repFirstName: 'Sofia',
  dealership: 'EuroDrive Motors',
  model: 'Metro Hatch',
  offer: '1.000 € off',
};

describe('template completeness (SC-002)', () => {
  it('has 7 languages x 5 keys', () => {
    expect(TEMPLATE_KEYS).toHaveLength(5);
    expect(TEMPLATE_LANGS).toHaveLength(7);
    for (const key of TEMPLATE_KEYS)
      for (const lang of TEMPLATE_LANGS) {
        expect(TEMPLATES[key][lang].body.length).toBeGreaterThan(10);
        expect(TEMPLATES[key][lang].subject.length).toBeGreaterThan(3);
      }
  });
  it('renders with no leftover placeholders', () => {
    for (const key of TEMPLATE_KEYS)
      for (const lang of TEMPLATE_LANGS) {
        const r = renderTemplate(key, lang, vars);
        expect(r.body).not.toMatch(/[{}]/);
        expect(r.subject).not.toMatch(/[{}]/);
        expect(r.body).not.toMatch(/<[^>]+>/);
        expect(r.langUsed).toBe(lang);
      }
  });
});

describe('renderTemplate', () => {
  it('matches the documented Italian sample', () => {
    expect(renderTemplate('first_contact', 'it', vars).body).toBe(
      "Ciao Émile, sono Sofia di EuroDrive Motors. Grazie per l'interesse per la Metro Hatch! Quando preferisci che ti contatti per i dettagli?",
    );
  });
  it('renders missing variables as empty strings and warns in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = renderTemplate('first_contact', 'en', { firstName: 'Ann' });
    expect(r.body).not.toMatch(/[{}]/);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('falls back to English for unsupported languages', () => {
    expect(resolveTemplateLang('da')).toEqual({ lang: 'en', fellBack: true });
    expect(resolveTemplateLang('it')).toEqual({ lang: 'it', fellBack: false });
    expect(renderTemplate('follow_up', 'pl', vars).langUsed).toBe('en');
  });
  it('disables offer_share without an offer', () => {
    expect(isTemplateAvailable('offer_share', {})).toBe(false);
    expect(isTemplateAvailable('offer_share', vars)).toBe(true);
    expect(isTemplateAvailable('follow_up', {})).toBe(true);
  });
});
