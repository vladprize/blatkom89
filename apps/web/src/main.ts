/** Entry point: fonts → Telegram → game host → app shell. */
import './ui/styles.css';
import { GameHost } from './game/GameHost.js';
import { App } from './app/App.js';
import { initTelegram } from './telegram/tg.js';
import { sfx } from './game/audio/Sfx.js';
import { getSettings } from './app/settings.js';
import { loadFonts } from './app/fonts.js';
import { music } from './game/audio/Music.js';
import { getLang, onLangChange, t } from './i18n/index.js';

/** Page language and the tab title follow the game language (Cyrillic name in Russian). */
function applyLang() {
  document.documentElement.lang = getLang();
  document.title = getLang() === 'ru' ? 'БЛАТКОМ ’89' : 'BLATKOM ’89';
}

async function main() {
  applyLang();
  onLangChange(applyLang);
  const hint = document.querySelector('.boot__hint');
  if (hint) hint.textContent = t('Rewinding the tape…');
  const app = new App();
  initTelegram(() => app.back());
  await loadFonts();
  const host = new GameHost(document.getElementById('game')!);
  await host.ready();
  sfx.setVolume(getSettings().sfxVolume);
  const unlock = () => {
    sfx.unlock();
    music.unlock();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => music.setHidden(document.hidden));
  window.__blatkom = { host, app, game: host.game };
  await app.start(host);
  document.getElementById('boot')?.classList.add('boot--hidden');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
}

main().catch((e: Error) => {
  console.error(e);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = `<div class="boot__tape">${t('BREAKDOWN')}</div><div class="boot__hint">${String(e.message).replace(/[<>&]/g, '')}</div>`;
});
