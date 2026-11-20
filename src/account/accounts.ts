import type { GameSummary } from '../events';
import type { SpeciesId } from '../species';

/**
 * Konta graczy zapisywane LOKALNIE w przeglądarce (localStorage).
 * Hasło nie jest przechowywane wprost — tylko skrót SHA-256 z losową solą.
 * Uwaga: to nie jest zabezpieczenie na poziomie serwera; konta działają tylko na tym urządzeniu.
 */

export interface BestResult {
  time: number;
  level: number;
  kills: number;
  missions: number;
}

export interface Account {
  nick: string;
  salt: string;
  hash: string;
  created: number;
  games: number;
  best: Partial<Record<SpeciesId, BestResult>>;
}

const ACCOUNTS_KEY = 'backteria.accounts';
const SESSION_KEY = 'backteria.session';

export const NICK_RULES = 'Nick: 3–16 znaków (litery, cyfry, _).';
export const PASSWORD_RULES = 'Hasło: co najmniej 6 znaków.';

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

function randomSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Brak WebCrypto (np. strona otwarta z pliku) — prosty skrót zastępczy.
  let h = 2166136261;
  for (const b of data) h = Math.imul(h ^ b, 16777619);
  return `fnv-${(h >>> 0).toString(16)}`;
}

export function validateNick(nick: string): string | undefined {
  const n = nick.trim();
  if (n.length < 3 || n.length > 16) return 'Nick musi mieć od 3 do 16 znaków.';
  if (!/^[\p{L}\p{N}_]+$/u.test(n)) return 'Nick może zawierać tylko litery, cyfry i _.';
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (password.length < 6) return 'Hasło musi mieć co najmniej 6 znaków.';
  return undefined;
}

/** Tworzy konto. Zwraca konto albo komunikat błędu. */
export async function register(nick: string, password: string): Promise<Account | string> {
  const err = validateNick(nick) ?? validatePassword(password);
  if (err) return err;
  const all = load();
  if (all[keyOf(nick)]) return 'Taki nick jest już zajęty.';
  const salt = randomSalt();
  const acc: Account = { nick: nick.trim(), salt, hash: await hashPassword(password, salt), created: Date.now(), games: 0, best: {} };
  all[keyOf(nick)] = acc;
  if (!save(all)) return 'Nie udało się zapisać konta (pamięć przeglądarki jest zablokowana).';
  setSession(acc.nick);
  return acc;
}

/** Logowanie. Zwraca konto albo komunikat błędu. */
export async function login(nick: string, password: string): Promise<Account | string> {
  const acc = load()[keyOf(nick)];
  if (!acc) return 'Nie ma konta o takim nicku.';
  if ((await hashPassword(password, acc.salt)) !== acc.hash) return 'Nieprawidłowe hasło.';
  setSession(acc.nick);
  return acc;
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
  const prev = acc.best[s.species];
  const isBest = !prev || s.time > prev.time;
  if (isBest) acc.best[s.species] = { time: s.time, level: s.level, kills: s.kills, missions: s.missions };
  save(all);
  return isBest;
}
