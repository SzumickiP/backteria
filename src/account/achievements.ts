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
  { id: 'slayer30', name: 'Rozgrzewka', description: 'Pokonaj 30 wrogów w jednej grze' },
  { id: 'exterminator', name: 'Eksterminator', description: 'Pokonaj 300 wrogów w jednej grze' },
  { id: 'survivor5', name: 'Wytrwały', description: 'Przetrwaj 5 minut w jednej grze' },
  { id: 'hard-mode', name: 'Twardziel', description: 'Przetrwaj 5 minut w trybie Trudnym (wybierz go w menu)' },
  { id: 'level5', name: 'Rozwój', description: 'Osiągnij poziom 5' },
  { id: 'level20', name: 'Mistrz ewolucji', description: 'Osiągnij poziom 20' },
  { id: 'colony10', name: 'Rój', description: 'Miej naraz 10 komórek kolonii lub kopii' },
  { id: 'builder10', name: 'Inżynier komórki', description: 'Dodaj 10 organelli do swojej komórki' },
  { id: 'missions5', name: 'Zawodowiec', description: 'Wykonaj 5 zadań w jednej grze' },
  { id: 'mother', name: 'Matka kolonii', description: 'Jako bakteria wykonaj wielką misję „Mnożenie się” (pojawia się losowo w zadaniach)' },
  { id: 'boss-slayer', name: 'Pogromca bossa', description: 'Pokonaj bossa (pojawia się od 8. poziomu, w losowym miejscu mapy — szukaj czerwonego znacznika)' },
  { id: 'brain-slayer', name: 'Pogromca Mózgu', description: 'Jako wirus pokonaj Mózg Gospodarza w zamkniętej arenie (im więcej zarażonych narządów, tym słabszy)' },
  { id: 'brain-fast', name: 'Błyskawiczny cios', description: 'TRUDNE: Pokonaj Mózg Gospodarza w mniej niż 90 sekund od zamknięcia areny' },
  { id: 'brain-untouched', name: 'Nietykalny', description: 'TRUDNE: Pokonaj Mózg Gospodarza, ani razu nie schodząc poniżej 50% zdrowia' },
  { id: 'brain-hard', name: 'Władca umysłu', description: 'TRUDNE: Pokonaj Mózg Gospodarza w trybie Trudnym' },
  { id: 'brain-surgeon', name: 'Chirurg', description: 'TRUDNE: Pokonaj Mózg Gospodarza po zarażeniu Serca i co najmniej 4 innych narządów (jego regeneracja stoi)' },
  { id: 'sentinel-slayer', name: 'Łamacz bram', description: 'TRUDNE: Pokonaj 5 strażników wejść do mózgu i serca w jednej grze' },
  { id: 'survivor20', name: 'Maraton', description: 'TRUDNE: Przetrwaj 20 minut w jednej grze' },
  { id: 'hard-veteran', name: 'Twardziel', description: 'TRUDNE: Przetrwaj 10 minut w trybie Trudnym' },
  { id: 'level30', name: 'Arcymistrz ewolucji', description: 'TRUDNE: Osiągnij poziom 30' },
  { id: 'massacre', name: 'Rzeźnia', description: 'TRUDNE: Pokonaj 600 wrogów w jednej grze' },
  { id: 'boss-hard', name: 'Legenda', description: 'Pokonaj bossa w trybie Trudnym' },
  { id: 'dna10', name: 'Kolekcjoner DNA', description: 'Zgromadź naraz 10 DNA (nagrody za zadania i poziomy)' },
  { id: 'human-host', name: 'Gość w człowieku', description: 'Zagraj na planszy Człowiek (wybierz ją w menu) i przetrwaj tam 3 minuty' },
  { id: 'head-trip', name: 'Od stóp do głów', description: 'Na planszy Człowiek dotrzyj do głowy' },
  { id: 'vaccine-slayer', name: 'Przeciw szczepionce', description: 'Pokonaj bossa Szczepionkę (losowe zdarzenie od 4. poziomu)' },
  { id: 'events5', name: 'Bywalec zdarzeń', description: 'Przeżyj 5 zdarzeń w organizmie (zranienie, gorączka, posiłek, sen, kichnięcie, szczepionka)' },
  { id: 'symbiont', name: 'Symbionta', description: 'Jako bakteria przetrwaj 5 minut, nie atakując przyjaznych komórek odporności' },
  { id: 'provoker', name: 'Prowokator', description: 'Zaatakuj szarżą lub toksyną przyjazną komórkę, żeby stała się wrogiem' },
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
