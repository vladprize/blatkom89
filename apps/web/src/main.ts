/** Entry point: fonts → Telegram → game host → app shell. */
import './ui/styles.css';
import { GameHost } from './game/GameHost.js';
import { App } from './app/App.js';
import { initTelegram } from './telegram/tg.js';
import { sfx } from './game/audio/Sfx.js';
import { getSettings } from './app/settings.js';
import { loadFonts } from './app/fonts.js';


async function main() {
  const app = new App();
  initTelegram(() => app.back());
  await loadFonts();
  const host = new GameHost(document.getElementById('game')!);
  await host.ready();
  sfx.setVolume(getSettings().sfxVolume);
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.__blatkom = { host, app, game: host.game };
  await app.start(host);
  document.getElementById('boot')?.classList.add('boot--hidden');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
}

main().catch((e: Error) => {
  console.error(e);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = `<div class="boot__tape">ОШИБКА</div><div class="boot__hint">${String(e.message).replace(/[<>&]/g, '')}</div>`;
});
