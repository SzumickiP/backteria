import { hostRoom, joinRoom, net, resetNet, type NetLink, type NetMode } from './link';

/** Link dla gościa: ta sama strona z kodem pokoju w adresie. */
export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?join=${code}`;
}

/** Kod pokoju z adresu (?join=KOD) — zużywa go, żeby odświeżenie strony nie dołączało ponownie. */
export function takeJoinCode(): string | undefined {
  const code = new URLSearchParams(location.search).get('join')?.trim().toUpperCase();
  if (!code) return undefined;
  try {
    history.replaceState(null, '', location.pathname);
  } catch {
    /* np. file:// — nieistotne */
  }
  return code;
}

/**
 * Ekran łączenia graczy (HTML nad grą). Gospodarz dostaje kod pokoju i link; gość wpisuje kod
 * albo wchodzi z linku. Po połączeniu gospodarz startuje grę, a gość czeka na planszę.
 */
export function showLobby(
  nick: string,
  onStart: (mode: Exclude<NetMode, 'single'>) => void,
  onBack: () => void,
  joinCode?: string,
): void {
  resetNet();
  const root = document.createElement('div');
  root.id = 'account';
  document.body.appendChild(root);
  const card = document.createElement('div');
  card.className = 'acc-card';
  root.appendChild(card);

  const close = () => root.remove();
  const html = (s: string) => (card.innerHTML = `<h1>Backteria</h1>${s}`);
  const q = <T extends HTMLElement>(sel: string) => card.querySelector<T>(sel)!;
  const copy = (text: string, btn: HTMLElement) => {
    void navigator.clipboard?.writeText(text).then(() => (btn.textContent = 'Skopiowano ✓'));
  };

  const home = () => {
    resetNet();
    html(`
      <p class="acc-title">Gra wieloosobowa jako ${nick}</p>
      <button class="acc-submit" data-a="host">Utwórz grę (gospodarz)</button>
      <label>Kod pokoju
        <input class="acc-code" maxlength="8" autocomplete="off" placeholder="np. K7TQ2" />
      </label>
      <button class="acc-submit" data-a="join">Dołącz do gry</button>
      <p class="acc-error" role="alert"></p>
      <button class="acc-second" data-a="back">← Wróć</button>
      <p class="acc-note">Gracze łączą się bezpośrednio (P2P). Gra liczy się na komputerze gospodarza.</p>`);
    q('[data-a=host]').addEventListener('click', host);
    q('[data-a=join]').addEventListener('click', () => join(q<HTMLInputElement>('.acc-code').value));
    q('[data-a=back]').addEventListener('click', () => {
      close();
      onBack();
    });
  };

  // ───────── gospodarz ─────────
  const host = async () => {
    net.mode = 'host';
    html(`
      <p class="acc-title">Gospodarz — czekam na graczy</p>
      <p class="acc-step">Kod pokoju:</p>
      <p class="acc-room" style="font:700 34px monospace;letter-spacing:6px;margin:0;text-align:center">…</p>
      <button class="acc-second acc-copy-link" disabled>Kopiuj link do gry</button>
      <p class="acc-step">Połączeni: <span class="acc-who">nikt</span></p>
      <p class="acc-error" role="alert"></p>
      <button class="acc-submit acc-go" disabled>Rozpocznij grę</button>
      <button class="acc-second acc-back">← Wróć</button>`);
    const who = q('.acc-who');
    const go = q<HTMLButtonElement>('.acc-go');
    const refresh = () => {
      const ok = net.links.filter((l) => l.open);
      who.textContent = ok.length ? ok.map((l) => l.nick || 'gracz').join(', ') : 'nikt';
      go.disabled = ok.length === 0;
    };
    q('.acc-back').addEventListener('click', home);
    go.addEventListener('click', () => {
      net.links = net.links.filter((l) => l.open);
      close();
      onStart('host');
    });
    try {
      const code = await hostRoom((link: NetLink) => {
        link.onChange = refresh;
        link.onMessage = (m) => {
          if (m.t === 'hello') {
            link.nick = m.nick;
            refresh();
          }
        };
        refresh();
      });
      q('.acc-room').textContent = code;
      const btn = q<HTMLButtonElement>('.acc-copy-link');
      btn.disabled = false;
      btn.addEventListener('click', () => copy(inviteLink(code), btn));
    } catch (e) {
      q('.acc-error').textContent = (e as Error).message;
    }
  };

  // ───────── gość ─────────
  const join = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      q('.acc-error').textContent = 'Wpisz kod pokoju.';
      return;
    }
    net.mode = 'guest';
    html(`
      <p class="acc-title">Dołączam do pokoju ${code}…</p>
      <p class="acc-error" role="alert"></p>
      <button class="acc-second acc-back">← Wróć</button>`);
    q('.acc-back').addEventListener('click', home);
    try {
      const link = await joinRoom(code);
      link.send({ t: 'hello', nick });
      net.links = [link];
      close();
      onStart('guest'); // gość czeka w grze na planszę od gospodarza
    } catch (e) {
      q('.acc-error').textContent = (e as Error).message;
    }
  };

  home();
  if (joinCode) void join(joinCode);
}
