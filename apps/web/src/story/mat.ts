/**
 * v0.2.25 — the story with swearing (the owner: «сценарий… должен содержать ненормативную лексику и абсурдные
 * шутки, чёрный юмор… с * или # вместо одной буквы»). The key is a line's English text in script.ts; the
 * value is [English, Russian] said instead while the swearing is on (Settings → «No swearing» brings the
 * plain script back). Every swear word has one letter hidden; script.test.ts checks that every key is a line
 * of the script and that no swear word slips through whole.
 */
export const STORY_MAT: Record<string, readonly [string, string]> = {
  // ── the campaigns and the endings ──────────────────────────────────────────
  'Petya «The Commandant» keeps order in the yard — the streets’ way.': ['Petya «The Commandant» keeps order in the yard — the streets’ f*cking way.', 'Петя «Комендант» наводит порядок во дворе — по-уличному, бл*ть.'],
  'Uchastkovy works the district — by the book, mostly.': ['Uchastkovy works the district — by the book. Mostly, f*ck it.', 'Участковый наводит порядок на районе — по уставу. Почти, бл*ть.'],
  'You wake up in 2089 with a headache. The case isn’t lost yet — once more.': ['You wake up in 2089 with a head like the morning after a wake. The case isn’t f*cked yet — once more.', 'Просыпаешься в 2089-м с башкой, как после поминок. Дело ещё не проср*но — давай ещё раз.'],
  'Time’s up. The district didn’t wait.': ['Time’s up. The district didn’t f*cking wait.', 'Время вышло. Район ждать не стал, бл*ть.'],
  'They got there first. Not this time.': ['The b*stards got there first. Not this time.', 'Эти с*ки оказались первыми. Не в этот раз.'],

  // ── the prologue ───────────────────────────────────────────────────────────
  '2089. Nobody takes the city to court any more.': ['2089. Nobody takes the city to court any more. Courts are for d*ckheads.', '2089 год. Город давно не делят в судах. Суды — для долбо*бов.'],
  'I’m not giving up the yard. There’s lilac there. A bench. Forty years I’ve kept order there.': ['I’m not giving up the yard. There’s lilac there. A bench. Forty f*cking years I’ve kept order there.', 'Двор не отдам. Там сирень. Там лавочка. Там я сорок лет порядок держу, бл*ть.'],
  'A parking tower where the yard is. Nine hundred spaces. Arkadia Development doesn’t lose cases.': ['A parking tower where the yard is. Nine hundred spaces. The lilac can f*ck off. Arkadia Development doesn’t lose cases.', 'На месте двора будет паркинг-башня. Девятьсот мест. Сирень — нах*й. «Аркадия Девелопмент» дел не проигрывает.'],
  'Someone in BLATKOM wins every single dispute. That doesn’t happen. Find, file, report.': ['Someone in BLATKOM wins every single dispute. That sh*t doesn’t happen. Find, file, report.', 'Кто-то в БЛАТКОМе выигрывает все споры подряд. Так, бл*ть, не бывает. Найти, оформить, доложить.'],
  'Getting knocked out in there hurts no one: you just wake up in 2089 with a headache. And lose the case.': ['Get knocked out in there — don’t sh*t yourself: you wake up in 2089 with a head like the morning after a wake. And lose the case.', 'Если тебя там «устранили» — не ссы: просыпаешься в 2089-м с башкой, как после поминок. И проигрываешь дело.'],

  // ── the openings ───────────────────────────────────────────────────────────
  'The 3rd Microdistrict. October 1989. It smells of leaves, petrol and other people’s business.': ['The 3rd Microdistrict. October 1989. It smells of leaves, petrol and other people’s business. And a little of the dead guy from entrance three.', '3-й микрорайон. Октябрь 1989-го. Пахнет листвой, бензином и чужими делами. И немного — покойником из третьего подъезда.'],
  'Some hide. A comb, a tracksuit… Actually, quite respectable.': ['F*ck me, some hide. A comb, a tracksuit… Actually, quite respectable.', 'Ну и шкура, бл*ть. Гребень, спортивка… А что, солидно.'],
  'Cap, tunic, tail. The regulations don’t provide for a tail. Fine — we’ll file it as is.': ['Cap, tunic, tail. The f*cking regulations don’t provide for a tail. Fine — we’ll file it as is.', 'Фуражка, китель, хвост. Хвост, бл*ть, в уставе не предусмотрен. Ладно, оформим как есть.'],

  // ── a1 «Reveille» ──────────────────────────────────────────────────────────
  'Caw… Morning, new boy. Some loafers from the next yard have taken the bench by entrance three.': ['Caw… Morning, new boy. Some loafers from the next yard have taken the bench by entrance three. Three d*ckheads.', 'Карр… Доброе утро, новенький. Лавочку у третьего подъезда заняли тунеядцы с соседнего двора. Три *блана.'],
  'The bench by three? Only our own have sat there since seventy-one.': ['The bench by three? Only our own have sat there since seventy-one. And the late Zinaida Petrovna — still does, I think.', 'Лавочку у третьего? Там с семьдесят первого года сидят только свои. И покойная Зинаида Петровна — до сих пор, по-моему.'],
  'That’s what I’m saying. Three of them. Cracking sunflower seeds. Husks straight onto the flowerbed.': ['That’s what I’m saying. Three of them. Cracking sunflower seeds. Husks straight onto the flowerbed, the b*stards.', 'Вот и я говорю. Трое. Семечки лузгают. Шелуху — прямо на клумбу, с*ки.'],
  'Husks on the flowerbed… That isn’t hooliganism any more. That’s a challenge.': ['Husks on the flowerbed… That isn’t hooliganism any more. That’s a f*cking challenge.', 'Шелуха на клумбу… Это уже не хулиганство. Это, бл*ть, вызов.'],
  'No unauthorised persons!': ['Unauthorised? F*ck off!', 'Посторонний? П*шел нах*й!'],
  'One checked out.': ['One checked out. Feet first.', 'Один выписан. Вперёд ногами.'],
  'My yard. My rules.': ['My yard. My rules. That’s f*cking it.', 'Здесь мой двор. Здесь мои правила. Всё, нах*й.'],
  'Nicely done. I’m Karlych, by the way. Whatever’s said in this yard, I hear it.': ['Nicely done. I’m Karlych, by the way. Whatever bullsh*t gets said in this yard, I hear it.', 'Красиво. Я Карлыч, кстати. Всё, что во дворе п*здят, — слышу я.'],
  'Then listen: from today there’s order in this yard. Lights out at twenty-three hundred.': ['Then listen: from today there’s order in this yard. Lights out at twenty-three hundred. Whoever’s still awake gets put to sleep.', 'Тогда слушай: с сегодняшнего дня во дворе порядок. Отбой в двадцать три ноль-ноль. Кто не спит — того усыплю.'],

  // ── a2 «The Queue» ─────────────────────────────────────────────────────────
  'I only went out for bread.': ['I only went out for f*cking bread.', 'Я вообще за хлебом вышел, бл*ть.'],
  'The queue isn’t moving, old man. What’s going on?': ['The queue isn’t moving, old man. What’s this sh*t?', 'Очередь не двигается, отец. Что там за х*йня?'],
  'The next yard is jumping the queue. Say they’re allowed — they know someone at the trade office.': ['The next yard is jumping the queue. Say they’re allowed — they know someone at the trade office. Pr*cks.', 'Соседский двор лезет без очереди. Говорят, им можно — у них знакомый в торге. Г*ндоны.'],
  'Jumping the queue. In my district.': ['Jumping the queue. In my district. The f*cking nerve.', 'Без очереди. В моём районе. Ох*ели.'],
  'A queue is sacred!': ['A queue is sacred, you f*ckwits!', 'Очередь — это святое, *бланы!'],
  'Don’t play the hero. I’ve got you.': ['Don’t play the f*cking hero. I’ve got you.', 'Не геройствуй, бл*ть. Прикрою.'],
  'Now we can go for bread.': ['Now we can go for bread. The dead don’t need a loaf.', 'Вот теперь можно и за хлебом. Покойникам батон не нужен.'],

  // ── a3 «Light Bulbs» ───────────────────────────────────────────────────────
  'Forty watts. Just one. Where?': ['Forty watts. Just one. Where the f*ck?', 'Сорок ватт. Хотя бы одна. Где, бл*ть?'],
  'But I have a problem. Speculators from the next cooperative are undercutting me. Run them off and the box is yours. Sixty-watt.': ['But I have a problem. Speculators from the next cooperative are undercutting me, the b*stards. Run them off and the box is yours. Sixty-watt.', 'Но у меня проблема. Спекулянты с соседнего кооператива сбивают мне цены, с*ки. Разгонишь — коробка твоя. Шестидесятиваттных.'],
  'Sixty… Deal.': ['Sixty… F*ck me. Deal.', 'Шестидесяти… Е*ать. Договорились.'],
  'That’s not all. Here comes the big batch!': ['That’s not all. Here comes a big batch of d*ckheads!', 'Это ещё не всё. Пошла крупная партия долбо*бов!'],

  // ── a4 «Tape No. 89» ───────────────────────────────────────────────────────
  'Rewrites? As in, the yard becomes a car park?': ['Rewrites? As in, the yard becomes a f*cking car park?', 'Переписывает? Это как — двор под е*учий паркинг?'],
  'The resellers keep it at their place, behind the transformer box. We’ll take it.': ['The resellers keep it at their place, behind the transformer box. We’ll take it. Anyone against can f*ck off.', 'Перекупщики держат её у себя, за трансформаторной. Заберём. Кто против — пойдёт нах*й.'],
  'Got the tape! Cover me!': ['Got the tape! Cover my a*s!', 'Кассета у меня! Прикройте ж*пу!'],
  'Not now. Someone’s coming. In a peaked cap.': ['Not now. Someone’s coming. In a peaked cap. A f*cking cop.', 'Не сейчас. Кто-то идёт. В фуражке. Мент, бл*ть.'],

  // ── a5 «Papers» ────────────────────────────────────────────────────────────
  'Citizen. Yes, you, in the tracksuit. Papers.': ['Citizen. Yes, you, d*ckhead in the tracksuit. Papers.', 'Гражданин. Да-да, ты, *блан в спортивном. Документы.'],
  'The husks aren’t mine!': ['The f*cking husks aren’t mine!', 'Шелуха — не моя, бл*ть!'],
  'Freeze! Police!': ['Freeze, motherf*cker! Police!', 'Стоять, с*ка! Милиция!'],
  'Go and file your report. The yard is mine.': ['Go file your report, pr*ck. The yard is mine.', 'Иди, оформляй, г*ндон. Двор мой.'],
  'And you’re still not getting the tape.': ['And you’re still not getting the tape. You’re getting f*ck all.', 'А кассету я тебе всё равно не отдам. Х*й тебе, а не кассета.'],

  // ── b1 «First Day» ─────────────────────────────────────────────────────────
  'Citizens, put the sausage back!': ['Citizens, put the f*cking sausage back!', 'Граждане, колбасу — на место, бл*ть!'],
  'The sausage is returned to the state.': ['The sausage is returned to the state. The pilferers — to the earth.', 'Колбаса возвращена государству. Несуны — земле.'],
  'Wow. First day and the chief is going for the big one. That one isn’t free.': ['Wow. First day and the chief is going for the big one. That one isn’t f*cking free.', 'Ого. Начальник с первого дня — по-крупному. Это уже, бл*ть, не бесплатно.'],

  // ── b2 «The Fox» ───────────────────────────────────────────────────────────
  'Catch me first.': ['Catch me first. Can’t? Then f*ck off.', 'Догоните — пройду. Не догоните — п*шли нах*й.'],
  'Oh, you’re persistent.': ['Oh, you’re f*cking persistent.', 'Ой, а вы настойчивый, бл*ть.'],

  // ── b3 «Disco» ─────────────────────────────────────────────────────────────
  'Whoa. A cop at the disco. Lads, the slow dance is cancelled.': ['Whoa. A cop at the disco. Lads, the f*cking slow dance is cancelled.', 'Опа. Мент на дискотеке. Пацаны, медляк отменяется, х*ли.'],
  'Everybody dance!': ['Everybody dance! Even your mum — she’s been waiting for a slow dance since seventy-nine!', 'Танцуют все! Даже твоя мамка — она медляк с семьдесят девятого ждёт!'],
  'My turn on the dance floor!': ['My turn on the floor, chief! Shut your f*cking mouth!', 'Мой выход, начальник! Я твой рот еб*л!'],

  // ── b4 «The Search» ────────────────────────────────────────────────────────
  'Garage men don’t read warrants, chief. Come on, I’m with you. For a cut.': ['Garage men don’t read warrants, chief. They wipe their a*ses with them. Come on, I’m with you. For a cut.', 'Гаражники ордеров не читают, начальник. Они ими ж*пу вытирают. Пошли, я с тобой. За процент.'],
  'That spot’s ours. No tape.': ['That spot’s ours. No tape. Sh*t.', 'Точка наша. Кассеты нет. Х*йня.'],
  '“The yard is mine. P.” Confident.': ['“The yard is mine. P.” Cocky son of a b*tch.', '«Двор мой. П.» Самоуверенный, с*ка.'],

  // ── b5 «The Commandant» ────────────────────────────────────────────────────
  'I’m the one who does the seizing around here.': ['I’m the one who does the seizing around here. Got it, d*ckhead?', 'Изымаю здесь я. Понял, *блан?'],
  'Lights out at twenty-three hundred, chief!': ['Lights out at twenty-three hundred, chief! For you — a permanent one.', 'Отбой в двадцать три ноль-ноль, начальник! Тебе — вечный.'],
  'His yard, he says. We’ll see whose yard it is.': ['His yard, he says. We’ll see whose f*cking yard it is.', 'Двор, говорит. Посмотрим, чей это, бл*ть, двор.'],

  // ── a6 «The VCR» ───────────────────────────────────────────────────────────
  'Only right now the scrap collectors are taking my garage apart. For parts. With me inside.': ['Only right now the scrap collectors are taking my garage apart. For parts. With me inside, the b*stards.', 'Только сейчас металлисты разбирают мой гараж. На запчасти. Вместе со мной, с*ки.'],
  'Scrap collectors. In my district.': ['Scrap collectors. In my district. They’re f*cked.', 'Металлисты. В моём районе. П*здец им.'],
  'Don’t let them near the workbench!': ['Keep those d*ckheads off the workbench!', 'К верстаку этих долбо*бов не подпускай!'],
  'This is a garage, not a scrapyard!': ['This is a garage, not a scrapyard, you f*ckwits!', 'Это гараж, а не пункт приёма, *бланы!'],

  // ── a7 «The Heating Main» ──────────────────────────────────────────────────
  'And who might you be?': ['And who the f*ck might you be?', 'А ты, бл*ть, кто такой?'],
  'Off you go, volunteer. Volunteer somewhere else.': ['Off you go, volunteer. Volunteer somewhere else. The next world, say.', 'Иди, доброволец. Добровольничай в другом месте. На том свете, например.'],

  // ── a8 «The Parcel» ────────────────────────────────────────────────────────
  'I’ll repeat everything you say! Loudly!': ['I’ll repeat everything you say! Loudly! Especially the “f*ck”!', 'Я повторю всё, что скажешь! Громко! Особенно «п*здец»!'],
  'Then give him another word. «Yard».': ['Then give him another word. «F*ck off». And one more: «yard».', 'Тогда передай ему другое слово. «Нах*й». И ещё одно: «двор».'],

  // ── a9 «Sonka» ─────────────────────────────────────────────────────────────
  'Where’s the tape, Sonka? It was in the heating main. Now it isn’t.': ['Where’s the tape, Sonka? It was in the heating main. Now it f*cking isn’t.', 'Где кассета, Сонька? Она была в теплотрассе. Теперь её там нет, бл*ть.'],
  'Tapes come and go. Admirers stay. Boys — the Commandant is bothering me.': ['Tapes come and go. Admirers stay. Boys — the Commandant called me a sl*t. I haven’t decided yet whether to be offended or to send him a bill.', 'Кассеты приходят и уходят. Ухажёры остаются. Мальчики, Комендант назвал меня шл*хой. Я ещё не решила — обидеться или выставить счёт.'],
  'Nobody is bothering anybody. Order is being restored.': ['Nobody called anybody a sl*t. Order is being restored.', 'Никто никого шл*хой не называл. Наводится порядок.'],
  'Gently, boys. Don’t crease his tracksuit.': ['Gently, boys. Don’t crease his tracksuit — he’s being buried in it.', 'Аккуратнее, мальчики. Не помните ему костюм — в нём хоронить.'],
  'Next admirer!': ['Next pr*ck!', 'Следующий х*есос!'],
  'Out of admirers. Talk.': ['Out of f*cking admirers. Talk.', 'Ухажёры кончились, бл*ть. Рассказывай.'],
  'Who is this Tycoon?': ['Who the f*ck is this Tycoon?', 'Кто такой, бл*ть, этот Цеховик?'],
  'Then tonight the garages are closed.': ['Then tonight the garages are closed. To every pr*ck.', 'Тогда сегодня ночью гаражи закрыты. Для всех г*ндонов.'],

  // ── a10 «Night at the Cooperative» ─────────────────────────────────────────
  'I went out for bread. Again.': ['I went out for bread. Again. F*cking bread.', 'Я опять за хлебом вышел. Е*аный хлеб.'],
  'Halfway to dawn. Hold on!': ['Halfway to dawn. Hold the f*ck on!', 'Полпути до рассвета. Держимся, бл*ть!'],
  'The garages are ours. Tell your Tycoon.': ['The garages are ours. Tell your Tycoon to go f*ck himself.', 'Гаражи наши. Передайте своему Цеховику — пусть идёт нах*й.'],
  'Somebody. And that somebody wants my yard.': ['Somebody. And that motherf*cker wants my yard.', 'Кто-то. И этот пид*рас хочет мой двор.'],

  // ── b6 «The Flea Market» ───────────────────────────────────────────────────
  'Copies. Already copies. Who is selling?': ['Copies. Already copies. Which son of a b*tch is selling?', 'Копии. Уже копии. Какая с*ка торгует?'],
  'One stall closed.': ['One stall closed. For good.', 'Один лоток закрыт. Навсегда.'],

  // ── b7 «The Cooperative» ───────────────────────────────────────────────────
  'Boys, show the lieutenant the way out.': ['Boys, show the lieutenant the way out. Via the morgue.', 'Ребята, проводите лейтенанта к выходу. Через морг.'],
  'Don’t fall over in a hospital — they’ll keep you in for tests.': ['Don’t fall over in a hospital — they’ll keep you for spare parts.', 'Не падай в больнице — оставят на органы.'],
  'An American. In our district.': ['An American. In our district. F*ck me.', 'Американец. В нашем районе. Ох*еть.'],

  // ── b8 «The Cargo» ─────────────────────────────────────────────────────────
  'Guys, protect the business!': ['Guys, protect the business! F*ck ’em up!', 'Парни, защищайте бизнес! Фак ю, мазаф*керы!'],
  'At the cemetery. Naturally.': ['At the cemetery. F*cking naturally.', 'На кладбище. Ну естественно, бл*ть.'],

  // ── b9 «The Cemetery» ──────────────────────────────────────────────────────
  'A minute and a half in a cemetery at night. How romantic.': ['A minute and a half in a cemetery at night. How romantic. At least nobody has to carry us far.', 'Полторы минуты на кладбище ночью. Романтика. Хоть далеко не нести.'],
  'One is having a rest.': ['One’s having a rest. Handy — right on site.', 'Один отдыхает. Удобно — сразу на месте.'],
  'The siren. Backup is here. Everyone, face down.': ['The siren. Backup’s here. Everyone face down, b*stards. Those already underground can stay put.', 'Сирена. Наряд прибыл. Всем лицом в землю, с*ки. Кто в ней уже лежит — можно не вставать.'],

  // ── b10 «The Raid» ─────────────────────────────────────────────────────────
  'Raid! Nobody move — and nobody run!': ['Raid! Nobody f*cking move — and nobody run!', 'Облава! Никому не двигаться, бл*ть, — и не бегать!'],
  'The camp is taken. Lights out.': ['The camp is taken. Lights out. Permanently, for some.', 'Лагерь взят. Отбой. Для некоторых — вечный.'],

  // ── a11 «Workshop No. 3» ───────────────────────────────────────────────────
  'Commandant? Sery. I had a gym in the basement here. Then the «Workshop» lot came and turned it into a copying room.': ['Commandant? Sery. I had a gym in the basement here. Then those «Workshop» pr*cks came and turned it into a copying room.', 'Комендант? Серый. Я тут в подвале качалку держал. Потом пришли эти цеховые г*ндоны и сделали там копировальную.'],
  'One went home early.': ['One went home early. Feet first.', 'Один ушёл со смены пораньше. Вперёд ногами.'],
  'Who let a bird in here?!': ['Which d*ckhead let a bird in here?!', 'Какой долбо*б пустил сюда птицу?!'],

  // ── a12 «The Foundation Pit» ───────────────────────────────────────────────
  'Commandant! I’m Borka. I ran from the meat plant — and this lot put me to work on their site. At night they pour concrete — right towards your yard.': ['Commandant! I’m Borka. I ran from the meat plant — and these b*stards put me to work on their site. At night they pour concrete — right towards your yard.', 'Комендант! Я Борька. С мясокомбината сбежал — так эти с*ки меня на стройку загнали. По ночам льют бетон — прямо в сторону твоего двора.'],
  'The bucket’s ready. Keep them off the mixer!': ['The bucket’s ready. Keep those d*ckheads off the mixer!', 'Ведро готово. К мешалке этих долбо*бов не подпускай!'],
  'The concrete is jelly. There’s no tower.': ['The concrete’s jelly. No tower. F*ck your car park.', 'Бетон — кисель. Башни нет. Х*й вам, а не паркинг.'],
  'A calendar… We’ll see whose calendar it is.': ['A calendar… We’ll see whose f*cking calendar it is.', 'Календарь… Посмотрим, чей это, бл*ть, календарь.'],

  // ── b11 «The Roof» ─────────────────────────────────────────────────────────
  'Who placed the order?': ['Who the f*ck placed the order?', 'Кто заказчик, бл*ть?'],

  // ── the hidden comic «Flower Loser» (story/easter.ts) ──────────────────────
  'And who are you? Fat. Busty. Double-chinned… A flower loser!': ['Who the f*ck are you? Fat. Busty. Double-chinned… A flower loser!', 'А ты кто такой, бл*ть? Толстый. Сиськастый. Подбородочный… Лох цветочный!'],
  'With a bouquet! Flower loser! Flower loser! I’ll repeat it to the whole district!': ['With a f*cking bouquet! Flower loser! Flower loser! I’ll repeat it to the whole district!', 'С букетом, нах*й! Лох цветочный! Лох цветочный! Я это всему району повторю!'],

  // ── b12 «The Witness» ──────────────────────────────────────────────────────
  'Brigade! Clear the ward! It’s coming down!': ['Brigade! Clear the ward! These c*cksuckers are coming down!', 'Бригада! Палату освободить! Этих ваф#истов — под снос!'],
  'Explain.': ['Explain, for f*ck’s sake.', 'Поясните, бл*ть.'],
};
