import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('DemoToolbar', () => {
  it('is visible by default and hidden when disabled', () => {
    renderApp();
    expect(screen.getByRole('region', { name: 'Demo controls' })).toBeInTheDocument();
  });

  it('is hidden with VITE_SHOW_DEMO_TOOLBAR=false', () => {
    vi.stubEnv('VITE_SHOW_DEMO_TOOLBAR', 'false');
    renderApp();
    expect(screen.queryByRole('region', { name: 'Demo controls' })).not.toBeInTheDocument();
  });

  it('source select drives the next payload', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    renderApp();
    await user.selectOptions(screen.getByLabelText('Came from'), 'instagram');
    await user.click(screen.getAllByRole('button', { name: /I'm interested/ })[0]!);
    await user.type(screen.getByLabelText('First name'), 'A');
    await user.type(screen.getByLabelText('Last name'), 'B');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByRole('textbox', { name: 'Phone' }), '1511234567');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.source).toBe('INSTAGRAM');
    expect(body.sourceDetail).toBe('autumn-suv');
  });

  it('Prefill fills the form', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Prefill random buyer' }));
    await waitFor(() => expect(screen.getByLabelText('First name')).not.toHaveValue(''));
    expect(screen.getByLabelText('Email')).not.toHaveValue('');
  });

  it('Submit ×5 logs references (mock mode)', async () => {
    vi.stubEnv('VITE_MOCK_INTAKE', 'true');
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Submit ×5' }));
    await waitFor(() => expect(screen.getAllByText(/EDM-2026-\d{5}/)).toHaveLength(5), { timeout: 12000 });
  }, 20000);
});
