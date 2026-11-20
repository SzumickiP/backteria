import { getAccount, updateAccount } from './accounts';

/** Osiągnięcia — zdobywane w grze, zapisywane na koncie gracza. */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-blood', name: 'Pierwsza ofiara', description: 'Pokonaj pierwszego wroga' },
  { id: 'hunter', name: 'Łowca', description: 'Pokonaj 100 wrogów w jednej grze' },
  { id: 'survivor', name: 'Przetrwanie', description: 'Przetrwaj 3 minuty' },
  { id: 'veteran', name: 'Weteran', description: 'Przetrwaj 10 minut' },
  { id: 'level10', name: 'Ewolucja', description: 'Osiągnij poziom 10' },
  { id: 'colony', name: 'Kolonia', description: 'Miej naraz 5 komórek kolonii lub kopii' },
  { id: 'builder', name: 'Konstruktor', description: 'Dodaj 5 organelli do swojej komórki' },
  { id: 'architect', name: 'Architekt', description: 'Przerób komórkę ciała na budowlę' },
  { id: 'defender', name: 'Obrońca', description: 'Wykonaj zadanie' },
  { id: 'hero', name: 'Bohater organizmu', description: 'Wykonaj 3 zadania w jednej grze' },
  { id: 'anatomist', name: 'Anatom', description: 'Odwiedź wszystkie 4 układy: nerwowy, krwionośny, oddechowy i pokarmowy' },
  { id: 'tail', name: 'Na końcu ogona', description: 'Dotrzyj do ogona zwierzęcia' },
  { id: 'pandemic', name: 'Pandemia', description: 'Jako wirus zaraź 30 komórek w jednej grze' },
  { id: 'commander', name: 'Dowódca', description: 'Wydaj kolonii wszystkie 4 rodzaje rozkazów' },
  { id: 'giant-slayer', name: 'Pogromca olbrzymów', description: 'Pokonaj prątka albo makrofaga' },
  { id: 'both-sides', name: 'Dwie strony', description: 'Zagraj i bakterią, i wirusem' },
  { id: 'conqueror', name: 'Podbój', description: 'Jako wirus podbij cały organizm' },
  { id: 'friendship', name: 'Przyjaźń', description: 'Spotkaj przyjazną postać' },
  { id: 'nest-buster', name: 'Burzyciel gniazd', description: 'Zniszcz ognisko infekcji lub węzeł chłonny' },
];

export function hasAchievement(nick: string, id: string): boolean {
  return Boolean(getAccount(nick)?.achievements?.[id]);
}

/** Odblokowuje osiągnięcie. Zwraca jego definicję, jeśli zdobyte TERAZ (pierwszy raz). */
export function unlockAchievement(nick: string, id: string): AchievementDef | undefined {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return undefined;
  let fresh = false;
  updateAccount(nick, (acc) => {
    acc.achievements ??= {};
    if (!acc.achievements[id]) {
      acc.achievements[id] = Date.now();
      fresh = true;
    }
  });
  return fresh ? def : undefined;
}

export function achievementCount(nick: string): number {
  const got = getAccount(nick)?.achievements ?? {};
  return ACHIEVEMENTS.filter((a) => got[a.id]).length;
}
