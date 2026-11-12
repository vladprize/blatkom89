import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bySentence } from './sentences.js';

test('v0.2.25: every sentence of a description starts on a new line — initials and «No. 3» stay put', () => {
  assert.equal(bySentence('Двадцать лет держал общежитие. Общежитие расселили. Теперь Петя — комендант двора.'), 'Двадцать лет держал общежитие.\nОбщежитие расселили.\nТеперь Петя — комендант двора.');
  assert.equal(bySentence('Подпись: «А. Аркадьев». Срок — 1989-й.'), 'Подпись: «А. Аркадьев».\nСрок — 1989-й.');
  assert.equal(bySentence('City Hospital No. 3. The basement.'), 'City Hospital No. 3.\nThe basement.');
  assert.equal(bySentence('Signed «A. A.» — nobody knows.'), 'Signed «A. A.» — nobody knows.');
  assert.equal(bySentence('Ого! Начальник? «Да». Ладно…'), 'Ого!\nНачальник?\n«Да».\nЛадно…');
  assert.equal(bySentence('One line only.'), 'One line only.');
  assert.equal(bySentence('Цены: 99 БЛАТ. 199 БЛАТ.'), 'Цены: 99 БЛАТ.\n199 БЛАТ.');
  assert.equal(bySentence('т. е. всё так'), 'т. е. всё так');
});
