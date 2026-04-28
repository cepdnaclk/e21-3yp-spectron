import { render, screen, waitFor } from '@testing-library/react';
import App from '../../App';

describe('App routing', () => {
  it('renders without crashing and shows the Spectron sign-in experience', async () => {
    window.history.pushState({}, '', '/signin');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getAllByText(/spectron/i).length).toBeGreaterThan(0);
  });

  it('redirects protected routes to sign-in when no user token exists', async () => {
    window.history.pushState({}, '', '/controllers');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    });
  });
});
