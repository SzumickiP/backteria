# Backteria — założenia gry

Gra przeglądarkowa 2D, widok z góry, realistyczny „mikroskopowy” wygląd (cała grafika generowana w kodzie).

## Start

1. **Konto** — przed grą tworzysz konto (nick + hasło) albo się logujesz. Konta są zapisywane lokalnie
   w przeglądarce (hasło jako skrót SHA-256 z solą); sesja jest zapamiętywana. Konto przechowuje rekordy.
2. **Wybór postaci** — bakteria albo wirus.

| | **Bakteria** | **Wirus** |
|---|---|---|
| Rozwój | jesz cząstki pożywienia → biomasa + doświadczenie | zarażasz komórki ciała i bakterie → doświadczenie |
| Kolonia | podział (Spacja / PPM) za biomasę | z każdej zainfekowanej komórki wychodzą kopie |
| Atak specjalny (LPM / F) | salwa toksyn | szarża (zryw z nietykalnością) |
| Wrogowie | wirusy, zarazki i bakterie o specjalnościach | układ odpornościowy: przeciwciała, białe krwinki, makrofagi |
| Zadania | **obroń** zaatakowany narząd | **zainfekuj** strzeżony narząd |

## Zasady

- **Gra ciągła** — bez fal i przerw; zagrożenie rośnie płynnie (co 30 s +1).
- **Otwarta, nieskończona mapa** z **biomami** (duże regiony):
  - *Tkanka łączna* — sieć krętych tuneli,
  - *Naczynie krwionośne* — szerokie, gładkie kanały,
  - *Pęcherzyki płucne* — okrągłe komory z cienkimi ściankami i przejściami,
  - *Jelito* — kanały z palczastymi kosmkami.
  Ściany blokują ruch postaci, wrogów i pocisków. Każdy biom ma inne kolory i innych wrogów.
- **Minimapa** w prawym dolnym rogu (ściany, biomy, wrogowie, kolonia, budowle, cel zadania).
- **Mutacje** — każdy poziom = wybór 1 z 3 losowych mutacji, bez zatrzymywania gry (1/2/3).
- **Ewolucja = budowa komórki** — za poziomy i zadania dostajesz punkty DNA. W edytorze (V) sam dokładasz
  organella w wybranych miejscach komórki (PPM usuwa ze zwrotem DNA). Organella są widoczne w grze.
  Edytor zatrzymuje grę na czas budowy.
- **Umysł zbiorowy** — kolonia porusza się stadem (rozdzielanie, wyrównanie, spójność) i atakuje wspólny cel;
  wrogie bakterie tego samego rodzaju też poruszają się stadami.
- **Rozkazy dla kolonii** (miejsce = kursor): Q — za mną, G — atak, H — trzymaj pozycję, T — zbieraj / zarażaj.
- **Przerabianie komórek ciała** (E, co 25 s) na budowle: wieżyczka, fabryka komórek, gniazdo leczące (maks. 3).
- **Zadania** — co ~40 s w pobliżu pojawia się narząd (strzałka na krawędzi ekranu). Narząd broni się,
  wystrzeliwując białka. Sukces = doświadczenie + DNA + nagroda; porażka nie kończy gry.
- **Przegrana** — gdy zginiesz. Wynik (czas, poziom, zabici, zadania) trafia na konto.

## Wrogowie bakterii

| Wróg | Specjalność |
|---|---|
| Wirus | podstawowy, wiruje |
| Zarazek | wytrzymały, z fimbriami |
| Ziarniaki | atakują gromadą (5 naraz) |
| Laseczka przetrwalnikowa | po śmierci uwalnia 3 przetrwalniki |
| Pałeczka toksynotwórcza | trzyma dystans i strzela toksynami |
| Prątek | woskowy pancerz: -50% obrażeń |
| Krętek | bardzo szybki |

Wrogowie wirusa: przeciwciała (gromady), białe krwinki, makrofagi (duże, w płucach).

## Sterowanie

| Akcja | Klawisz |
|---|---|
| Ruch | mysz lub WASD / strzałki |
| Atak specjalny | LPM lub F |
| Podział (bakteria) | Spacja lub PPM |
| Przerób komórkę ciała | E, potem 1 / 2 / 3 |
| Rozkazy dla kolonii | Q / G / H / T |
| Edytor komórki | V |
| Wybór mutacji | 1 / 2 / 3 |
| Pauza | Esc (w pauzie: M — menu) |
| Po przegranej | R — jeszcze raz, M — zmiana postaci |

## Do rozważenia później

- konta online (serwer), tablica wyników,
- bossowie, antybiotyki / gorączka jako zdarzenia,
- prądy w naczyniach krwionośnych,
- dźwięk i muzyka.
