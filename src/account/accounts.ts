import type { GameSummary } from '../events';
import type { SpeciesId } from '../species';

/**
 * Konta graczy zapisywane LOKALNIE w przeglądarce (localStorage). Bez hasła — wystarczy nick.
 * Konta działają tylko na tym urządzeniu.
 */

export interface BestResult {
  time: number;
  level: number;
  kills: number;
  missions: number;
}

export interface Account {
  nick: string;
  /** pola ze starych kont z hasłem — już nieużywane */
  salt?: string;
  hash?: string;
  created: number;
  games: number;
  best: Partial<Record<SpeciesId, BestResult>>;
  /** zdobyte osiągnięcia: id → data zdobycia */
  achievements?: Record<string, number>;
  /** postacie, którymi gracz już grał */
  played?: SpeciesId[];
}

/** Zmienia konto i zapisuje je. */
export function updateAccount(nick: string, change: (acc: Account) => void): void {
  const all = load();
  const acc = all[keyOf(nick)];
  if (!acc) return;
  change(acc);
  save(all);
}

const ACCOUNTS_KEY = 'backteria.accounts';
const SESSION_KEY = 'backteria.session';

export const NICK_RULES = 'Nick: 3–16 znaków (litery, cyfry, _).';

function load(): Record<string, Account> {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '{}') as Record<string, Account>;
  } catch {
    return {};
  }
}

function save(all: Record<string, Account>): boolean {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

const keyOf = (nick: string) => nick.trim().toLowerCase();

export function validateNick(nick: string): string | undefined {
  const n = nick.trim();
  if (n.length < 3 || n.length > 16) return 'Nick musi mieć od 3 do 16 znaków.';
  if (!/^[\p{L}\p{N}_]+$/u.test(n)) return 'Nick może zawierać tylko litery, cyfry i _.';
  return undefined;
}

/** Tworzy konto. Zwraca konto albo komunikat błędu. */
export function register(nick: string): Account | string {
  const err = validateNick(nick);
  if (err) return err;
  const all = load();
  if (all[keyOf(nick)]) return 'Taki nick jest już zajęty.';
  const acc: Account = { nick: nick.trim(), created: Date.now(), games: 0, best: {} };
  all[keyOf(nick)] = acc;
  if (!save(all)) return 'Nie udało się zapisać konta (pamięć przeglądarki jest zablokowana).';
  setSession(acc.nick);
  return acc;
}

/** Wybór istniejącego konta z listy. */
export function login(nick: string): Account | string {
  const acc = load()[keyOf(nick)];
  if (!acc) return 'Nie ma konta o takim nicku.';
  setSession(acc.nick);
  return acc;
}

/** Wszystkie konta na tym urządzeniu (ostatnio utworzone na końcu). */
export function listAccounts(): Account[] {
  return Object.values(load()).sort((x, y) => x.created - y.created);
}

function setSession(nick: string): void {
  try {
    localStorage.setItem(SESSION_KEY, nick);
  } catch {
    /* sesja tylko w tej karcie */
  }
}

/** Konto zapamiętane z poprzedniej wizyty (jeśli istnieje). */
export function restoreSession(): Account | undefined {
  try {
    const nick = localStorage.getItem(SESSION_KEY);
    return nick ? load()[keyOf(nick)] : undefined;
  } catch {
    return undefined;
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nic */
  }
}

export function getAccount(nick: string): Account | undefined {
  return load()[keyOf(nick)];
}

/** Zapisuje wynik rozgrywki; rekord = najdłuższy czas przetrwania. Zwraca true, gdy to nowy rekord. */
export function recordResult(nick: string, s: GameSummary): boolean {
  const all = load();
  const acc = all[keyOf(nick)];
  if (!acc) return false;
  acc.games++;
  // Tryb „Martwy żywiciel” ma stały czas (10 min) — nie liczy się do rekordów przetrwania.
  if (s.area !== undefined) {
    save(all);
    return false;
  }
  const prev = acc.best[s.species];
  const isBest = !prev || s.time > prev.time;
  if (isBest) acc.best[s.species] = { time: s.time, level: s.level, kills: s.kills, missions: s.missions };
  save(all);
  return isBest;
}
