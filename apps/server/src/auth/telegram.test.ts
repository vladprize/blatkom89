import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validateInitData, signInitData, displayNameFromTelegram } from './telegram.js';

const BOT = '7000000001:AAH-unit-test-token';
const NOW = 1_760_000_000;

function fields(extra: Record<string, string> = {}): Record<string, string> {
  return {
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: 279058397, first_name: 'Петя', last_name: 'Комендант', username: 'petya', language_code: 'ru', is_premium: true }),
    auth_date: String(NOW - 30),
    ...extra,
  };
}

/** Independent re-implementation of the documented algorithm (not using the module under test). */
function referenceHash(f: Record<string, string>, token: string): string {
  const dcs = Object.keys(f)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${f[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  return createHmac('sha256', secret).update(dcs).digest('hex');
}

test('telegram: signature matches an independent implementation of the documented algorithm', () => {
  const f = fields({ signature: 'SHA_ed25519_signature_base64url_value', start_param: 'inviteAB12' });
  const init = new URLSearchParams({ ...f, hash: referenceHash(f, BOT) }).toString();
  const r = validateInitData(init, BOT, 86400, NOW);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.user.id, 279058397);
    assert.equal(r.user.languageCode, 'ru');
    assert.equal(r.startParam, 'inviteAB12');
  }
  assert.equal(signInitData(f, BOT).includes(referenceHash(f, BOT)), true);
});

test('telegram: tampered data, wrong bot token and missing/duplicate fields are rejected', () => {
  const good = signInitData(fields(), BOT);
  const tampered = good.replace(encodeURIComponent('Петя'), encodeURIComponent('Вася'));
  assert.notEqual(tampered, good);
  assert.deepEqual(validateInitData(tampered, BOT, 86400, NOW), { ok: false, reason: 'bad_signature' });
  assert.deepEqual(validateInitData(good, '7000000001:other', 86400, NOW), { ok: false, reason: 'bad_signature' });
  const noHash = new URLSearchParams(fields()).toString();
  assert.deepEqual(validateInitData(noHash, BOT, 86400, NOW), { ok: false, reason: 'missing_hash' });
  assert.deepEqual(validateInitData(good + '&auth_date=1', BOT, 86400, NOW), { ok: false, reason: 'malformed' });
  const noUser = signInitData({ auth_date: String(NOW) }, BOT);
  assert.deepEqual(validateInitData(noUser, BOT, 86400, NOW), { ok: false, reason: 'no_user' });
});

test('telegram: stale and future auth_date are rejected', () => {
  const stale = signInitData(fields({ auth_date: String(NOW - 86400 - 5) }), BOT);
  assert.deepEqual(validateInitData(stale, BOT, 86400, NOW), { ok: false, reason: 'stale' });
  const future = signInitData(fields({ auth_date: String(NOW + 3600) }), BOT);
  assert.deepEqual(validateInitData(future, BOT, 86400, NOW), { ok: false, reason: 'future' });
  const fresh = signInitData(fields({ auth_date: String(NOW - 10) }), BOT);
  assert.equal(validateInitData(fresh, BOT, 86400, NOW).ok, true);
});

test('telegram: display names are sanitized for the game — in Latin letters (v0.3)', () => {
  assert.equal(displayNameFromTelegram({ id: 1, firstName: 'Петя 🐓', lastName: 'Комендант', languageCode: null }), 'Petya Komendant');
  assert.equal(displayNameFromTelegram({ id: 3, firstName: 'José', lastName: 'Müller', languageCode: null }), 'Jose Muller');
  assert.equal(displayNameFromTelegram({ id: 4, firstName: '王小明', lastName: null, languageCode: null }), 'Comrade 4');
  assert.equal(displayNameFromTelegram({ id: 12345678, firstName: '🔥', lastName: null, languageCode: null }), 'Comrade 5678');
  assert.ok(displayNameFromTelegram({ id: 2, firstName: 'А'.repeat(60), lastName: null, languageCode: null }).length <= 24);
});
