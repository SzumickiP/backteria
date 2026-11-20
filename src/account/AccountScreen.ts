import { login, NICK_RULES, PASSWORD_RULES, register, type Account } from './accounts';

/**
 * Ekran konta (zwykły HTML nad grą): logowanie lub tworzenie konta.
 * Wywołuje `onDone` po udanym zalogowaniu / rejestracji.
 */
export function showAccountScreen(onDone: (acc: Account) => void): void {
  const root = document.createElement('div');
  root.id = 'account';
  root.innerHTML = `
    <form class="acc-card" novalidate>
      <h1>Backteria</h1>
      <div class="acc-tabs" role="tablist">
        <button type="button" data-mode="register" class="active">Utwórz konto</button>
        <button type="button" data-mode="login">Zaloguj się</button>
      </div>
      <label>Nick
        <input name="nick" autocomplete="username" maxlength="16" required />
      </label>
      <label>Hasło
        <input name="password" type="password" autocomplete="new-password" required />
      </label>
      <label class="acc-confirm">Powtórz hasło
        <input name="confirm" type="password" autocomplete="new-password" />
      </label>
      <p class="acc-hint">${NICK_RULES} ${PASSWORD_RULES}</p>
      <p class="acc-error" role="alert"></p>
      <button type="submit" class="acc-submit">Utwórz konto i graj</button>
      <p class="acc-note">Konto jest zapisywane tylko w tej przeglądarce.</p>
    </form>`;
  document.body.appendChild(root);

  const form = root.querySelector('form')!;
  const nick = form.querySelector<HTMLInputElement>('input[name=nick]')!;
  const password = form.querySelector<HTMLInputElement>('input[name=password]')!;
  const confirm = form.querySelector<HTMLInputElement>('input[name=confirm]')!;
  const confirmRow = form.querySelector<HTMLElement>('.acc-confirm')!;
  const error = form.querySelector<HTMLElement>('.acc-error')!;
  const submit = form.querySelector<HTMLButtonElement>('.acc-submit')!;
  const tabs = form.querySelectorAll<HTMLButtonElement>('.acc-tabs button');
  let mode: 'register' | 'login' = 'register';

  const setMode = (m: 'register' | 'login') => {
    mode = m;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    confirmRow.style.display = m === 'register' ? '' : 'none';
    password.autocomplete = m === 'register' ? 'new-password' : 'current-password';
    submit.textContent = m === 'register' ? 'Utwórz konto i graj' : 'Zaloguj się i graj';
    error.textContent = '';
  };
  tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode as 'register' | 'login')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (mode === 'register' && password.value !== confirm.value) {
      error.textContent = 'Hasła nie są takie same.';
      return;
    }
    submit.disabled = true;
    const result = mode === 'register' ? await register(nick.value, password.value) : await login(nick.value, password.value);
    submit.disabled = false;
    if (typeof result === 'string') {
      error.textContent = result;
      return;
    }
    root.remove();
    onDone(result);
  });

  nick.focus();
}
