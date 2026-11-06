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
import { initLifecycle, isPaused, onLifecycle } from './app/lifecycle.js';
import { markIosStandalone } from './app/landscape.js';

/** Page language and the tab title follow the game language (Cyrillic name in Russian). */
function applyLang() {
  const name = getLang() === 'ru' ? 'БЛАТКОМ ’89' : 'BLATKOM ’89';
  document.documentElement.lang = getLang();
  document.title = name;
  const tape = document.querySelector('#boot .boot__tape');
  if (tape) tape.textContent = name;
}

async function main() {
  markIosStandalone();
  applyLang();
  onLangChange(applyLang);
  const hint = document.querySelector('.boot__hint');
  if (hint) hint.textContent = t('Rewinding the tape…');
  initLifecycle();
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
  // the music stops in the background — a hidden tab, a locked phone, a minimised Mini App (V2.0 part E)
  music.setHidden(isPaused());
  onLifecycle((e) => {
    music.setHidden(e.type === 'pause');
    sfx.setPaused(e.type === 'pause');
  });
  window.__blatkom = { host, app, game: host.game, music };
  await app.start(host);
  // The soundtrack starts with the menu: straight away where the browser allows sound without a tap,
  // otherwise with the player's first tap anywhere (the unlock above). v0.2.18 (the owner): no «▶ Play»
  // screen any more — the loading window goes straight into the menu, as before v0.2.14.
  if (music.wantsSound()) void music.tryAutoplay().catch(() => false);
  hideBoot();
}

function hideBoot() {
  document.getElementById('boot')?.classList.add('boot--hidden');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
}

main().catch((e: Error) => {
  console.error(e);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = `<div class="boot__tape">${t('BREAKDOWN')}</div><div class="boot__hint">${String(e.message).replace(/[<>&]/g, '')}</div>`;
});
