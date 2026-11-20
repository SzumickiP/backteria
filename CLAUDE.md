# Backteria

Gra przeglądarkowa: TypeScript + Vite 8 + Phaser 3.90. Widok z góry 2D, grafika w całości proceduralna, dźwięk przez Web Audio. Odpowiadaj po polsku, z polskimi znakami.

## Komendy
- `npm run dev` — serwer deweloperski (Vite)
- `npm run build` — `tsc && vite build`
- `npm run typecheck`

## Zasady
- Nie używaj PowerShell do zamiany tekstu w plikach źródłowych (psuje polskie znaki, dodaje BOM). Używaj Edit.
- `manualChunks` w vite.config.ts musi być funkcją (Vite 8).
- Nie testuj gry w headless Chrome, jeśli użytkownik o to nie prosi (kosztowne, FPS ~10).
- Gra jest ciągła (bez fal i tur). Jedyna pauza to edytor komórki (V).

## Mapa plików (src/)
- `main.ts` — start po zalogowaniu, rejestracja scen
- `config.ts` — wszystkie stałe balansu (trudność, misje, maskowanie, strefa startowa)
- `events.ts` — zdarzenia między scenami
- `mutations.ts`, `species.ts`, `organelles.ts` — statystyki, gatunki (bakteria/wirus), organelle edytora
- `settings.ts` — klawisze (przypisywane), `account/` — konta lokalne i osiągnięcia
- `audio/AudioEngine.ts` — muzyka i efekty
- `world/` — `animal.ts` (zwierzęta, układy narządów, strefa startowa), `biomes.ts`, `walls.ts` (szum, ściany), `WallLayer.ts` (render), `navigation.ts` (flow field, omijanie ścian)
- `entities/` — Cell, Enemy, Organ, Prey, Nutrient, Structure
- `graphics/` — `textures.ts` (wszystkie tekstury), `organelleDraw.ts`
- `scenes/` — `GameScene.ts` (~2300 linii, cała rozgrywka), `UIScene.ts` (HUD, minimapa, mapa Tab), `MenuScene`, `EditorScene`, `SettingsScene`

## Wskazówka
Przed czytaniem `GameScene.ts` lub `UIScene.ts` użyj Grep, żeby znaleźć właściwą funkcję, i czytaj tylko ten fragment (offset/limit).
