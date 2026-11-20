import { NetLink, net, resetNet, type NetMode } from './link';

/**
 * Ekran łączenia graczy (HTML nad grą). Bez serwera: gospodarz wysyła gościowi kod oferty,
 * gość odsyła kod odpowiedzi. Po połączeniu gospodarz startuje grę, a gość czeka na planszę.
 */
export function showLobby(nick: string, onStart: (mode: Exclude<NetMode, 'single'>) => void, onBack: () => void): void {
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
  const copy = (ta: HTMLTextAreaElement, btn: HTMLButtonElement) => {
    ta.select();
    void navigator.clipboard?.writeText(ta.value).then(() => (btn.textContent = 'Skopiowano ✓'));
  };

  const home = () => {
    resetNet();
    html(`
      <p class="acc-title">Gra wieloosobowa jako ${nick}</p>
      <button class="acc-submit" data-a="host">Utwórz grę (gospodarz)</button>
      <button class="acc-submit" data-a="join">Dołącz do gry</button>
      <button class="acc-second" data-a="back">← Wróć</button>
      <p class="acc-note">Gracze łączą się bezpośrednio (P2P) przez wymianę kodów — bez serwera. Gra liczy się na komputerze gospodarza.</p>`);
    q('[data-a=host]').addEventListener('click', host);
    q('[data-a=join]').addEventListener('click', join);
    q('[data-a=back]').addEventListener('click', () => {
      close();
      onBack();
    });
  };

  // ───────── gospodarz ─────────
  const host = () => {
    net.mode = 'host';
    html(`
      <p class="acc-title">Gospodarz — dodaj graczy</p>
      <div class="acc-list-wrap">
        <p class="acc-step">Połączeni: <span class="acc-who">nikt</span></p>
      </div>
      <p class="acc-step">1. Wyślij gościowi ten kod:</p>
      <textarea class="acc-offer" readonly placeholder="Generuję kod…"></textarea>
      <button class="acc-second acc-copy">Kopiuj kod</button>
      <p class="acc-step">2. Wklej kod odpowiedzi od gościa:</p>
      <textarea class="acc-answer" placeholder="Kod odpowiedzi"></textarea>
      <button class="acc-second acc-connect">Połącz gościa</button>
      <p class="acc-error" role="alert"></p>
      <button class="acc-submit acc-go" disabled>Rozpocznij grę</button>
      <button class="acc-second acc-back">← Wróć</button>`);
    const offer = q<HTMLTextAreaElement>('.acc-offer');
    const answer = q<HTMLTextAreaElement>('.acc-answer');
    const err = q('.acc-error');
    const go = q<HTMLButtonElement>('.acc-go');
    const who = q('.acc-who');
    let pending: NetLink | undefined;

    const refresh = () => {
      const ok = net.links.filter((l) => l.open);
      who.textContent = ok.length ? ok.map((l) => l.nick || 'gracz').join(', ') : 'nikt';
      go.disabled = ok.length === 0;
    };
    const newOffer = async () => {
      offer.value = '';
      answer.value = '';
      pending = new NetLink();
      const link = pending;
      link.onChange = refresh;
      link.onMessage = (m) => {
        if (m.t === 'hello') {
          link.nick = m.nick;
          refresh();
        }
      };
      try {
        offer.value = await link.createOffer();
      } catch {
        err.textContent = 'Nie udało się utworzyć kodu (przeglądarka nie obsługuje WebRTC?).';
      }
    };
    q('.acc-copy').addEventListener('click', () => copy(offer, q<HTMLButtonElement>('.acc-copy')));
    q('.acc-connect').addEventListener('click', async () => {
      err.textContent = '';
      if (!pending || !answer.value.trim()) return;
      try {
        await pending.acceptAnswer(answer.value);
        net.links.push(pending);
        q<HTMLButtonElement>('.acc-copy').textContent = 'Kopiuj kod';
        await newOffer(); // gotowy kod dla kolejnego gościa
      } catch {
        err.textContent = 'Kod odpowiedzi jest nieprawidłowy.';
      }
    });
    go.addEventListener('click', () => {
      net.links = net.links.filter((l) => l.open);
      pending?.close();
      close();
      onStart('host');
    });
    q('.acc-back').addEventListener('click', () => {
      pending?.close();
      home();
    });
    void newOffer();
  };

  // ───────── gość ─────────
  const join = () => {
    net.mode = 'guest';
    html(`
      <p class="acc-title">Dołączanie do gry</p>
      <p class="acc-step">1. Wklej kod od gospodarza:</p>
      <textarea class="acc-offer" placeholder="Kod od gospodarza"></textarea>
      <button class="acc-second acc-make">Utwórz kod odpowiedzi</button>
      <p class="acc-step">2. Odeślij gospodarzowi ten kod:</p>
      <textarea class="acc-answer" readonly></textarea>
      <button class="acc-second acc-copy">Kopiuj kod</button>
      <p class="acc-error" role="alert"></p>
      <button class="acc-second acc-back">← Wróć</button>`);
    const offer = q<HTMLTextAreaElement>('.acc-offer');
    const answer = q<HTMLTextAreaElement>('.acc-answer');
    const err = q('.acc-error');
    let link: NetLink | undefined;

    q('.acc-copy').addEventListener('click', () => copy(answer, q<HTMLButtonElement>('.acc-copy')));
    q('.acc-make').addEventListener('click', async () => {
      err.textContent = '';
      if (!offer.value.trim()) return;
      link?.close();
      link = new NetLink();
      const l = link;
      l.onChange = () => {
        if (!l.open) return;
        // Połączono — od tej chwili gość czeka w grze na planszę od gospodarza.
        l.send({ t: 'hello', nick });
        net.links = [l];
        close();
        onStart('guest');
      };
      try {
        answer.value = await l.joinOffer(offer.value);
        err.textContent = 'Czekam na połączenie — gospodarz musi wkleić Twój kod.';
      } catch {
        err.textContent = 'Kod gospodarza jest nieprawidłowy.';
      }
    });
    q('.acc-back').addEventListener('click', () => {
      link?.close();
      home();
    });
  };

  home();
}
