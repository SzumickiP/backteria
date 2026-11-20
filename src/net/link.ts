import Peer, { type DataConnection } from 'peerjs';

export type NetMode = 'single' | 'host' | 'guest';

/** Wiadomości gość → gospodarz. */
export type ToHost =
  | { t: 'hello'; nick: string }
  | { t: 'in'; dx: number; dy: number };

/** Obiekt w migawce: [id, x, y, obrót, skalaX, skalaY, tekstura, odcień (-1 = brak), alfa, blend, głębokość, hp 0..1 (-1 = bez paska)]. */
export type SnapObj = [number, number, number, number, number, number, string, number, number, number, number, number];

/** Wiadomości gospodarz → gość. */
export type ToGuest =
  | { t: 'init'; animal: string; zone?: { x: number; y: number; r: number }; species: string }
  | {
      t: 'snap';
      /** id mojej komórki (-1 = jestem martwy) i sekundy do odrodzenia */
      you: number;
      respawn: number;
      hp: number;
      maxHp: number;
      level: number;
      time: number;
      players: string[];
      objs: SnapObj[];
    }
  | { t: 'over'; text: string };


/**
 * Połączenie P2P (WebRTC przez PeerJS): gospodarz dostaje krótki kod pokoju, a gość wpisuje go
 * (albo klika link). Publiczny broker PeerJS służy tylko do nawiązania połączenia — dane gry
 * płyną bezpośrednio między graczami. Gospodarz liczy grę, goście wysyłają sterowanie.
 */

const PREFIX = 'backteria-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomRoomCode(): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c;
}

export class NetLink {
  nick = '';
  open = false;
  closed = false;
  onMessage: (msg: ToHost | ToGuest) => void = () => {};
  onChange: () => void = () => {};

  constructor(private readonly conn: DataConnection) {
    const up = () => {
      this.open = true;
      this.onChange();
    };
    if (conn.open) up();
    else conn.on('open', up);
    const down = () => {
      this.open = false;
      this.closed = true;
      this.onChange();
    };
    conn.on('close', down);
    conn.on('error', down);
    conn.on('data', (d) => this.onMessage(d as ToHost | ToGuest));
  }

  send(msg: ToHost | ToGuest): void {
    if (this.open) this.conn.send(msg);
  }

  close(): void {
    this.closed = true;
    this.open = false;
    this.conn.close();
  }
}

/** Aktualne połączenia tej sesji (gospodarz: po jednym na gościa; gość: jedno — do gospodarza). */
export const net: { mode: NetMode; links: NetLink[]; peer?: Peer } = { mode: 'single', links: [] };

export function resetNet(): void {
  for (const l of net.links) l.close();
  net.links = [];
  net.peer?.destroy();
  net.peer = undefined;
  net.mode = 'single';
}

/** Gospodarz: otwiera pokój i wywołuje onGuest dla każdego dołączającego gościa. Zwraca kod pokoju. */
export function hostRoom(onGuest: (link: NetLink) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const tryOpen = (attempt: number) => {
      const code = randomRoomCode();
      const peer = new Peer(PREFIX + code);
      peer.on('open', () => {
        net.peer = peer;
        peer.on('connection', (conn) => {
          const link = new NetLink(conn);
          net.links.push(link);
          onGuest(link);
        });
        resolve(code);
      });
      peer.on('error', (e) => {
        peer.destroy();
        if ((e as { type?: string }).type === 'unavailable-id' && attempt < 5) tryOpen(attempt + 1);
        else if (!net.peer) reject(new Error('Nie można połączyć z serwerem pokoi.'));
      });
    };
    tryOpen(0);
  });
}

/** Gość: dołącza do pokoju o podanym kodzie. */
export function joinRoom(code: string): Promise<NetLink> {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    net.peer = peer;
    const fail = (msg: string) => {
      peer.destroy();
      if (net.peer === peer) net.peer = undefined;
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Nie udało się połączyć z gospodarzem (czas minął).'), 15000);
    peer.on('error', (e) =>
      fail((e as { type?: string }).type === 'peer-unavailable' ? 'Nie ma pokoju o takim kodzie.' : 'Błąd połączenia z serwerem pokoi.'),
    );
    peer.on('open', () => {
      const link = new NetLink(peer.connect(PREFIX + code.trim().toUpperCase(), { serialization: 'json' }));
      const check = () => {
        if (!link.open) return;
        clearTimeout(timer);
        resolve(link);
      };
      link.onChange = check;
      check();
    });
  });
}
