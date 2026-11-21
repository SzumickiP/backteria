import type { GameSummary } from '../events';

/** Rodzaj obrazka w scence końcowej. */
export type EndingVisual = 'triumph' | 'territory' | 'fall' | 'legend' | 'short';

export interface Ending {
  title: string;
  lines: string[];
  visual: EndingVisual;
  /** kolor tytułu */
  color: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Scenka końcowa zależna od przebiegu gry: wygrana wirusa, wynik w trybie „Martwy żywiciel”
 * albo rodzaj śmierci (krótka gra, legenda, prawie-zwycięstwo…), plus dopiski o tym, co gracz zrobił.
 */
export function buildEnding(s: GameSummary, victory: boolean): Ending {
  const e = s.ending;
  const animal = e?.animal ?? 'Stworzenie';
  const virus = s.species === 'virus';
  let title: string;
  let lines: string[];
  let visual: EndingVisual;
  let color = '#fca5a5';

  if (s.area !== undefined) {
    // Martwy żywiciel — wynik zależy od zajętego terenu.
    const rival = e?.rival ?? 0;
    visual = 'territory';
    color = '#86efac';
    if (s.area >= 0.75) {
      title = 'Epilog: Jedyny lokator';
      lines = [`Ciało się rozłożyło, ale niemal każdy jego zakamarek należał do Ciebie (${pct(s.area)}).`, 'Po rywalach nie został nawet ślad.'];
    } else if (s.area >= 0.4) {
      title = 'Epilog: Imperium rozkładu';
      lines = [`Twoja kolonia rządziła ${pct(s.area)} martwego ciała.`, `Rywale utrzymali tylko ${pct(rival)} — reszta rozpadła się w pył.`];
    } else if (s.area >= 0.15) {
      title = 'Epilog: Skromne osiedle';
      lines = [`Zająłeś ${pct(s.area)} ciała — mały, ale własny kawałek świata.`, `Rywale (${pct(rival)}) nie dali się łatwo wyprzeć.`];
    } else {
      title = 'Epilog: Wyparci';
      color = '#fca5a5';
      lines = [`Tylko ${pct(s.area)} ciała było Twoje.`, `Obce kolonie (${pct(rival)}) przejęły martwe ciało.`];
    }
    if (!victory) lines.push('Nie dotrwałeś do końca rozkładu — kolonia została bez przywódcy.');
    lines.push(s.area >= 0.15 ? 'Twoje przetrwalniki ruszają szukać nowego żywiciela…' : 'Może następnym razem…');
  } else if (victory) {
    title = 'Epilog: Nowy władca';
    visual = 'triumph';
    color = '#86efac';
    lines = [`${animal} należy już do Ciebie — ${e?.conquered ?? 0}/${e?.organs ?? 0} narządów zarażonych.`];
    lines.push(e?.brain ? 'Mózg Gospodarza zgasł. Ostatnia myśl stworzenia należała do Ciebie.' : 'Każda komórka powtarza teraz Twój kod.');
    lines.push('Twoje kopie czekają już na kolejnego żywiciela…');
  } else if (s.time < 120) {
    title = 'Epilog: Krótka przygoda';
    visual = 'short';
    lines = [`Nie zdążyłeś nawet poznać wnętrza (${animal.toLowerCase()}).`, virus ? 'Przeciwciała oznaczyły Cię, zanim się namnożyłeś.' : 'Pierwszy głodny leukocyt zakończył sprawę.'];
  } else if (s.level >= 15 || s.kills >= 300) {
    title = 'Epilog: Upadek legendy';
    visual = 'legend';
    color = '#fde68a';
    lines = [`Poziom ${s.level}, ${s.kills} pokonanych — organizm długo będzie o Tobie pamiętał.`, 'Ale nawet legendy w końcu się męczą.'];
  } else if (virus && e && e.organs > 0 && e.conquered >= e.organs / 2) {
    title = 'Epilog: Tak blisko';
    visual = 'fall';
    lines = [`Zaraziłeś ${e.conquered}/${e.organs} narządów — zabrakło niewiele.`, `${animal} wraca do zdrowia… na razie.`];
  } else {
    title = virus ? 'Epilog: Zneutralizowany' : 'Epilog: Zjedzony';
    visual = 'fall';
    lines = [virus ? 'Układ odpornościowy rozłożył Twój kapsyd na części.' : 'Makrofag wchłonął Cię w całości.', `Przetrwałeś ${Math.floor(s.time / 60)} min — ${animal.toLowerCase()} nawet nie zauważy straty.`];
  }

  // Dopiski o tym, co gracz zrobił.
  const extra: string[] = [];
  if (e?.limb) extra.push(`Pamiętasz, jak stworzenie straciło ${e.limb}? Ono pamięta.`);
  if (!victory && e && e.structures >= 3) extra.push(`Twoje budowle (${e.structures}) jeszcze przez chwilę stały samotnie.`);
  if (!victory && e && e.colony >= 8) extra.push(`Kolonia (${e.colony}) rozpierzchła się bez przywódcy.`);
  if (e?.hard) extra.push('I to w trybie trudnym — szacunek.');
  lines.push(...extra.slice(0, 2));
  return { title, lines: lines.slice(0, 5), visual, color };
}
