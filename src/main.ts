import Phaser from 'phaser';
import { showAccountScreen } from './account/AccountScreen';
import { logout, restoreSession, type Account } from './account/accounts';
import { GameEvents } from './events';
import { EditorScene } from './scenes/EditorScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { UIScene } from './scenes/UIScene';
import { biomeAt, openness } from './world/walls';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1c0a10',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  // Automatycznie startuje tylko pierwsza scena (menu). GameScene uruchamia UIScene.
  scene: [MenuScene, GameScene, UIScene, EditorScene],
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
  if (import.meta.env.DEV) Object.assign(window, { __backteria: game, __world: { biomeAt, openness } });
}

// Najpierw konto: zapamiętana sesja albo ekran logowania / rejestracji.
const session = restoreSession();
if (session) startGame(session);
else showAccountScreen(startGame);
