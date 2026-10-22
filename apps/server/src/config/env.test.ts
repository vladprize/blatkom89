import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from './env.js';

const base = { DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db', SESSION_SECRET: 'a-very-long-random-value-0123456789abcdefghijk' };

test('env: a production website needs PUBLIC_URL (or RENDER_EXTERNAL_URL) and Telegram or guest login', () => {
  assert.throws(() => loadEnv({ ...base, NODE_ENV: 'production', PUBLIC_URL: 'https://game.test' }), /TELEGRAM_BOT_TOKEN/);
  const render = loadEnv({ ...base, NODE_ENV: 'production', GUEST_AUTH_ENABLED: 'true', RENDER_EXTERNAL_URL: 'https://blatkom89.onrender.com' });
  assert.equal(render.PUBLIC_URL, 'https://blatkom89.onrender.com');
  assert.equal(render.GUEST_AUTH_ENABLED, true);
  const explicit = loadEnv({ ...base, NODE_ENV: 'production', GUEST_AUTH_ENABLED: 'true', PUBLIC_URL: 'https://game.test', RENDER_EXTERNAL_URL: 'https://other.onrender.com' });
  assert.equal(explicit.PUBLIC_URL, 'https://game.test');
  assert.throws(() => loadEnv({ ...base, NODE_ENV: 'production', GUEST_AUTH_ENABLED: 'true' }), /PUBLIC_URL/);
  assert.throws(() => loadEnv({ ...base, NODE_ENV: 'production', GUEST_AUTH_ENABLED: 'true', DEV_AUTH_ENABLED: 'true', PUBLIC_URL: 'https://game.test' }), /DEV_AUTH_ENABLED/);
  assert.throws(() => loadEnv({ ...base, SESSION_SECRET: 'change-me-change-me-change-me-change-me', NODE_ENV: 'production', GUEST_AUTH_ENABLED: 'true', PUBLIC_URL: 'https://game.test' }), /placeholder/);
  // development keeps the localhost default
  assert.equal(loadEnv({ ...base }).PUBLIC_URL, 'http://localhost:8080');
});

test('env (v0.3): blank variables count as not set — a dashboard field left empty never stops the server', () => {
  const env = loadEnv({ ...base, NODE_ENV: 'production', GUEST_AUTH_ENABLED: 'true', PUBLIC_URL: 'https://game.test', KEEP_AWAKE: '', BOT_WARM_MINUTES: ' ', TELEGRAM_BOT_TOKEN: '', MAIL_FROM: '' });
  assert.equal(env.KEEP_AWAKE, false);
  assert.equal(env.BOT_WARM_MINUTES, 20);
  assert.equal(env.TELEGRAM_BOT_TOKEN, undefined);
  assert.equal(env.MAIL_FROM, undefined);
  assert.equal(loadEnv({ ...base, KEEP_AWAKE: 'true', BOT_WARM_MINUTES: '0' }).KEEP_AWAKE, true);
  assert.equal(loadEnv({ ...base, BOT_WARM_MINUTES: '0' }).BOT_WARM_MINUTES, 0);
  // a blank token with no guest login is still refused in production
  assert.throws(() => loadEnv({ ...base, NODE_ENV: 'production', PUBLIC_URL: 'https://game.test', TELEGRAM_BOT_TOKEN: '' }), /TELEGRAM_BOT_TOKEN/);
});
