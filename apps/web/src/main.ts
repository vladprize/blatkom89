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
  const name = getLang() === 'ru' ? 'БЛАТКОМ ’89' : 'BLATKOM ’89';
  document.documentElement.lang = getLang();
  document.title = name;
  const tape = document.querySelector('#boot .boot__tape');
  if (tape) tape.textContent = name;
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
  window.__blatkom = { host, app, game: host.game, music };
  await app.start(host);
  // The soundtrack starts with the menu: straight away where the browser allows sound without a tap;
  // otherwise the loading screen ends with «▶ Play» and that tap starts the music and shows the menu.
  if (await soundNeedsTap()) await pressPlay();
  hideBoot();
}

/** True when the menu music is wanted but the browser refused to start it without a tap. */
async function soundNeedsTap(): Promise<boolean> {
  if (!music.wantsSound()) return false;
  // a refusal comes at once; a slow network only delays an allowed start (the music then fades in later)
  const result = await Promise.race([music.tryAutoplay(), new Promise<boolean>((r) => setTimeout(() => r(true), 1500))]);
  return !result;
}

/** The loading screen turns into the start screen: the tape is rewound, press play. */
function pressPlay(): Promise<void> {
  const boot = document.getElementById('boot');
  if (!boot) return Promise.resolve();
  return new Promise((resolve) => {
    const play = document.createElement('button');
    play.className = 'boot__play';
    play.dataset.testid = 'boot-play';
    play.textContent = `▶ ${t('PLAY')}`;
    const hint = document.createElement('div');
    hint.className = 'boot__hint';
    hint.textContent = t('The tape is rewound. Press play — the music starts with the menu.');
    boot.querySelector('.boot__bar')?.remove();
    boot.querySelector('.boot__hint')?.remove();
    boot.append(play, hint);
    boot.classList.add('boot--start');
    // the whole screen is the button (pointerdown on window has already unlocked the audio)
    const go = () => {
      boot.removeEventListener('click', go);
      sfx.unlock();
      music.unlock();
      resolve();
    };
    boot.addEventListener('click', go);
    play.focus();
  });
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
