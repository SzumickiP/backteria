import { listAccounts, login, NICK_RULES, register, type Account } from './accounts';

/**
 * Ekran konta (zwykły HTML nad grą): wybór istniejącego konta z listy albo utworzenie nowego (sam nick, bez hasła).
 * Wywołuje `onDone` po wyborze / utworzeniu konta.
 */
export function showAccountScreen(onDone: (acc: Account) => void): void {
  const root = document.createElement('div');
  root.id = 'account';
  root.innerHTML = `
    <form class="acc-card" novalidate>
      <h1>Backteria</h1>
      <div class="acc-list-wrap">
        <p class="acc-title">Wybierz konto</p>
        <div class="acc-list"></div>
      </div>
      <p class="acc-title">Nowe konto</p>
      <label>Nick
        <input name="nick" autocomplete="off" maxlength="16" />
      </label>
      <p class="acc-hint">${NICK_RULES}</p>
      <p class="acc-error" role="alert"></p>
      <button type="submit" class="acc-submit">Utwórz konto i graj</button>
      <p class="acc-note">Konta są zapisywane tylko w tej przeglądarce.</p>
    </form>`;
  document.body.appendChild(root);

  const form = root.querySelector('form')!;
  const nick = form.querySelector<HTMLInputElement>('input[name=nick]')!;
  const error = form.querySelector<HTMLElement>('.acc-error')!;
  const list = form.querySelector<HTMLElement>('.acc-list')!;
  const listWrap = form.querySelector<HTMLElement>('.acc-list-wrap')!;

  const finish = (result: Account | string) => {
    if (typeof result === 'string') {
      error.textContent = result;
      return;
    }
    root.remove();
    onDone(result);
  };

  const accounts = listAccounts();
  listWrap.style.display = accounts.length ? '' : 'none';
  for (const acc of accounts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'acc-item';
    b.textContent = `${acc.nick} · gry: ${acc.games}`;
    b.addEventListener('click', () => finish(login(acc.nick)));
    list.appendChild(b);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.textContent = '';
    finish(register(nick.value));
  });

  if (accounts.length === 0) nick.focus();
}
