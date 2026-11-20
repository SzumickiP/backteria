/**
 * Ustawienia gracza: przypisanie klawiszy do akcji (2 klawisze na akcję) i sterowanie myszą.
 * Zapisywane w localStorage (wspólne dla wszystkich kont na tym urządzeniu).
 */

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ability'
  | 'divide'
  | 'convert'
  | 'cloak'
  | 'orderFollow'
  | 'orderAttack'
  | 'orderHold'
  | 'orderForage'
  | 'editor'
  | 'map'
  | 'sound'
  | 'pause';

export const ACTIONS: Action[] = [
  'up', 'down', 'left', 'right', 'ability', 'divide', 'convert', 'cloak',
  'orderFollow', 'orderAttack', 'orderHold', 'orderForage', 'editor', 'map', 'sound', 'pause',
];

export const ACTION_NAMES: Record<Action, string> = {
  up: 'Ruch w górę',
  down: 'Ruch w dół',
  left: 'Ruch w lewo',
  right: 'Ruch w prawo',
  ability: 'Atak specjalny (też LPM)',
  divide: 'Podział (też PPM)',
  convert: 'Przerób komórkę',
  cloak: 'Maskowanie',
  orderFollow: 'Rozkaz: za mną',
  orderAttack: 'Rozkaz: atak',
  orderHold: 'Rozkaz: trzymaj pozycję',
  orderForage: 'Rozkaz: zbieraj / zarażaj',
  editor: 'Edytor komórki',
  map: 'Duża mapa',
  sound: 'Tryb dźwięku',
  pause: 'Pauza',
};

const DEFAULT_KEYS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  ability: ['KeyF', ''],
  divide: ['Space', ''],
  convert: ['KeyE', ''],
  cloak: ['KeyC', ''],
  orderFollow: ['KeyQ', ''],
  orderAttack: ['KeyG', ''],
  orderHold: ['KeyH', ''],
  orderForage: ['KeyT', ''],
  editor: ['KeyV', ''],
  map: ['Tab', ''],
  sound: ['KeyN', ''],
  pause: ['Escape', 'KeyP'],
};

/** Klawisze zarezerwowane (wybór mutacji/budowli, ekran końca gry) — nie można ich przypisać. */
export const RESERVED = new Set(['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3']);

interface Settings {
  keys: Record<Action, string[]>;
}

const STORAGE_KEY = 'backteria.settings';

function defaults(): Settings {
  return { keys: structuredClone(DEFAULT_KEYS) };
}

function load(): Settings {
  const s = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null;
    if (raw?.keys) for (const a of ACTIONS) if (Array.isArray(raw.keys[a])) s.keys[a] = [raw.keys[a][0] ?? '', raw.keys[a][1] ?? ''];
  } catch {
    /* uszkodzone ustawienia — domyślne */
  }
  return s;
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* brak pamięci — ustawienia tylko do odświeżenia strony */
  }
}

export function resetSettings(): void {
  const d = defaults();
  settings.keys = d.keys;
  saveSettings();
}

/** Czy klawisz (KeyboardEvent.code) jest przypisany do akcji. */
export function isKey(action: Action, code: string): boolean {
  return code !== '' && settings.keys[action].includes(code);
}

/**
 * Przypisuje klawisz do akcji (slot 0 lub 1). Jeśli klawisz był użyty gdzie indziej,
 * tamto przypisanie dostaje poprzedni klawisz tej akcji (zamiana) — nic nie ginie po cichu.
 */
export function bindKey(action: Action, slot: 0 | 1, code: string): void {
  const prev = settings.keys[action][slot];
  for (const a of ACTIONS) {
    settings.keys[a].forEach((c, i) => {
      if (c === code && !(a === action && i === slot)) settings.keys[a][i] = prev;
    });
  }
  settings.keys[action][slot] = code;
  saveSettings();
}

const NAMED: Record<string, string> = {
  Space: 'Spacja',
  Escape: 'Esc',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'P-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'P-Ctrl',
  AltLeft: 'L-Alt',
  AltRight: 'P-Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  CapsLock: 'Caps Lock',
};

/** Czytelna nazwa klawisza. */
export function keyName(code: string): string {
  if (!code) return '—';
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** Klawisze akcji jako tekst, np. „W / ↑”. */
export function keyLabel(action: Action): string {
  return settings.keys[action].filter(Boolean).map(keyName).join(' / ') || '—';
}
