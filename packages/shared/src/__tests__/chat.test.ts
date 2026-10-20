import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_RULES, ClientMessageSchema, cleanChat } from '../index.js';

test('chat lines are cleaned: control and direction characters out, spaces collapsed, zalgo cut, 140 characters', () => {
  assert.equal(cleanChat('  Здорово,\n\tпацаны!  '), 'Здорово, пацаны!');
  assert.equal(cleanChat('a‮bc\u0007d​'), 'a bc d');
  assert.equal(cleanChat(' \n​\t '), '');
  assert.equal(cleanChat('о́̂̃̄̅к'), 'о́̂к');
  const long = '🔫'.repeat(200);
  const cut = cleanChat(long);
  assert.equal([...cut].length, CHAT_RULES.maxLength, 'counted in characters, not UTF-16 units');
  assert.equal(cleanChat('x'.repeat(CHAT_RULES.maxLength) + '   y'), 'x'.repeat(CHAT_RULES.maxLength));
});

test('the chat message: text up to the raw limit, an optional team flag', () => {
  assert.ok(ClientMessageSchema.safeParse({ type: 'chat', text: 'привет' }).success);
  assert.ok(ClientMessageSchema.safeParse({ type: 'chat', text: 'свои, за мной', team: true }).success);
  assert.ok(!ClientMessageSchema.safeParse({ type: 'chat', text: 'x'.repeat(CHAT_RULES.maxRaw + 1) }).success);
  assert.ok(!ClientMessageSchema.safeParse({ type: 'chat', text: 'hi', team: 'yes' }).success);
  assert.ok(!ClientMessageSchema.safeParse({ type: 'chat' }).success);
});
