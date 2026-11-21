import Phaser from 'phaser';
import { showAccountScreen } from './account/AccountScreen';
import { logout, type Account } from './account/accounts';
import { audio } from './audio/AudioEngine';
import { GameEvents } from './events';
import { EditorScene } from './scenes/EditorScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { SettingsScene } from './scenes/SettingsScene';
import { UIScene } from './scenes/UIScene';
import { currentAnimal } from './world/animal';
import { biomeAt, openness } from './world/walls';

/**
 * Ostry tekst: Phaser domyślnie rysuje napisy w rozdzielczości 1:1, przez co przy skalowaniu ekranu
 * (125–200% w Windows, ekrany Retina) są rozmyte. Każdy tekst dostaje rozdzielczość ekranu,
 * delikatny cień dla czytelności na tle gry i lepsze wygładzanie czcionki.
 */
const TEXT_RES = Math.min(3, Math.max(1.5, window.devicePixelRatio || 1));
const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
  text: (x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text;
};
const baseText = factory.text;
factory.text = function (x, y, text, style = {}) {
  const t = baseText.call(this, x, y, text, { resolution: TEXT_RES, ...style });
  if (!style.shadow && !style.backgroundColor) t.setShadow(0, 1, 'rgba(0,0,0,0.55)', 2, false, true);
  return t;
};

const config: Phaser.Types.Core.GameConfig = {
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

let game: Phaser.Game | undefined;

/** Uruchamia grę dla zalogowanego gracza. */
function startGame(acc: Account): void {
  if (game) return;
  game = new Phaser.Game(config);
  game.registry.set('account', acc.nick);
  game.events.once(GameEvents.Logout, () => {
    logout();
    game?.destroy(true);
    game = undefined;
    showAccountScreen(startGame);
  });

  // Tylko w trybie deweloperskim: dostęp do gry z konsoli przeglądarki (debugowanie, testy).
  if (import.meta.env.DEV) Object.assign(window, { __backteria: game, __world: { biomeAt, openness, currentAnimal }, __audio: audio });
}

// Dźwięk można włączyć dopiero po geście użytkownika (zasada przeglądarek).
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => audio.unlock(), { capture: true });

// Gra zawsze startuje od ekranu wyboru gracza (bez automatycznego logowania zapamiętaną sesją).
showAccountScreen(startGame);
