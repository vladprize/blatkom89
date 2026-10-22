/** БЛАТКОМ ’89 admin dashboard — entry point (bundled to /assets/admin.js). */
import type { AdminMe } from '@blatkom/shared';
import { h, clear, toast } from './dom.js';
import { apiFetch, ApiError, setSession, setUnauthorizedHandler } from './api.js';
import { renderOverview } from './views/overview.js';
import { renderPlayers } from './views/players.js';
import { renderPlayer } from './views/player.js';
import { renderErrors } from './views/errors.js';
import { renderExports } from './views/exports.js';
import { renderAudit } from './views/audit.js';
import { renderFunnel } from './views/funnel.js';
import { renderEconomy } from './views/economy.js';
import { renderClubs } from './views/clubs.js';

const app = document.getElementById('app')!;
let me: AdminMe | null = null;

function showLogin(message?: string) {
  me = null;
  setSession(null);
  clear(app);
  const user = h('input', { name: 'username', autocomplete: 'username', required: true, minlength: 3, maxlength: 32, 'aria-label': 'Логин' });
  const pass = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true, 'aria-label': 'Пароль' });
  const err = h('p', { class: 'form-error', role: 'alert' }, message ?? '');
  const form = h(
    'form',
    { class: 'login card' },
    h('h1', {}, 'БЛАТКОМ ’89'),
    h('p', { class: 'note' }, 'Панель аналитики · только для администраторов'),
    h('label', {}, 'Логин', user),
    h('label', {}, 'Пароль', pass),
    err,
    h('button', { class: 'btn', type: 'submit' }, 'Войти'),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.textContent = '';
    apiFetch<AdminMe>('/api/admin/login', { method: 'POST', body: { username: user.value.trim(), password: pass.value } })
      .then((m) => {
        me = m;
        setSession(m);
        pass.value = '';
        if (!location.hash || location.hash === '#/login') location.hash = '#/overview';
        else void route();
      })
      .catch((e: Error) => {
        err.textContent = e instanceof ApiError && e.status === 429 ? 'Слишком много попыток. Подождите немного.' : e.message;
      });
  });
  app.append(h('div', { class: 'center' }, form));
  user.focus();
}

const NAV: Array<[string, string, 'viewer' | 'admin']> = [
  ['#/overview', 'Обзор', 'viewer'],
  ['#/funnel', 'Воронка', 'viewer'],
  ['#/economy', 'Экономика', 'viewer'],
  ['#/players', 'Игроки', 'viewer'],
  ['#/clubs', 'Клубы', 'viewer'],
  ['#/errors', 'Ошибки', 'viewer'],
  ['#/exports', 'Экспорт', 'viewer'],
  ['#/audit', 'Аудит', 'admin'],
];

function shell(active: string): HTMLElement {
  clear(app);
  const content = h('main', { class: 'content' });
  const logout = h(
    'button',
    {
      class: 'chip',
      onclick: () => {
        apiFetch('/api/admin/logout', { method: 'POST' })
          .catch(() => undefined)
          .finally(() => showLogin('Вы вышли из панели'));
      },
    },
    'Выйти',
  );
  app.append(
    h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'БЛАТКОМ ’89'), h('span', { class: 'sub' }, 'аналитика')),
      h('nav', {}, ...NAV.filter(([, , role]) => role === 'viewer' || me?.role === 'admin').map(([href, label]) => h('a', { href, class: active.startsWith(href) ? 'active' : '' }, label))),
      h('div', { class: 'who' }, h('span', {}, `${me?.username ?? ''} · ${me?.role === 'admin' ? 'админ' : 'наблюдатель'}`), logout),
    ),
    content,
  );
  return content;
}

async function route(): Promise<void> {
  if (!me) {
    try {
      me = await apiFetch<AdminMe>('/api/admin/me');
      setSession(me);
    } catch {
      showLogin();
      return;
    }
  }
  const hash = location.hash || '#/overview';
  const content = shell(hash);
  try {
    const player = /^#\/players\/([0-9a-f-]{36})$/i.exec(hash);
    if (player) await renderPlayer(content, player[1]!, me);
    else if (hash.startsWith('#/players')) await renderPlayers(content);
    else if (hash.startsWith('#/funnel')) await renderFunnel(content);
    else if (hash.startsWith('#/economy')) await renderEconomy(content);
    else if (hash.startsWith('#/clubs')) await renderClubs(content, me);
    else if (hash.startsWith('#/errors')) await renderErrors(content);
    else if (hash.startsWith('#/exports')) renderExports(content, me);
    else if (hash.startsWith('#/audit')) await renderAudit(content);
    else await renderOverview(content);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    clear(content);
    content.append(h('section', { class: 'card' }, h('h3', {}, 'Не удалось загрузить данные'), h('p', { class: 'note' }, (e as Error).message)));
    toast((e as Error).message);
  }
}

setUnauthorizedHandler(() => showLogin('Сессия истекла — войдите снова'));
window.addEventListener('hashchange', () => void route());
void route();
