import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

describe('ModelDetail', () => {
  it('shows the model with highlights and a working enquiry button', async () => {
    const user = userEvent.setup();
    renderApp('/models/luma-ev');
    expect(screen.getByRole('heading', { name: 'Luma EV' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Luma EV illustration' })).toBeInTheDocument();
    expect(screen.getByText(/Electric/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => li.closest('.highlights'))).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: "I'm interested" }));
    expect(screen.getByLabelText('Model')).toHaveValue('luma-ev');
  });

  it('unknown slug → not found', () => {
    renderApp('/models/nope');
    expect(screen.getByRole('heading', { name: /couldn't find that page/ })).toBeInTheDocument();
  });
});
