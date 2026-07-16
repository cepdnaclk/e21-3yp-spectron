import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SignIn from '../auth/SignIn';

const loginMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

describe('SignIn', () => {
  const getPasswordInput = () => screen.getByLabelText(/password/i, { selector: 'input' });

  beforeEach(() => {
    loginMock.mockReset();
  });

  it('renders email and password fields with a submit button', () => {
    render(
      <MemoryRouter>
        <SignIn />
      </MemoryRouter>
    );

    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(getPasswordInput()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('lets a user type credentials', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SignIn />
      </MemoryRouter>
    );

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'owner@spectron.test');
    await user.type(getPasswordInput(), 'secret123');

    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('owner@spectron.test');
    expect(getPasswordInput()).toHaveValue('secret123');
  });

  it('uses required-field validation for empty credentials', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SignIn />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByRole('textbox', { name: /email/i })).toBeInvalid();
    expect(getPasswordInput()).toBeInvalid();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('sends customer users to farms after sign in', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({});

    render(
      <MemoryRouter initialEntries={['/signin']}>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/farms" element={<div>Farms destination</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'owner@spectron.test');
    await user.type(getPasswordInput(), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/farms destination/i)).toBeInTheDocument();
  });
});
