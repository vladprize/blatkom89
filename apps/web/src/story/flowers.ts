/**
 * v0.2.25 — the words of the hidden comic «Flower Loser» (story/easter.ts plays it): the meme's lines said by
 * our own characters — Borka with a bouquet, Gosha with a borrowed camcorder; a handshake a week later.
 */
import type { Beat } from './script.js';

export const FLOWERS: readonly Beat[] = [
  { who: 'caption', fx: 'vhs', scene: 'yard', say: ['The 3rd Microdistrict, by the vegetable stall. Two men are sorting things out. Gosha is filming it on a borrowed camcorder.', '3-й микрорайон, у овощного ларька. Двое выясняют отношения. Гоша снимает на чужую видеокамеру.'] },
  { who: 'svinya', say: ['Bro, don’t film it. They’ll sort it out themselves.', 'Братан, не надо снимать. Они сами разберутся.'] },
  { who: 'popugay', say: ['And who are you? Fat. Busty. Double-chinned… A flower loser!', 'А ты кто такой? Толстый. Сиськастый. Подбородочный… Лох цветочный!'] },
  { who: 'svinya', say: ['I… I was on my way to a date.', 'Я… Я вообще на свидание шёл.'] },
  { who: 'popugay', say: ['With a bouquet! Flower loser! Flower loser! I’ll repeat it to the whole district!', 'С букетом! Лох цветочный! Лох цветочный! Я это всему району повторю!'] },
  { who: 'caption', fx: 'vhs', say: ['A week later. Neutral ground — the garages.', 'Неделю спустя. Нейтральная территория — гаражи.'] },
  { who: 'popugay', say: ['We came to a common opinion: we just need to shake hands and end this whole situation today.', 'Мы пришли к общему мнению, что нужно просто пожать друг другу руки и закончить сегодня всю эту ситуацию.'] },
  { who: 'svinya', say: ['The flowers are for you, by the way. The date fell through anyway.', 'Цветы, кстати, тебе. Свидание всё равно сорвалось.'] },
];
