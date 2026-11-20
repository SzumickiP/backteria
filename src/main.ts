import Phaser from 'phaser';
import { showAccountScreen } from './account/AccountScreen';
import { logout, restoreSession, type Account } from './account/accounts';
import { audio } from './audio/AudioEngine';
import { GameEvents } from './events';
import { EditorScene } from './scenes/EditorScene';
import { showLobby } from './net/LobbyScreen';
import { resetNet, type NetMode } from './net/link';
import { GuestScene } from './scenes/GuestScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { SettingsScene } from './scenes/SettingsScene';
import { UIScene } from './scenes/UIScene';
import { currentAnimal } from './world/animal';
import { biomeAt, openness } from './world/walls';

const baseConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1c0a10',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  // Dźwięk robi własny silnik (src/audio) — wbudowany dźwięk Phasera jest niepotrzebny.
  audio: { noAudio: true },
  // Automatycznie startuje tylko pierwsza scena (menu). GameScene uruchamia UIScene.
  scene: [MenuScene, GameScene, UIScene, EditorScene, SettingsScene],
};

/** Gość nie ma menu ani własnej symulacji — tylko podgląd gry gospodarza. */
const guestConfig: Phaser.Types.Core.GameConfig = { ...baseConfig, scene: [GuestScene] };

let game: Phaser.Game | undefined;

/** Uruchamia grę dla zalogowanego gracza. */
function startGame(acc: Account, mode: NetMode = 'single'): void {
  if (game) return;
  game = new Phaser.Game(mode === 'guest' ? guestConfig : baseConfig);
  game.registry.set('account', acc.nick);
  game.events.once(GameEvents.Logout, () => {
    logout();
    resetNet();
    game?.destroy(true);
    game = undefined;
    showAccountScreen(chooseMode);
  });

  // Tylko w trybie deweloperskim: dostęp do gry z konsoli przeglądarki (debugowanie, testy).
  if (import.meta.env.DEV) Object.assign(window, { __backteria: game, __world: { biomeAt, openness, currentAnimal }, __audio: audio });
}

/** Po zalogowaniu: gra jednoosobowa startuje od razu, wieloosobowa przechodzi przez lobby. */
function chooseMode(acc: Account, multiplayer: boolean): void {
  if (!multiplayer) return startGame(acc, 'single');
  showLobby(
    acc.nick,
    (mode) => startGame(acc, mode),
    () => showAccountScreen(chooseMode),
  );
}

// Dźwięk można włączyć dopiero po geście użytkownika (zasada przeglądarek).
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => audio.unlock(), { capture: true });

// Najpierw konto: zapamiętana sesja albo ekran logowania / rejestracji.
const session = restoreSession();
if (session) startGame(session, 'single');
else showAccountScreen(chooseMode);
