# Backteria

Gra przeglądarkowa — TypeScript + Vite + Phaser 3.

## Uruchomienie

```bash
npm install      # tylko za pierwszym razem
npm run dev      # serwer deweloperski, otwiera grę w przeglądarce
```

## Inne polecenia

| Polecenie | Opis |
|---|---|
| `npm run build` | sprawdza typy i buduje grę do `dist/` (statyczne pliki do wrzucenia na hosting) |
| `npm run preview` | podgląd zbudowanej wersji |
| `npm run typecheck` | tylko sprawdzenie typów TypeScript |

## Struktura

```
index.html          strona z kontenerem gry
src/main.ts         konfiguracja Phasera
src/scenes/         sceny gry
public/             zasoby (grafiki, dźwięki) — dostępne pod ścieżką "/"
```

## Licencje

Phaser i Vite — MIT, TypeScript — Apache 2.0.
Zasoby graficzne i dźwiękowe dodawane do `public/` muszą mieć licencję pozwalającą na użycie w grze.
