import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatEUR } from '@leaddesk/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';

describe('Home', () => {
  it('shows hero and six priced cards', () => {
    vi.stubEnv('VITE_SHOW_DEMO_TOOLBAR', 'false');
    renderApp();
    expect(screen.getByRole('heading', { name: 'Find your next drive' })).toBeInTheDocument();
    expect(screen.getAllByTestId('vehicle-card')).toHaveLength(6);
    expect(screen.getByText(`from ${formatEUR(3_890_000)}`.replace(/\s/g, ' '))).toBeInTheDocument();
  });

  it('filters by body and fuel client-side', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(within(screen.getByRole('group', { name: 'Fuel' })).getByRole('button', { name: 'Diesel' }));
    expect(screen.getAllByTestId('vehicle-card')).toHaveLength(3);
    await user.click(within(screen.getByRole('group', { name: 'Body type' })).getByRole('button', { name: 'Van' }));
    expect(screen.getAllByTestId('vehicle-card')).toHaveLength(1);
    await user.click(within(screen.getByRole('group', { name: 'Fuel' })).getByRole('button', { name: 'Electric' }));
    expect(screen.getByText('No models match these filters.')).toBeInTheDocument();
  });

  it('"I\'m interested" opens the sheet with the model preselected', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: "I'm interested in the Luma EV" }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toHaveValue('luma-ev');
  });
});
