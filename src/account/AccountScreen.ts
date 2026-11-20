import { ACHIEVEMENTS } from './achievements';
import { listAccounts, login, NICK_RULES, register, type Account } from './accounts';

/**
 * Ekran konta (zwykły HTML nad grą): u góry pole na nick nowego gracza, poniżej lista dodanych graczy
 * z liczbą osiągnięć — kliknięcie gracza loguje go (bez hasła).
 * Wywołuje `onDone` po wyborze / utworzeniu konta.
 */
export function showAccountScreen(onDone: (acc: Account) => void): void {
  const root = document.createElement('div');
  root.id = 'account';
  root.innerHTML = `
    <form class="acc-card" novalidate>
      <h1>Backteria</h1>
      <label>Nowy gracz
        <input name="nick" autocomplete="off" maxlength="16" placeholder="Wpisz nazwę gracza" />
      </label>
      <p class="acc-hint">${NICK_RULES}</p>
      <p class="acc-error" role="alert"></p>
      <button type="submit" class="acc-submit">Dodaj gracza i graj</button>
      <div class="acc-list-wrap">
        <p class="acc-title">Gracze</p>
        <div class="acc-list"></div>
      </div>
      <p class="acc-note">Gracze są zapisywani tylko w tej przeglądarce.</p>
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
    const got = Object.keys(acc.achievements ?? {}).length;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'acc-item';
    b.textContent = `${acc.nick} · 🏆 ${got}/${ACHIEVEMENTS.length} · gry: ${acc.games}`;
    b.addEventListener('click', () => finish(login(acc.nick)));
    list.appendChild(b);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.textContent = '';
    finish(register(nick.value));
  });

  nick.focus();
}
