/**
 * Połączenie P2P (WebRTC DataChannel) bez własnego serwera: gracze wymieniają się krótkimi kodami
 * (ofertą i odpowiedzią), np. przez komunikator. Gospodarz liczy całą grę, goście wysyłają sterowanie.
 */

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

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const enc = (d: RTCSessionDescriptionInit): string => btoa(JSON.stringify({ t: d.type, s: d.sdp }));
const dec = (code: string): RTCSessionDescriptionInit => {
  const o = JSON.parse(atob(code.replace(/\s+/g, ''))) as { t: RTCSdpType; s: string };
  return { type: o.t, sdp: o.s };
};

/** Czeka, aż zbiorą się kandydaci ICE (kod ma zawierać wszystko — bez serwera sygnalizacyjnego). */
function gathered(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, 5000);
  });
}

export class NetLink {
  nick = '';
  open = false;
  closed = false;
  onMessage: (msg: ToHost | ToGuest) => void = () => {};
  onChange: () => void = () => {};
  private pc = new RTCPeerConnection(ICE);
  private ch?: RTCDataChannel;

  private attach(ch: RTCDataChannel): void {
    this.ch = ch;
    ch.onopen = () => {
      this.open = true;
      this.onChange();
    };
    ch.onclose = () => {
      this.open = false;
      this.closed = true;
      this.onChange();
    };
    ch.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data as string));
      } catch {
        /* uszkodzona wiadomość — pomijamy */
      }
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        this.open = false;
        this.closed = true;
        this.onChange();
      }
    };
  }

  /** Gospodarz: tworzy kod oferty dla jednego gościa. */
  async createOffer(): Promise<string> {
    this.attach(this.pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await gathered(this.pc);
    return enc(this.pc.localDescription!);
  }

  /** Gospodarz: przyjmuje kod odpowiedzi od gościa. */
  async acceptAnswer(code: string): Promise<void> {
    await this.pc.setRemoteDescription(dec(code));
  }

  /** Gość: przyjmuje kod oferty i zwraca kod odpowiedzi. */
  async joinOffer(code: string): Promise<string> {
    this.pc.ondatachannel = (e) => this.attach(e.channel);
    await this.pc.setRemoteDescription(dec(code));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await gathered(this.pc);
    return enc(this.pc.localDescription!);
  }

  send(msg: ToHost | ToGuest): void {
    if (this.ch?.readyState === 'open') this.ch.send(JSON.stringify(msg));
  }

  close(): void {
    this.closed = true;
    this.ch?.close();
    this.pc.close();
  }
}

/** Aktualne połączenia tej sesji (gospodarz: po jednym na gościa; gość: jedno — do gospodarza). */
export const net: { mode: NetMode; links: NetLink[] } = { mode: 'single', links: [] };

export function resetNet(): void {
  for (const l of net.links) l.close();
  net.links = [];
  net.mode = 'single';
}
