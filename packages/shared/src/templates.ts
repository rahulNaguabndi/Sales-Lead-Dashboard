export const TEMPLATE_KEYS = [
  'first_contact',
  'follow_up',
  'test_drive_invite',
  'offer_share',
  'callback_confirm',
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATE_LANGS = ['de', 'fr', 'it', 'es', 'nl', 'pt', 'en'] as const;
export type TemplateLang = (typeof TEMPLATE_LANGS)[number];

export type TemplateVars = {
  firstName?: string;
  repFirstName?: string;
  dealership?: string;
  model?: string;
  offer?: string;
};

type Template = { subject: string; body: string };

export const TEMPLATES: Record<TemplateKey, Record<TemplateLang, Template>> = {
  first_contact: {
    de: {
      subject: 'Ihr Interesse am {model}',
      body: 'Hallo {firstName}, hier ist {repFirstName} von {dealership}. Danke für Ihr Interesse am {model}! Wann passt es Ihnen, dass ich Sie für die Details kontaktiere?',
    },
    fr: {
      subject: 'Votre intérêt pour la {model}',
      body: "Bonjour {firstName}, c'est {repFirstName} de {dealership}. Merci de votre intérêt pour la {model} ! Quand souhaitez-vous que je vous contacte pour les détails ?",
    },
    it: {
      subject: 'Il tuo interesse per la {model}',
      body: "Ciao {firstName}, sono {repFirstName} di {dealership}. Grazie per l'interesse per la {model}! Quando preferisci che ti contatti per i dettagli?",
    },
    es: {
      subject: 'Su interés en el {model}',
      body: 'Hola {firstName}, soy {repFirstName} de {dealership}. ¡Gracias por su interés en el {model}! ¿Cuándo prefiere que le contacte para darle los detalles?',
    },
    nl: {
      subject: 'Uw interesse in de {model}',
      body: 'Hallo {firstName}, met {repFirstName} van {dealership}. Bedankt voor uw interesse in de {model}! Wanneer mag ik u bellen voor de details?',
    },
    pt: {
      subject: 'O seu interesse no {model}',
      body: 'Olá {firstName}, sou {repFirstName} da {dealership}. Obrigado pelo interesse no {model}! Quando prefere que o contacte para os detalhes?',
    },
    en: {
      subject: 'Your interest in the {model}',
      body: "Hi {firstName}, it's {repFirstName} from {dealership}. Thanks for your interest in the {model}! When would you like me to get in touch with the details?",
    },
  },
  follow_up: {
    de: {
      subject: 'Nachfrage zum {model}',
      body: 'Hallo {firstName}, {repFirstName} von {dealership} hier. Ich wollte nachfragen, ob Sie noch Fragen zum {model} haben. Ich helfe gern weiter!',
    },
    fr: {
      subject: 'Suite à votre demande pour la {model}',
      body: "Bonjour {firstName}, {repFirstName} de {dealership}. Je reviens vers vous pour savoir si vous avez d'autres questions sur la {model}. Je reste à votre disposition !",
    },
    it: {
      subject: 'Seguito alla tua richiesta per la {model}',
      body: 'Ciao {firstName}, sono {repFirstName} di {dealership}. Ti scrivo per sapere se hai altre domande sulla {model}. Sono a tua disposizione!',
    },
    es: {
      subject: 'Seguimiento de su consulta sobre el {model}',
      body: 'Hola {firstName}, soy {repFirstName} de {dealership}. Le escribo para saber si tiene alguna otra pregunta sobre el {model}. ¡Quedo a su disposición!',
    },
    nl: {
      subject: 'Naar aanleiding van uw vraag over de {model}',
      body: 'Hallo {firstName}, {repFirstName} van {dealership}. Ik vraag me af of u nog vragen heeft over de {model}. Ik help u graag verder!',
    },
    pt: {
      subject: 'Seguimento do seu pedido sobre o {model}',
      body: 'Olá {firstName}, sou {repFirstName} da {dealership}. Escrevo para saber se tem mais questões sobre o {model}. Estou ao dispor!',
    },
    en: {
      subject: 'Following up on the {model}',
      body: "Hi {firstName}, it's {repFirstName} from {dealership}. I wanted to check whether you have any more questions about the {model}. Happy to help!",
    },
  },
  test_drive_invite: {
    de: {
      subject: 'Probefahrt mit dem {model}',
      body: 'Hallo {firstName}, möchten Sie den {model} bei {dealership} probefahren? Ich finde gern einen Termin, der Ihnen passt. Viele Grüße, {repFirstName}',
    },
    fr: {
      subject: 'Essai de la {model}',
      body: 'Bonjour {firstName}, souhaitez-vous essayer la {model} chez {dealership} ? Je peux vous proposer un créneau qui vous convient. Cordialement, {repFirstName}',
    },
    it: {
      subject: 'Prova su strada della {model}',
      body: 'Ciao {firstName}, vuoi provare la {model} presso {dealership}? Posso proporti un orario comodo per te. A presto, {repFirstName}',
    },
    es: {
      subject: 'Prueba del {model}',
      body: 'Hola {firstName}, ¿le gustaría probar el {model} en {dealership}? Puedo proponerle un horario que le venga bien. Un saludo, {repFirstName}',
    },
    nl: {
      subject: 'Proefrit met de {model}',
      body: 'Hallo {firstName}, wilt u de {model} proefrijden bij {dealership}? Ik plan graag een moment dat u uitkomt. Groet, {repFirstName}',
    },
    pt: {
      subject: 'Test drive do {model}',
      body: 'Olá {firstName}, gostaria de fazer um test drive do {model} na {dealership}? Posso sugerir um horário que lhe convenha. Cumprimentos, {repFirstName}',
    },
    en: {
      subject: 'Test drive the {model}',
      body: 'Hi {firstName}, would you like to test drive the {model} at {dealership}? I can find a time that suits you. Best, {repFirstName}',
    },
  },
  offer_share: {
    de: {
      subject: 'Ihr Angebot für den {model}',
      body: 'Hallo {firstName}, für den {model} habe ich ein Angebot für Sie: {offer}. Soll ich Ihnen die Details zusenden? {repFirstName}, {dealership}',
    },
    fr: {
      subject: 'Votre offre pour la {model}',
      body: "Bonjour {firstName}, j'ai une offre pour la {model} : {offer}. Souhaitez-vous que je vous envoie les détails ? {repFirstName}, {dealership}",
    },
    it: {
      subject: 'La tua offerta per la {model}',
      body: "Ciao {firstName}, ho un'offerta per la {model}: {offer}. Vuoi che ti mandi i dettagli? {repFirstName}, {dealership}",
    },
    es: {
      subject: 'Su oferta para el {model}',
      body: 'Hola {firstName}, tengo una oferta para el {model}: {offer}. ¿Le envío los detalles? {repFirstName}, {dealership}',
    },
    nl: {
      subject: 'Uw aanbieding voor de {model}',
      body: 'Hallo {firstName}, ik heb een aanbieding voor de {model}: {offer}. Zal ik u de details sturen? {repFirstName}, {dealership}',
    },
    pt: {
      subject: 'A sua oferta para o {model}',
      body: 'Olá {firstName}, tenho uma oferta para o {model}: {offer}. Quer que lhe envie os detalhes? {repFirstName}, {dealership}',
    },
    en: {
      subject: 'Your offer for the {model}',
      body: 'Hi {firstName}, I have an offer for the {model}: {offer}. Shall I send you the details? {repFirstName}, {dealership}',
    },
  },
  callback_confirm: {
    de: {
      subject: 'Rückruf bestätigt',
      body: 'Hallo {firstName}, ich bestätige meinen Rückruf zum {model}. Falls die Zeit nicht passt, schreiben Sie mir kurz. {repFirstName}, {dealership}',
    },
    fr: {
      subject: 'Rappel confirmé',
      body: "Bonjour {firstName}, je confirme mon appel concernant la {model}. Si l'horaire ne vous convient pas, écrivez-moi. {repFirstName}, {dealership}",
    },
    it: {
      subject: 'Richiamata confermata',
      body: "Ciao {firstName}, confermo la mia chiamata riguardo alla {model}. Se l'orario non va bene, scrivimi pure. {repFirstName}, {dealership}",
    },
    es: {
      subject: 'Llamada confirmada',
      body: 'Hola {firstName}, confirmo mi llamada sobre el {model}. Si la hora no le viene bien, escríbame. {repFirstName}, {dealership}',
    },
    nl: {
      subject: 'Terugbelafspraak bevestigd',
      body: 'Hallo {firstName}, ik bevestig mijn terugbelafspraak over de {model}. Past het tijdstip niet, stuur me dan een berichtje. {repFirstName}, {dealership}',
    },
    pt: {
      subject: 'Chamada confirmada',
      body: 'Olá {firstName}, confirmo a minha chamada sobre o {model}. Se a hora não lhe convier, escreva-me. {repFirstName}, {dealership}',
    },
    en: {
      subject: 'Callback confirmed',
      body: "Hi {firstName}, I'm confirming my call about the {model}. If the time doesn't work, just message me. {repFirstName}, {dealership}",
    },
  },
};

export type RenderedTemplate = { subject: string; body: string; langUsed: TemplateLang };

export function isTemplateLang(lang: string): lang is TemplateLang {
  return (TEMPLATE_LANGS as readonly string[]).includes(lang);
}

/** Unsupported languages fall back to English. */
export function resolveTemplateLang(lang: string): { lang: TemplateLang; fellBack: boolean } {
  return isTemplateLang(lang) ? { lang, fellBack: false } : { lang: 'en', fellBack: true };
}

/** `offer_share` needs an applicable offer to be usable. */
export function isTemplateAvailable(key: TemplateKey, vars: TemplateVars): boolean {
  return key !== 'offer_share' || !!vars.offer;
}

function fill(text: string, vars: TemplateVars): string {
  return text.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = (vars as Record<string, string | undefined>)[name];
    if (v === undefined && process.env.NODE_ENV !== 'production') {
      console.warn(`renderTemplate: unknown or missing variable "${name}"`);
    }
    return v ?? '';
  });
}

/** Pure, plain-text output. Unknown variables render as empty strings. */
export function renderTemplate(
  key: TemplateKey,
  lang: string,
  vars: TemplateVars,
): RenderedTemplate {
  const { lang: langUsed } = resolveTemplateLang(lang);
  const t = TEMPLATES[key][langUsed];
  return {
    subject: fill(t.subject, vars).replace(/\s+/g, ' ').trim(),
    body: fill(t.body, vars).replace(/ {2,}/g, ' ').trim(),
    langUsed,
  };
}
