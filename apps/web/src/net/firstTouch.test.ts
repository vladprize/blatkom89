/** V2.0 part F: what a first visit came with, read from the address and the referrer; the address cleaned. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FirstTouchSchema } from '@blatkom/shared';
import { captureFirstTouch, firstTouchForRequest, firstTouchOf } from './firstTouch.js';

test('first touch: a partner’s code, a campaign, an invitation, another site’s domain — normalised and valid for the server', () => {
  const t = firstTouchOf('?p=Streamer_One&utm_source=TikTok&utm_medium=Short%20Video&utm_campaign=Launch!%2389&invite=AbCd1234', 'https://www.reddit.com/r/games/comments/123?x=1', 'blatkom89.onrender.com');
  assert.deepEqual(t, { partner: 'streamer_one', utmSource: 'tiktok', utmMedium: 'short video', utmCampaign: 'launch_89', invite: true, referrer: 'reddit.com' });
  assert.equal(FirstTouchSchema.safeParse(t).success, true);
  // our own site, a bad code, no campaign source, a non-web referrer: nothing
  assert.deepEqual(firstTouchOf('?p=x&utm_medium=cpc', 'https://blatkom89.onrender.com/?invite=1', 'blatkom89.onrender.com'), {});
  assert.deepEqual(firstTouchOf('', 'android-app://org.telegram.messenger/', 'blatkom89.onrender.com'), {});
  // a Cyrillic domain arrives as punycode; long values are cut
  const long = firstTouchOf(`?utm_source=${'a'.repeat(200)}`, 'https://пример.рф/', 'x');
  assert.equal(long.utmSource!.length, 64);
  assert.equal(long.referrer, 'xn--e1afmkfd.xn--p1ai');
  assert.equal(FirstTouchSchema.safeParse(long).success, true);
  assert.equal(firstTouchForRequest({}), undefined);
  assert.deepEqual(firstTouchForRequest({ invite: true }), { invite: true });
});

test('first touch: ?p= and utm_* are taken out of the address, the rest and the hash stay', () => {
  let url = '';
  captureFirstTouch({ search: '?invite=AbCd&p=streamer_one&utm_source=tiktok&utm_campaign=x', pathname: '/', hash: '#tgWebAppData=abc', host: 'game.example' }, '', (u) => (url = u));
  assert.equal(url, '/?invite=AbCd#tgWebAppData=abc');
  url = 'untouched';
  captureFirstTouch({ search: '?invite=AbCd', pathname: '/', hash: '', host: 'game.example' }, '', (u) => (url = u));
  assert.equal(url, 'untouched', 'nothing to clean: the address is left alone');
});
