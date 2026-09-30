import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render';

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('First name'), 'Anna');
  await user.type(screen.getByLabelText('Last name'), 'Keller');
  await user.type(screen.getByLabelText('Email'), 'anna@example.com');
  await user.type(screen.getByRole('textbox', { name: 'Phone' }), '151 1234 5678');
}

const okBody = {
  reference: 'EDM-2026-12345',
  status: 'created',
  assignedTo: null,
  expectedContact: { channel: 'WHATSAPP', bestTime: 'ANYTIME' },
};

describe('enquiry flow (mock mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MOCK_INTAKE', 'true');
    vi.stubEnv('VITE_SHOW_DEMO_TOOLBAR', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('submits and lands on the thank-you page with a reference', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: "I'm interested in the Aurora SUV" }));
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(screen.getByRole('button', { name: /Sending/ })).toBeDisabled();
    expect(await screen.findByRole('heading', { name: 'Thanks Anna!' })).toHaveFocus();
    expect(screen.getByText(/EDM-2026-\d{5}/)).toBeInTheDocument();
    expect(screen.getByText('What happens next')).toBeInTheDocument();
  });
});

describe('ChannelTiles and dependent requirements', () => {
  beforeEach(() => vi.stubEnv('VITE_SHOW_DEMO_TOOLBAR', 'false'));
  afterEach(() => vi.unstubAllEnvs());

  it('is a radio group with arrow-key navigation, default WhatsApp', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    const group = screen.getByRole('radiogroup', { name: 'Preferred contact method' });
    expect(group).toBeInTheDocument();
    const wa = screen.getByRole('radio', { name: 'WhatsApp' });
    expect(wa).toBeChecked();
    wa.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Call' })).toBeChecked();
  });

  it('Email channel makes email required; phone channels make phone required', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await user.type(screen.getByLabelText('First name'), 'A');
    await user.type(screen.getByLabelText('Last name'), 'B');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText('A phone number is needed for this contact method.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Email' }));
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByRole('textbox', { name: 'Phone' }), '1511234567');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText('Email is needed so we can contact you there.')).toBeInTheDocument();
  });

  it('country drives dial code and language, keeping digits', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await user.type(screen.getByRole('textbox', { name: 'Phone' }), '123456');
    await user.selectOptions(screen.getByLabelText('Country'), 'FR');
    expect(screen.getByLabelText('Dial code')).toHaveValue('+33');
    expect(screen.getByLabelText('Language')).toHaveValue('fr');
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveValue('123456');
    expect(screen.getByLabelText('Best time to reach you')).toHaveValue('ANYTIME');
  });
});

describe('errors', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('VITE_MOCK_INTAKE', 'false');
    vi.stubEnv('VITE_SHOW_DEMO_TOOLBAR', 'false');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it('both email and phone empty → combined message', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await user.type(screen.getByLabelText('First name'), 'A');
    await user.type(screen.getByLabelText('Last name'), 'B');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    const msg = await screen.findByText('Please give us an email or phone number.');
    expect(msg).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', msg.id);
  });

  it('blur on an invalid email shows an inline error', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.tab();
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
  });

  it('server 400 shows field errors next to the fields', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      res(400, { error: { code: 'VALIDATION_ERROR', fields: [{ path: 'email', message: 'Email already blocked' }] } }),
    );
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText('Email already blocked')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('5xx shows a banner; Retry keeps values and reuses the Idempotency-Key', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(201, okBody));
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText("We couldn't send your enquiry. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Anna');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Thanks Anna!' })).toBeInTheDocument();
    const keys = fetchMock.mock.calls.map((c) => c[1].headers['Idempotency-Key']);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });

  it.each([
    [429, /Too many enquiries/],
    [413, /too large/],
    [401, /misconfigured/],
  ])('status %i shows its banner', async (status, text) => {
    const user = userEvent.setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(res(status as number));
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText(text as RegExp)).toBeInTheDocument();
    if (status === 401) expect(console.warn).toHaveBeenCalled();
  });

  it('keeps the draft when the sheet is closed and reopened', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await user.type(screen.getByLabelText('First name'), 'Berta');
    await user.click(screen.getByRole('button', { name: 'Close enquiry form' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[1]!);
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveValue('Berta'));
  });
});
