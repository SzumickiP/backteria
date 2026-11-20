import Phaser from 'phaser';
import { audio, SOUND_MODE_NAMES } from '../audio/AudioEngine';
import { ACTIONS, ACTION_NAMES, RESERVED, bindKey, keyName, resetSettings, saveSettings, settings, type Action } from '../settings';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TEXT = '#f5e9ee';
const MUTED = '#c29aa8';

/**
 * Ustawienia: zmiana sterowania (2 klawisze na akcję), podążanie za myszą, tryb dźwięku.
 * Otwierane z menu albo z pauzy; scena, z której przyszliśmy, czeka zatrzymana.
 */
export class SettingsScene extends Phaser.Scene {
  private from: 'menu' | 'pause' = 'menu';
  private listening?: { action: Action; slot: 0 | 1 };
  private slotTexts = new Map<string, Phaser.GameObjects.Text>();
  private info!: Phaser.GameObjects.Text;
  private mouseText!: Phaser.GameObjects.Text;
  private soundText!: Phaser.GameObjects.Text;

  constructor() {
    super('SettingsScene');
  }

  init(data: { from?: 'menu' | 'pause' }): void {
    this.from = data.from ?? 'menu';
    this.listening = undefined;
    this.slotTexts = new Map();
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x0d0408, 0.94).setOrigin(0).setInteractive();
    this.add.text(width / 2, 16, 'Ustawienia', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: TEXT }).setOrigin(0.5, 0);
    this.info = this.add
      .text(width / 2, 54, '', { fontFamily: FONT, fontSize: '14px', color: MUTED, align: 'center' })
      .setOrigin(0.5, 0);

    // Lista akcji: nazwa | klawisz 1 | klawisz 2.
    const rowH = Math.max(24, Math.min(32, (height - 230) / ACTIONS.length));
    const colW = Math.min(150, (width - 48) * 0.25);
    const nameW = Math.min(300, width - 32 - colW * 2 - 20);
    const x0 = (width - (nameW + colW * 2 + 20)) / 2;
    let y = 84;
    for (const action of ACTIONS) {
      this.add.text(x0, y + rowH / 2, ACTION_NAMES[action], { fontFamily: FONT, fontSize: '14px', color: TEXT }).setOrigin(0, 0.5);
      for (const slot of [0, 1] as const) {
        const bx = x0 + nameW + 10 + slot * (colW + 10);
        const rect = this.add
          .rectangle(bx, y + 2, colW, rowH - 4, 0x2a1019, 1)
          .setOrigin(0)
          .setStrokeStyle(1, 0x7a3a52)
          .setInteractive({ useHandCursor: true });
        const t = this.add.text(bx + colW / 2, y + rowH / 2, '', { fontFamily: FONT, fontSize: '14px', color: TEXT }).setOrigin(0.5);
        rect.on('pointerdown', () => {
          this.listening = { action, slot };
          audio.sfx('click');
          this.refresh();
        });
        this.slotTexts.set(`${action}:${slot}`, t);
      }
      y += rowH;
    }

    // Opcje.
    y += 12;
    this.mouseText = this.button(width / 2, y, '', () => {
      settings.mouseFollow = !settings.mouseFollow;
      saveSettings();
      this.refresh();
    });
    y += 34;
    this.soundText = this.button(width / 2, y, '', () => {
      audio.cycleMode();
      this.refresh();
    });
    y += 44;
    this.button(width / 2 - 110, y, 'Przywróć domyślne', () => {
      resetSettings();
      this.listening = undefined;
      this.refresh();
    });
    this.button(width / 2 + 110, y, 'Gotowe  [Esc]', () => this.close(), '#1c0a10', '#6ee7b7');

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    this.input.keyboard!.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
    this.refresh();
  }

  private button(x: number, y: number, label: string, onClick: () => void, color = TEXT, bg = '#2a1019'): Phaser.GameObjects.Text {
    const b = this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '15px', color, backgroundColor: bg, padding: { x: 12, y: 6 } })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    b.on('pointerdown', () => {
      audio.sfx('click');
      onClick();
    });
    return b;
  }

  private onKey(e: KeyboardEvent): void {
    e.preventDefault();
    const l = this.listening;
    if (!l) {
      if (e.code === 'Escape') this.close();
      return;
    }
    // Podczas przypisywania: Esc — anuluj, Backspace / Delete — wyczyść.
    if (e.code === 'Escape') {
      this.listening = undefined;
    } else if (e.code === 'Backspace' || e.code === 'Delete') {
      settings.keys[l.action][l.slot] = '';
      saveSettings();
      this.listening = undefined;
    } else if (RESERVED.has(e.code)) {
      this.info.setText(`Klawisz ${keyName(e.code)} jest zarezerwowany (wybór mutacji i budowli). Wybierz inny.`).setColor('#fca5a5');
      audio.sfx('error');
      return;
    } else {
      bindKey(l.action, l.slot, e.code);
      this.listening = undefined;
      audio.sfx('select');
    }
    this.refresh();
  }

  private refresh(): void {
    for (const action of ACTIONS) {
      for (const slot of [0, 1] as const) {
        const t = this.slotTexts.get(`${action}:${slot}`)!;
        const active = this.listening?.action === action && this.listening.slot === slot;
        t.setText(active ? 'naciśnij klawisz…' : keyName(settings.keys[action][slot])).setColor(active ? '#fde68a' : TEXT);
      }
    }
    this.info
      .setText(
        this.listening
          ? 'Naciśnij nowy klawisz.  Esc — anuluj,  Backspace — wyczyść.  Klawisz zajęty przez inną akcję zostanie zamieniony.'
          : 'Kliknij pole klawisza, żeby je zmienić.  1 / 2 / 3 są zarezerwowane do wyborów w grze.',
      )
      .setColor(MUTED);
    this.mouseText.setText(`Postać płynie za kursorem myszy: ${settings.mouseFollow ? 'TAK' : 'NIE'}`);
    this.soundText.setText(`Dźwięk: ${SOUND_MODE_NAMES[audio.mode]}`);
  }

  private close(): void {
    if (this.from === 'menu') this.scene.resume('MenuScene');
    this.scene.stop();
  }
}
