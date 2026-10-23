/**
 * The words of the story mode (v0.2.13, part 4a): the prologue in 2089, the openings of the two
 * campaigns and chapter 1 of both — comic panels before and after each mission and the lines the
 * characters say during it. Every line is [English, Russian]. The numbers of the missions (maps, kits,
 * enemies, rewards) are in the shared package (packages/shared/src/story/missions.ts).
 */
import type { CharacterId, StoryCampaign, StoryRole } from '@blatkom/shared';
import { getLang } from '../i18n/index.js';

/** [English, Russian]. */
export type Line = readonly [string, string];

/** Who speaks: a character of 1989, the narrator's caption, or one of the people of 2089. */
export type Speaker = CharacterId | 'caption' | Person2089;
export type Person2089 = 'petr' | 'volkov' | 'arkady';

/** One panel of a comic: `neon` — 2089, `vhs` — a tape caption. */
export interface Beat {
  who: Speaker;
  say: Line;
  fx?: 'neon' | 'vhs';
}

/** Moments in a mission when somebody says something (each at most once). */
export type BarkKey = 'start' | 'firstKill' | 'half' | 'lowHp' | 'wave' | 'flag' | 'base' | 'win';

export interface MissionScript {
  title: Line;
  /** The objective line of the HUD: {left} — enemies still standing; {score} / {limit} — the side's points. */
  goal: Line;
  intro: Beat[];
  barks: Partial<Record<BarkKey, Beat>>;
  outro: Beat[];
}

/** The line in the player's language. */
export function line(l: Line): string {
  return l[getLang() === 'ru' ? 1 : 0];
}

export const CAMPAIGNS: Record<StoryCampaign, { hero: CharacterId; title: Line; tagline: Line }> = {
  petya: { hero: 'petya', title: ['My Yard', 'Мой двор'], tagline: ['Petya «The Commandant» keeps order in the yard — the streets’ way.', 'Петя «Комендант» наводит порядок во дворе — по-уличному.'] },
  uchastkovy: { hero: 'uchastkovy', title: ['The Report', 'Протокол'], tagline: ['Uchastkovy works the district — by the book, mostly.', 'Участковый наводит порядок на районе — по уставу. Почти.'] },
};

/** Chapter names (the ones not written yet are shown as «coming soon»). */
export const CHAPTER_TITLES: Record<StoryCampaign, readonly Line[]> = {
  petya: [['The Yard', 'Двор'], ['The Garages', 'Гаражи'], ['The Industrial Zone', 'Промзона'], ['The Yard Against Everyone', 'Двор против всех']],
  uchastkovy: [['The Beat', 'Участок'], ['The Black Market', 'Толкучка'], ['Downtown', 'Центр'], ['Tape No. 89', 'Кассета №89']],
};

/** What the narrator says when a mission is lost. */
export const FAIL_LINES: Record<'down' | 'time' | 'lost', Line> = {
  down: ['You wake up in 2089 with a headache. The case isn’t lost yet — once more.', 'Просыпаешься в 2089-м с головной болью. Дело ещё не проиграно — давай ещё раз.'],
  time: ['Time’s up. The district didn’t wait.', 'Время вышло. Район ждать не стал.'],
  lost: ['They got there first. Not this time.', 'Они оказались первыми. Не в этот раз.'],
};

export const ROLE_NAMES: Record<StoryRole, Line> = {
  loafer: ['Loafer', 'Тунеядец'],
  queue: ['Queue Jumper', 'Внеочередник'],
  speculator: ['Speculator', 'Спекулянт'],
  reseller: ['Reseller', 'Перекупщик'],
  pilferer: ['Pilferer', 'Несун'],
  dancer: ['Dancer', 'Танцор'],
  garage: ['Garage Man', 'Гаражник'],
  scrapper: ['Scrap Collector', 'Металлист'],
  patrol: ['Patrol Volunteer', 'Дружинник'],
  courier: ['Courier', 'Курьер'],
  suitor: ['Admirer', 'Ухажёр'],
  workshop: ['Workshop Man', 'Цеховой'],
  fence: ['Fence', 'Барыга'],
  guard: ['Bouncer', 'Охранник'],
  smuggler: ['Smuggler', 'Контрабандист'],
};

export const PEOPLE_2089: Record<Person2089, { art: CharacterId; name: Line }> = {
  petr: { art: 'petya', name: ['Pyotr Petrovich, 71, head of the residents’ committee', 'Пётр Петрович, 71 год, старший по дому'] },
  volkov: { art: 'uchastkovy', name: ['Inspector Volkov, Simulation Oversight', 'Инспектор Волков, надзор за симуляцией'] },
  arkady: { art: 'lev', name: ['A. Arkadiev, Arkadia Development', 'А. Аркадьев, «Аркадия Девелопмент»'] },
};

export const PROLOGUE: Beat[] = [
  { who: 'caption', fx: 'neon', say: ['2089. Nobody takes the city to court any more.', '2089 год. Город давно не делят в судах.'] },
  { who: 'caption', fx: 'neon', say: ['Disputes over yards, garages and parking spaces go to BLATKOM — the Bureau of Local Arbitration, Tribunals and KOMpromises.', 'Споры о дворах, гаражах и парковках решает БЛАТКОМ — Бюро Локальных Арбитражных Тяжб и КОМпромиссов.'] },
  { who: 'caption', fx: 'neon', say: ['Both sides lie down in capsules and wake up in 1989 — in a simulation where things are settled the old way.', 'Обе стороны ложатся в капсулы и просыпаются в 1989-м — в симуляции, где всё решают по-старому.'] },
  { who: 'caption', fx: 'neon', say: ['The simulation hands out bodies by temperament: half human, half beast. Hold the district in there and you are right out here. By law.', 'Тело симуляция выдаёт по характеру: наполовину человек, наполовину зверь. Кто удержит район там — тот прав здесь. По закону.'] },
  { who: 'petr', fx: 'neon', say: ['I’m not giving up the yard. There’s lilac there. A bench. Forty years I’ve kept order there.', 'Двор не отдам. Там сирень. Там лавочка. Там я сорок лет порядок держу.'] },
  { who: 'caption', fx: 'neon', say: ['The developer Arkadia Development wants a parking tower where the yard is. Nine hundred spaces.', 'Застройщик «Аркадия Девелопмент» хочет поставить на месте двора паркинг-башню. На девятьсот мест.'] },
  { who: 'volkov', fx: 'neon', say: ['Someone in BLATKOM wins every single dispute. That doesn’t happen. Find, file, report.', 'Кто-то в БЛАТКОМе выигрывает все споры подряд. Так не бывает. Найти, оформить, доложить.'] },
  { who: 'caption', fx: 'neon', say: ['Getting knocked out in there hurts no one: you just wake up in 2089 with a headache. And lose the case.', 'Если тебя там «устранили» — ничего страшного: просыпаешься в 2089-м с головной болью. И проигрываешь дело.'] },
  { who: 'caption', fx: 'vhs', say: ['Two cases. One district. Tape’s rolling.', 'Два дела. Один район. Плёнка пошла.'] },
];

export const CAMPAIGN_OPENING: Record<StoryCampaign, Beat[]> = {
  petya: [
    { who: 'caption', fx: 'vhs', say: ['The 3rd Microdistrict. October 1989. It smells of leaves, petrol and other people’s business.', '3-й микрорайон. Октябрь 1989-го. Пахнет листвой, бензином и чужими делами.'] },
    { who: 'petya', say: ['Some hide. A comb, a tracksuit… Actually, quite respectable.', 'Ну и шкура. Гребень, спортивка… А что, солидно.'] },
  ],
  uchastkovy: [
    { who: 'caption', fx: 'vhs', say: ['The police post, 3rd Microdistrict. October 1989.', 'Опорный пункт милиции, 3-й микрорайон. Октябрь 1989-го.'] },
    { who: 'uchastkovy', say: ['Cap, tunic, tail. The regulations don’t provide for a tail. Fine — we’ll file it as is.', 'Фуражка, китель, хвост. Хвост в уставе не предусмотрен. Ладно, оформим как есть.'] },
  ],
};

export const MISSION_SCRIPTS: Record<string, MissionScript> = {
  a1: {
    title: ['Reveille', 'Подъём'],
    goal: ['Free the bench: loafers {left}', 'Освободи лавочку: тунеядцы {left}'],
    intro: [
      { who: 'caption', say: ['Six a.m. The yard.', 'Шесть утра. Двор.'] },
      { who: 'vorona', say: ['Caw… Morning, new boy. Some loafers from the next yard have taken the bench by entrance three.', 'Карр… Доброе утро, новенький. Лавочку у третьего подъезда заняли тунеядцы с соседнего двора.'] },
      { who: 'petya', say: ['The bench by three? Only our own have sat there since seventy-one.', 'Лавочку у третьего? Там с семьдесят первого года сидят только свои.'] },
      { who: 'vorona', say: ['That’s what I’m saying. Three of them. Cracking sunflower seeds. Husks straight onto the flowerbed.', 'Вот и я говорю. Трое. Семечки лузгают. Шелуху — прямо на клумбу.'] },
      { who: 'petya', say: ['Husks on the flowerbed… That isn’t hooliganism any more. That’s a challenge.', 'Шелуха на клумбу… Это уже не хулиганство. Это вызов.'] },
    ],
    barks: {
      start: { who: 'petya', say: ['No unauthorised persons!', 'Посторонним вход воспрещён!'] },
      firstKill: { who: 'petya', say: ['One checked out.', 'Один выписан.'] },
      win: { who: 'petya', say: ['My yard. My rules.', 'Здесь мой двор. Здесь мои правила.'] },
    },
    outro: [
      { who: 'vorona', say: ['Nicely done. I’m Karlych, by the way. Whatever’s said in this yard, I hear it.', 'Красиво. Я Карлыч, кстати. Всё, что во дворе говорят, — слышу я.'] },
      { who: 'petya', say: ['Then listen: from today there’s order in this yard. Lights out at twenty-three hundred.', 'Тогда слушай: с сегодняшнего дня во дворе порядок. Отбой в двадцать три ноль-ноль.'] },
      { who: 'vorona', say: ['Order… What’s coming, everyone will need some order. Word is, a certain tape has turned up in the district.', 'Порядок… Тут скоро такое начнётся, что порядок понадобится всем. Говорят, в районе объявилась одна кассета.'] },
    ],
  },
  a2: {
    title: ['The Queue', 'Очередь'],
    goal: ['Restore the queue: {score} of {limit} eliminations', 'Восстанови очередь: {score} из {limit} устранений'],
    intro: [
      { who: 'caption', say: ['The Jubilee grocery. The queue for bread.', 'Гастроном «Юбилейный». Очередь за хлебом.'] },
      { who: 'mihalych', say: ['I only went out for bread.', 'Я вообще за хлебом вышел.'] },
      { who: 'petya', say: ['The queue isn’t moving, old man. What’s going on?', 'Очередь не двигается, отец. Что там?'] },
      { who: 'mihalych', say: ['The next yard is jumping the queue. Say they’re allowed — they know someone at the trade office.', 'Соседский двор лезет без очереди. Говорят, им можно — у них знакомый в торге.'] },
      { who: 'petya', say: ['Jumping the queue. In my district.', 'Без очереди. В моём районе.'] },
      { who: 'mihalych', say: ['Order isn’t what they write down. Order is what people hold up. Let’s go and hold it.', 'Порядок — это не то, что пишут. Порядок — это то, что держится на людях. Пошли, подержим.'] },
    ],
    barks: {
      start: { who: 'mihalych', say: ['Stay behind me, Commandant.', 'Держись за мной, комендант.'] },
      half: { who: 'petya', say: ['A queue is sacred!', 'Очередь — это святое!'] },
      lowHp: { who: 'mihalych', say: ['Don’t play the hero. I’ve got you.', 'Не геройствуй. Прикрою.'] },
      win: { who: 'mihalych', say: ['Now we can go for bread.', 'Вот теперь можно и за хлебом.'] },
    },
    outro: [
      { who: 'mihalych', say: ['Mikhalych. Demobbed. Thirty years demobbed.', 'Михалыч. Дембель. Тридцать лет как дембель.'] },
      { who: 'petya', say: ['Petya. Commandant. Forty years a commandant.', 'Петя. Комендант. Сорок лет как комендант.'] },
      { who: 'mihalych', say: ['We’ll get on. Want some of my loaf?', 'Сработаемся. Батон будешь?'] },
    ],
  },
  a3: {
    title: ['Light Bulbs', 'Лампочки'],
    goal: ['Run off the speculators: {left} left', 'Разгони спекулянтов: осталось {left}'],
    intro: [
      { who: 'caption', say: ['Third day of darkness in the stairwell. Light bulbs are deficit goods.', 'В подъезде третий день темно. Лампочки — дефицит.'] },
      { who: 'petya', say: ['Forty watts. Just one. Where?', 'Сорок ватт. Хотя бы одна. Где?'] },
      { who: 'vorona', say: ['Bulbs — only Valuta has them. The garages, third row, blue doors. Say Karlych sent you.', 'Лампочки — только у Валюты. Гаражи, третий ряд, синие ворота. Скажешь, что от Карлыча.'] },
      { who: 'caption', say: ['The garage cooperative. Blue doors.', 'Гаражный кооператив. Синие ворота.'] },
      { who: 'valuta', say: ['Bulbs? Got them. Got everything. Connections decide everything.', 'Лампочки? Есть. Всё есть. Связи решают всё.'] },
      { who: 'valuta', say: ['But I have a problem. Speculators from the next cooperative are undercutting me. Run them off and the box is yours. Sixty-watt.', 'Но у меня проблема. Спекулянты с соседнего кооператива сбивают мне цены. Разгонишь — коробка твоя. Шестидесятиваттных.'] },
      { who: 'petya', say: ['Sixty… Deal.', 'Шестидесяти… Договорились.'] },
    ],
    barks: {
      start: { who: 'valuta', say: ['Quietly, Commandant. Business likes quiet.', 'Тихо, комендант. Дело любит тишину.'] },
      wave: { who: 'valuta', say: ['That’s not all. Here comes the big batch!', 'Это ещё не всё. Пошла крупная партия!'] },
      win: { who: 'valuta', say: ['A pleasure doing business.', 'Приятно иметь дело.'] },
    },
    outro: [
      { who: 'valuta', say: ['The box is yours. Remember: I owe nobody. People owe me.', 'Коробка твоя. Запомни: я никому не должен. Мне — должны.'] },
      { who: 'petya', say: ['The stairwell gets its light. The rest — we’ll see.', 'В подъезде будет свет. А остальное — посмотрим.'] },
      { who: 'valuta', say: ['One more thing, Commandant. Has anyone asked you about the tape yet? No? They will.', 'И ещё, комендант. Про кассету тебя уже спрашивали? Нет? Спросят.'] },
    ],
  },
  a4: {
    title: ['Tape No. 89', 'Кассета №89'],
    goal: ['Bring the tape to your bench: {score} of {limit}', 'Принеси кассету к своей лавочке: {score} из {limit}'],
    intro: [
      { who: 'vorona', say: ['Listen carefully. There’s a tape. Number eighty-nine. No label, no case.', 'Слушай внимательно. Есть кассета. Номер восемьдесят девять. Без надписи, без коробки.'] },
      { who: 'vorona', say: ['Whoever plays it on the VCR at the House of Culture… how to put it… rewrites the district.', 'Кто прокрутит её на видаке в Доме культуры, тот… как бы сказать… переписывает район.'] },
      { who: 'petya', say: ['Rewrites? As in, the yard becomes a car park?', 'Переписывает? Это как — двор под паркинг?'] },
      { who: 'vorona', say: ['Where did you get a word like that — “car park”?', 'Ты откуда слово такое знаешь — «паркинг»?'] },
      { who: 'petya', say: ['No idea. Dreamt it.', 'Сам не знаю. Приснилось.'] },
      { who: 'mihalych', say: ['The resellers keep it at their place, behind the transformer box. We’ll take it.', 'Перекупщики держат её у себя, за трансформаторной. Заберём.'] },
    ],
    barks: {
      start: { who: 'vorona', say: ['I’ll keep an eye on their stand. Caw!', 'Я присмотрю за их стойкой. Карр!'] },
      flag: { who: 'petya', say: ['Got the tape! Cover me!', 'Кассета у меня! Прикройте!'] },
      win: { who: 'vorona', say: ['Caw! Now that’s what I call a cultural exchange.', 'Карр! Вот это я понимаю — культурный обмен.'] },
    },
    outro: [
      { who: 'caption', say: ['A tape with no label. Warm, as if someone had just been watching it.', 'Кассета без надписи. Тёплая, будто её только что смотрели.'] },
      { who: 'mihalych', say: ['Are we watching it?', 'Смотреть будем?'] },
      { who: 'petya', say: ['Not now. Someone’s coming. In a peaked cap.', 'Не сейчас. Кто-то идёт. В фуражке.'] },
    ],
  },
  a5: {
    title: ['Papers', 'Документы'],
    goal: ['Don’t get booked: {score} of {limit} first', 'Не дай себя оформить: {score} из {limit} первым'],
    intro: [
      { who: 'uchastkovy', say: ['Citizen. Yes, you, in the tracksuit. Papers.', 'Гражданин. Да-да, вы, в спортивном. Документы.'] },
      { who: 'petya', say: ['I’ve got a pass for this yard. A permanent one. I wrote it myself.', 'У меня пропуск во двор. Вечный. Я его сам себе выписал.'] },
      { who: 'uchastkovy', say: ['Taking the law into your own hands. Plus theft of a videotape. Plus husks on the flowerbed.', 'Самоуправство. Плюс хищение видеокассеты. Плюс шелуха на клумбе.'] },
      { who: 'petya', say: ['The husks aren’t mine!', 'Шелуха — не моя!'] },
      { who: 'uchastkovy', say: ['We’ll sort it out. Come along.', 'Разберёмся. Пройдёмте.'] },
    ],
    barks: {
      start: { who: 'uchastkovy', say: ['Freeze! Police!', 'Стоять! Милиция!'] },
      half: { who: 'uchastkovy', say: ['Resisting is a separate article.', 'Сопротивление — отдельная статья.'] },
      win: { who: 'petya', say: ['Go and file your report. The yard is mine.', 'Иди, оформляй. Двор мой.'] },
    },
    outro: [
      { who: 'uchastkovy', say: ['This isn’t over, citizen. This is a report.', 'Это не конец, гражданин. Это протокол.'] },
      { who: 'petya', say: ['And you’re still not getting the tape.', 'А кассету я тебе всё равно не отдам.'] },
      { who: 'petr', fx: 'neon', say: ['2089. Capsule 2. Pyotr Petrovich smiles in his sleep: “The yard held.”', '2089. Капсула №2. Пётр Петрович улыбается во сне: «Двор устоял».'] },
    ],
  },
  b1: {
    title: ['First Day', 'Первый день'],
    goal: ['Stop the pilferers: {left} left', 'Задержи несунов: осталось {left}'],
    intro: [
      { who: 'caption', say: ['The Jubilee grocery, staff entrance. Night.', 'Гастроном «Юбилейный», служебный вход. Ночь.'] },
      { who: 'koshka', say: ['Can’t sleep, chief? Every night someone carries the sausage out of here. By the crate.', 'Не спится, начальник? Тут каждую ночь колбасу выносят. Ящиками.'] },
      { who: 'uchastkovy', say: ['Pilferers. A familiar genre. How many?', 'Несуны. Знакомый жанр. Сколько их?'] },
      { who: 'koshka', say: ['Four. One of them has the warehouse keys. That tip’s free. The first one always is.', 'Четверо. У одного — ключи от склада. Подсказка бесплатная. Первая — всегда.'] },
      { who: 'uchastkovy', say: ['And where are you off to? Show me your papers. …Fine, later.', 'А ты куда? Документы покажи. …Ладно, потом.'] },
    ],
    barks: {
      start: { who: 'uchastkovy', say: ['Citizens, put the sausage back!', 'Граждане, колбасу — на место!'] },
      firstKill: { who: 'uchastkovy', say: ['One. Noting it down.', 'Один. Пишем.'] },
      win: { who: 'uchastkovy', say: ['The sausage is returned to the state.', 'Колбаса возвращена государству.'] },
    },
    outro: [
      { who: 'koshka', say: ['Murka. If you need anything, ask at the market bar. Everyone knows me there.', 'Мурка. Если что — спроси в баре на рынке, меня там все знают.'] },
      { who: 'uchastkovy', say: ['And what does everyone know about tape number eighty-nine?', 'А что все знают про кассету номер восемьдесят девять?'] },
      { who: 'koshka', say: ['Wow. First day and the chief is going for the big one. That one isn’t free.', 'Ого. Начальник с первого дня — по-крупному. Это уже не бесплатно.'] },
    ],
  },
  b2: {
    title: ['The Fox', 'Лиса'],
    goal: ['Catch Alisa: {score} of {limit} first', 'Догони Алису: {score} из {limit} первым'],
    intro: [
      { who: 'caption', say: ['The House of Culture. On the poster: “Video salon. Foreign films.”', 'Дом культуры. На афише — «Видеосалон. Зарубежное кино».'] },
      { who: 'lisa', say: ['Looking for a tape? I’ve got one. Three, actually. All of them number eighty-nine.', 'Кассету ищете? У меня есть. Даже три. Все — номер восемьдесят девять.'] },
      { who: 'uchastkovy', say: ['Citizen, selling goods by hand in the House of Culture is prohibited.', 'Гражданка, торговля с рук в Доме культуры запрещена.'] },
      { who: 'lisa', say: ['I’m not selling. I’m giving them away. For a small consideration.', 'А я не торгую. Я дарю. За небольшое вознаграждение.'] },
      { who: 'uchastkovy', say: ['Come along.', 'Пройдёмте.'] },
      { who: 'lisa', say: ['Catch me first.', 'Догоните — пройду.'] },
    ],
    barks: {
      start: { who: 'lisa', say: ['Beauty is a weapon too, chief!', 'Красота — тоже оружие, начальник!'] },
      half: { who: 'lisa', say: ['Oh, you’re persistent.', 'Ой, а вы настойчивый.'] },
      win: { who: 'uchastkovy', say: ['All three tapes — confiscated.', 'Все три кассеты — изъяты.'] },
    },
    outro: [
      { who: 'caption', say: ['All three tapes: Swan Lake.', 'На всех трёх кассетах — «Лебединое озеро».'] },
      { who: 'lisa', say: ['I never said they were real.', 'Я же не говорила, что они настоящие.'] },
      { who: 'uchastkovy', say: ['So a real one exists somewhere. Who else is looking for it?', 'Значит, настоящая где-то есть. Кто ещё её ищет?'] },
      { who: 'lisa', say: ['Everyone, chief. But they definitely saw it at Vityok’s disco.', 'Все, начальник. Но у Витька на дискотеке её точно видели.'] },
    ],
  },
  b3: {
    title: ['Disco', 'Дискотека'],
    goal: ['Break up the disco: {left} left', 'Разними дискотеку: осталось {left}'],
    intro: [
      { who: 'caption', say: ['Disco night “For the over-thirties”. Everyone’s over thirty except the music.', 'Дискотека «Кому за тридцать». Всем за тридцать, кроме музыки.'] },
      { who: 'piranya', say: ['Whoa. A cop at the disco. Lads, the slow dance is cancelled.', 'Опа. Мент на дискотеке. Ребята, медляк отменяется.'] },
      { who: 'uchastkovy', say: ['Citizen Vityok, where is the tape?', 'Гражданин Витёк, где кассета?'] },
      { who: 'piranya', say: ['Tape? There are only records here. And teeth. Lots of teeth.', 'Кассета? Тут только пластинки. И зубы. Много зубов.'] },
    ],
    barks: {
      start: { who: 'piranya', say: ['Everybody dance!', 'Танцуют все!'] },
      wave: { who: 'piranya', say: ['My turn on the dance floor!', 'Мой выход, начальник!'] },
      lowHp: { who: 'uchastkovy', say: ['That isn’t dancing any more. That’s a breach of the peace.', 'Это уже не танец. Это нарушение общественного порядка.'] },
      win: { who: 'uchastkovy', say: ['The disco is over. Thank you all, you may go. Except Vityok.', 'Дискотека окончена. Всем спасибо, все свободны. Кроме Витька.'] },
    },
    outro: [
      { who: 'piranya', say: ['Fine, fine! The Commandant took the tape. Ginger fellow, tracksuit, a comb on his head. Said “to the yard”.', 'Ладно, ладно! Кассету унёс Комендант. Рыжий такой, в спортивке, с гребнем. Сказал — «во двор».'] },
      { who: 'uchastkovy', say: ['A commandant. Tracksuit. Comb. Noted.', 'Комендант. В спортивке. С гребнем. Записал.'] },
    ],
  },
  b4: {
    title: ['The Search', 'Обыск'],
    goal: ['Search the garages: hold the spots, {score} of {limit} points', 'Обыщи гаражи: держи точки, {score} из {limit} очков'],
    intro: [
      { who: 'koshka', say: ['The Commandant keeps the tape somewhere in the garages. Three spots: the inspection pit, the tyre store, the watchman’s hut.', 'Комендант держит кассету где-то в гаражах. Три точки: смотровая яма, склад покрышек, будка сторожа.'] },
      { who: 'uchastkovy', say: ['I have a search warrant. Almost. I will have.', 'Ордер на обыск у меня есть. Почти. Будет.'] },
      { who: 'koshka', say: ['Garage men don’t read warrants, chief. Come on, I’m with you. For a cut.', 'Гаражники ордеров не читают, начальник. Пошли, я с тобой. За процент.'] },
    ],
    barks: {
      start: { who: 'koshka', say: ['I’ll take the hut, you take the pit.', 'Я — на будку, ты — на яму.'] },
      base: { who: 'koshka', say: ['That spot’s ours. No tape.', 'Точка наша. Кассеты нет.'] },
      win: { who: 'uchastkovy', say: ['The search is complete. The witnesses may go.', 'Обыск окончен. Понятые свободны.'] },
    },
    outro: [
      { who: 'caption', say: ['In the inspection pit: a jar of pickles, a 12 spanner and a note.', 'В смотровой яме — банка огурцов, ключ на двенадцать и записка.'] },
      { who: 'uchastkovy', say: ['“The yard is mine. P.” Confident.', '«Двор мой. П.» Самоуверенно.'] },
      { who: 'koshka', say: ['He’s in the yard, chief. With the tape. And a bear.', 'Он во дворе, начальник. С кассетой. И с медведем.'] },
    ],
  },
  b5: {
    title: ['The Commandant', 'Комендант'],
    goal: ['Detain Petya: {score} of {limit} first', 'Задержи Петю: {score} из {limit} первым'],
    intro: [
      { who: 'uchastkovy', say: ['Citizen in the tracksuit. You are detained on suspicion of stealing a videotape.', 'Гражданин в спортивном. Вы задержаны по подозрению в хищении видеокассеты.'] },
      { who: 'petya', say: ['It isn’t theft. It’s a seizure. In favour of the yard.', 'Это не хищение. Это изъятие. В пользу двора.'] },
      { who: 'uchastkovy', say: ['I’m the one who does the seizing around here.', 'Изымаю здесь я.'] },
      { who: 'petya', say: ['My yard. My rules.', 'Здесь мой двор. Здесь мои правила.'] },
    ],
    barks: {
      start: { who: 'petya', say: ['No unauthorised persons!', 'Посторонним вход воспрещён!'] },
      half: { who: 'petya', say: ['Lights out at twenty-three hundred, chief!', 'Отбой в двадцать три ноль-ноль, начальник!'] },
      win: { who: 'uchastkovy', say: ['Detained. Nearly. The report is written.', 'Задержан. Почти. Протокол составлен.'] },
    },
    outro: [
      { who: 'caption', say: ['The Commandant got away through the basement. With the tape.', 'Комендант ушёл через подвал. Кассету унёс с собой.'] },
      { who: 'uchastkovy', say: ['His yard, he says. We’ll see whose yard it is.', 'Двор, говорит. Посмотрим, чей это двор.'] },
      { who: 'volkov', fx: 'neon', say: ['2089. Oversight. Inspector Volkov opens his eyes: “He isn’t a crook. He’s… a residents’ committee head.”', '2089. Отдел надзора. Инспектор Волков открывает глаза: «Он не жулик. Он… старший по дому».'] },
    ],
  },
  // ── «My Yard», chapter 2 «The Garages» ─────────────────────────────────────
  a6: {
    title: ['The VCR', 'Видак'],
    goal: ['Drive off the scrap collectors: {score} of {limit}', 'Прогони металлистов: {score} из {limit}'],
    intro: [
      { who: 'caption', fx: 'vhs', say: ['The garage cooperative «Motorist». The tape needs a VCR. The VCR needs Tolyan.', 'Гаражный кооператив «Автолюбитель». Для кассеты нужен видак. Для видака — Толян.'] },
      { who: 'petya', say: ['They say you’ve got a VCR. A working one.', 'Говорят, у тебя видак есть. Рабочий.'] },
      { who: 'varan', say: ['Assembled from three dead ones. Plays anything. Rewinds by hand.', 'Собран из трёх покойных. Показывает всё. Перематывает вручную.'] },
      { who: 'varan', say: ['Only right now the scrap collectors are taking my garage apart. For parts. With me inside.', 'Только сейчас металлисты разбирают мой гараж. На запчасти. Вместе со мной.'] },
      { who: 'petya', say: ['Scrap collectors. In my district.', 'Металлисты. В моём районе.'] },
      { who: 'varan', say: ['Help me out and the VCR is yours for the evening. With popcorn. Well, with sunflower seeds.', 'Поможешь — видак твой на вечер. С попкорном. Ну, с семечками.'] },
    ],
    barks: {
      start: { who: 'varan', say: ['Don’t let them near the workbench!', 'К верстаку не подпускай!'] },
      half: { who: 'petya', say: ['This is a garage, not a scrapyard!', 'Это гараж, а не пункт приёма!'] },
      lowHp: { who: 'varan', say: ['Hold on, I’ll weld you back together later.', 'Держись, потом заварю.'] },
      win: { who: 'varan', say: ['The VCR is saved. The garage — almost.', 'Видак спасён. Гараж — почти.'] },
    },
    outro: [
      { who: 'caption', say: ['Evening. The garage. The VCR hums like a tram. The tape goes in.', 'Вечер. Гараж. Видак гудит, как трамвай. Кассета входит.'] },
      { who: 'caption', fx: 'vhs', say: ['On the screen: our yard. Only instead of the lilac — a grey tower. Nine hundred parking spaces.', 'На экране — наш двор. Только вместо сирени — серая башня. Девятьсот машиномест.'] },
      { who: 'varan', say: ['Is that a film? Science fiction?', 'Это кино? Фантастика?'] },
      { who: 'petya', say: ['It’s a threat. Somebody wants this yard. Not now — later. And for good.', 'Это угроза. Кто-то хочет этот двор. Не сейчас — потом. И насовсем.'] },
    ],
  },
  a7: {
    title: ['The Heating Main', 'Теплотрасса'],
    goal: ['Hold out until the patrol gives up', 'Продержись, пока дружинникам не надоест'],
    intro: [
      { who: 'caption', say: ['Morning. Volunteer patrols are combing the garages. Word is, the police are looking for a tape.', 'Утро. По гаражам ходят дружинники. Говорят, милиция ищет кассету.'] },
      { who: 'tarakan', say: ['Psst. Down here. Not through the gate — through the hatch.', 'Тс-с. Сюда. Не через ворота — через люк.'] },
      { who: 'petya', say: ['And who might you be?', 'А ты кто такой?'] },
      { who: 'tarakan', say: ['Prusak. I live where it’s warm. The heating main runs under the whole district — I know every valve.', 'Прусак. Я живу там, где тепло. Теплотрасса идёт под всем районом — я каждую задвижку знаю.'] },
      { who: 'tarakan', say: ['The patrol will come down after us. We just hold out until they get bored. They get bored fast.', 'Дружинники полезут следом. Надо продержаться, пока им не надоест. Им быстро надоедает.'] },
      { who: 'petya', say: ['Holding out is something I know how to do.', 'Держаться — это я умею.'] },
    ],
    barks: {
      start: { who: 'tarakan', say: ['Mind the pipes, they’re hot. So is the patrol.', 'Осторожно, трубы горячие. Дружинники тоже.'] },
      firstKill: { who: 'petya', say: ['Off you go, volunteer. Volunteer somewhere else.', 'Иди, доброволец. Добровольничай в другом месте.'] },
      lowHp: { who: 'tarakan', say: ['Breathe through your nose! The steam helps. Probably.', 'Дыши носом! Пар помогает. Наверное.'] },
      win: { who: 'tarakan', say: ['That’s it, they’ve gone for tea. The patrol’s timetable is sacred.', 'Всё, ушли пить чай. Расписание у дружины святое.'] },
    },
    outro: [
      { who: 'tarakan', say: ['Keep the tape down here, in the warm. Nobody looks for anything underground.', 'Кассету держи здесь, в тепле. Под землёй никто ничего не ищет.'] },
      { who: 'petya', say: ['Fine. But first — who else wants it?', 'Ладно. Но сначала — кто ещё её хочет?'] },
      { who: 'tarakan', say: ['Gosha knows. Gosha knows everything that passes from hand to hand.', 'Гоша знает. Гоша знает всё, что переходит из рук в руки.'] },
    ],
  },
  a8: {
    title: ['The Parcel', 'Посылка'],
    goal: ['Get the parcels back to your stand: {score} of {limit}', 'Верни посылки на свою точку: {score} из {limit}'],
    intro: [
      { who: 'caption', say: ['The abandoned pioneer camp «Sunny Glade». Gosha holds his meetings here: nobody has answered the bugle for years.', 'Заброшенный пионерлагерь «Солнечная поляна». Здесь Гоша назначает встречи: на горн давно никто не приходит.'] },
      { who: 'popugay', say: ['Petya! Petya! Good news and bad news. Which first?', 'Петя! Петя! Новость хорошая и плохая. С какой начать?'] },
      { who: 'petya', say: ['The bad.', 'С плохой.'] },
      { who: 'popugay', say: ['Couriers took the yard’s cash box. The playground money. Forty-three roubles and a button.', 'Курьеры увели кассу двора. Деньги на детскую площадку. Сорок три рубля и пуговица.'] },
      { who: 'petya', say: ['And the good?', 'А хорошая?'] },
      { who: 'popugay', say: ['They work for a serious man, and they’ll give it all back — if you hand over the tape. Was that the good one? I mixed them up.', 'Они работают на серьёзного человека и всё вернут — если отдашь кассету. Это была хорошая? Я перепутал.'] },
    ],
    barks: {
      start: { who: 'popugay', say: ['I’ll repeat everything you say! Loudly!', 'Я повторю всё, что скажешь! Громко!'] },
      flag: { who: 'petya', say: ['The cash box is mine! Forty-three roubles — and the button!', 'Касса у меня! Сорок три рубля — и пуговица!'] },
      half: { who: 'popugay', say: ['One parcel home! One more!', 'Одна посылка дома! Ещё одна!'] },
      win: { who: 'popugay', say: ['Delivered! Delivered! Sign here!', 'Доставлено! Доставлено! Распишитесь!'] },
    },
    outro: [
      { who: 'popugay', say: ['The serious man won’t like this. He doesn’t like the word «no».', 'Серьёзному человеку это не понравится. Он не любит слово «нет».'] },
      { who: 'petya', say: ['Then give him another word. «Yard».', 'Тогда передай ему другое слово. «Двор».'] },
      { who: 'popugay', say: ['And watch out for Sonka. She’s been asking about you. Very sweetly.', 'И осторожнее с Сонькой. Она про тебя спрашивала. Очень ласково.'] },
    ],
  },
  a9: {
    title: ['Sonka', 'Сонька'],
    goal: ['Get past the admirers: {left} left', 'Пробейся через ухажёров: осталось {left}'],
    intro: [
      { who: 'caption', say: ['The back room of the Jubilee grocery. It smells of herring and expensive perfume.', 'Подсобка гастронома «Юбилейный». Пахнет селёдкой и дорогими духами.'] },
      { who: 'zmeya', say: ['So you’re the Commandant. I imagined someone taller. And without the comb.', 'Так вот ты какой, Комендант. Я думала, повыше. И без гребня.'] },
      { who: 'petya', say: ['Where’s the tape, Sonka? It was in the heating main. Now it isn’t.', 'Где кассета, Сонька? Она была в теплотрассе. Теперь её там нет.'] },
      { who: 'zmeya', say: ['Tapes come and go. Admirers stay. Boys — the Commandant is bothering me.', 'Кассеты приходят и уходят. Ухажёры остаются. Мальчики, Комендант ко мне пристаёт.'] },
      { who: 'petya', say: ['Nobody is bothering anybody. Order is being restored.', 'Никто ни к кому не пристаёт. Наводится порядок.'] },
    ],
    barks: {
      start: { who: 'zmeya', say: ['Gently, boys. Don’t crease his tracksuit.', 'Аккуратнее, мальчики. Не помните ему костюм.'] },
      firstKill: { who: 'petya', say: ['Next admirer!', 'Следующий ухажёр!'] },
      wave: { who: 'zmeya', say: ['Fine. I’ll do it myself. As always.', 'Ладно. Сама. Как всегда.'] },
      lowHp: { who: 'petya', say: ['Herring and lead. A terrible combination.', 'Селёдка и свинец. Ужасное сочетание.'] },
      win: { who: 'petya', say: ['Out of admirers. Talk.', 'Ухажёры кончились. Рассказывай.'] },
    },
    outro: [
      { who: 'zmeya', say: ['Fine. I took it. And gave it to the Shadow Tycoon’s people. They pay in imported tights.', 'Ладно. Взяла. И отдала людям Цеховика. Они платят импортными колготками.'] },
      { who: 'petya', say: ['Who is this Tycoon?', 'Кто такой этот Цеховик?'] },
      { who: 'zmeya', say: ['Nobody has seen him. But tonight his men come to the garages — for the rest. For your Tolyan, for one.', 'Его никто не видел. Но сегодня ночью его люди придут в гаражи — за остальным. За твоим Толяном, например.'] },
      { who: 'petya', say: ['Then tonight the garages are closed.', 'Тогда сегодня ночью гаражи закрыты.'] },
    ],
  },
  a10: {
    title: ['Night at the Cooperative', 'Ночь в кооперативе'],
    goal: ['Hold the garages: {score} of {limit} points', 'Удержи гаражи: {score} из {limit} очков'],
    intro: [
      { who: 'caption', say: ['Midnight. The garage cooperative. Three boxes: Tolyan’s, the watchman’s and the one with the tape.', 'Полночь. Гаражный кооператив. Три бокса: Толяна, сторожа и тот, где кассета.'] },
      { who: 'mihalych', say: ['I went out for bread. Again.', 'Я опять за хлебом вышел.'] },
      { who: 'varan', say: ['Four of them. In overalls. With a «Workshop» stencil.', 'Их четверо. В спецовках. С трафаретом «Цех».'] },
      { who: 'petya', say: ['Three boxes, three points. Whoever holds the garages holds the tape.', 'Три бокса — три точки. Кто держит гаражи, тот держит кассету.'] },
      { who: 'mihalych', say: ['Order is what people hold up. Let’s hold up the garages.', 'Порядок держится на людях. Подержим гаражи.'] },
    ],
    barks: {
      start: { who: 'mihalych', say: ['You take the watchman’s box. I’ll take the far one.', 'Бери будку сторожа. Я — дальний бокс.'] },
      base: { who: 'varan', say: ['The box is ours! The light’s still on!', 'Бокс наш! Свет ещё горит!'] },
      half: { who: 'petya', say: ['Halfway to dawn. Hold on!', 'Полпути до рассвета. Держимся!'] },
      lowHp: { who: 'mihalych', say: ['Get down behind the car. I’ve seen worse.', 'Ложись за машину. Я и не такое видел.'] },
      win: { who: 'petya', say: ['The garages are ours. Tell your Tycoon.', 'Гаражи наши. Передайте своему Цеховику.'] },
    },
    outro: [
      { who: 'caption', say: ['Dawn. The tape is back. On its label someone has written in pencil: «A. A.»', 'Рассвет. Кассета вернулась. На наклейке кто-то написал карандашом: «А. А.»'] },
      { who: 'varan', say: ['«A. A.»? Some kind of agency?', '«А. А.»? Агентство какое-то?'] },
      { who: 'petya', say: ['Somebody. And that somebody wants my yard.', 'Кто-то. И этот кто-то хочет мой двор.'] },
      { who: 'petr', fx: 'neon', say: ['2089. Capsule 2. Pyotr Petrovich frowns in his sleep: «A. A.… Arkadia… Arkadiev».', '2089. Капсула №2. Пётр Петрович хмурится во сне: «А. А.… Аркадия… Аркадьев».'] },
    ],
  },
  // ── «The Report», chapter 2 «The Black Market» ────────────────────────────
  b6: {
    title: ['The Flea Market', 'Толкучка'],
    goal: ['Close the stalls: {left} left', 'Закрой лотки: осталось {left}'],
    intro: [
      { who: 'caption', fx: 'vhs', say: ['Sunday. The flea market by the square. Everything is for sale here except a conscience — out of stock since spring.', 'Воскресенье. Толкучка у площади. Тут продают всё, кроме совести — её нет с весны.'] },
      { who: 'koshka', say: ['Look, chief. Third row. «Tape No. 89 — a copy, the very one».', 'Смотри, начальник. Третий ряд. «Кассета №89 — копия, та самая».'] },
      { who: 'uchastkovy', say: ['Copies. Already copies. Who is selling?', 'Копии. Уже копии. Кто торгует?'] },
      { who: 'koshka', say: ['Slavik. He sells anything that was somebody else’s yesterday.', 'Славик. Он продаёт всё, что вчера было чьим-то.'] },
      { who: 'uchastkovy', say: ['Citizens, the market is closed. Sanitary day.', 'Граждане, рынок закрыт. Санитарный день.'] },
    ],
    barks: {
      start: { who: 'uchastkovy', say: ['Hands where I can see them! The goods too!', 'Руки на виду! И товар тоже!'] },
      firstKill: { who: 'uchastkovy', say: ['One stall closed.', 'Один лоток закрыт.'] },
      wave: { who: 'lobster', say: ['Hey, chief! Want a tape? Slightly used. By you.', 'Эй, начальник! Кассету надо? Слегка б/у. Тобой.'] },
      win: { who: 'uchastkovy', say: ['The market is closed. The goods are evidence.', 'Рынок закрыт. Товар — вещдок.'] },
    },
    outro: [
      { who: 'lobster', say: ['Copies, chief, copies! I don’t make them, I resell them. They come from Zhora’s cooperative.', 'Копии, начальник, копии! Я их не делаю, я перепродаю. Они идут из кооператива Жоры.'] },
      { who: 'uchastkovy', say: ['A cooperative. Producing what?', 'Кооператив. Что производит?'] },
      { who: 'lobster', say: ['Officially — jeans. Unofficially — also jeans. And tapes.', 'Официально — джинсы. Неофициально — тоже джинсы. И кассеты.'] },
    ],
  },
  b7: {
    title: ['The Cooperative', 'Кооператив'],
    goal: ['Shut the cooperative down: {score} of {limit}', 'Прикрой кооператив: {score} из {limit}'],
    intro: [
      { who: 'caption', say: ['City Hospital No. 3. The basement. A sign: «Cooperative “Progress”. Sewing. Copying. No entry».', 'Городская больница №3. Подвал. Табличка: «Кооператив „Прогресс“. Пошив. Тиражирование. Посторонним вход воспрещён».'] },
      { who: 'akula', say: ['Comrade lieutenant! What an honour. Jeans? Your size, the latest model.', 'Товарищ лейтенант! Какие люди. Джинсы? Ваш размер, последняя модель.'] },
      { who: 'uchastkovy', say: ['Citizen Zhora. Tapes. Number eighty-nine. Copied here.', 'Гражданин Жора. Кассеты. Номер восемьдесят девять. Копируются здесь.'] },
      { who: 'akula', say: ['I am a businessman. Everything here is licensed. The licence is in the other basement.', 'Я бизнесмен. Здесь всё по лицензии. Лицензия — в другом подвале.'] },
      { who: 'koshka', say: ['Chief, there are three of them with guns and one with a sewing machine.', 'Начальник, их трое со стволами и один со швейной машинкой.'] },
    ],
    barks: {
      start: { who: 'akula', say: ['Boys, show the lieutenant the way out.', 'Ребята, проводите лейтенанта к выходу.'] },
      half: { who: 'koshka', say: ['Half a shift done, chief!', 'Полсмены отработали, начальник!'] },
      lowHp: { who: 'koshka', say: ['Don’t fall over in a hospital — they’ll keep you in for tests.', 'Не падай в больнице — оставят на обследование.'] },
      win: { who: 'uchastkovy', say: ['The cooperative is closed for stocktaking.', 'Кооператив закрыт на учёт.'] },
    },
    outro: [
      { who: 'akula', say: ['All right, all right. The originals aren’t mine. They come by truck — Garik brings them. The American.', 'Ладно, ладно. Оригиналы не мои. Их привозит Гарик. Американец.'] },
      { who: 'uchastkovy', say: ['An American. In our district.', 'Американец. В нашем районе.'] },
      { who: 'koshka', say: ['He’s from the next district, chief. He just chews gum.', 'Он с соседнего района, начальник. Просто жвачку жуёт.'] },
    ],
  },
  b8: {
    title: ['The Cargo', 'Груз'],
    goal: ['Drag the crates to your car: {score} of {limit}', 'Перетащи ящики к своей машине: {score} из {limit}'],
    intro: [
      { who: 'caption', say: ['The factory checkpoint, night. A truck marked «Bread» has stood here for three days. It doesn’t smell of bread.', 'Заводская проходная, ночь. Третий день стоит грузовик с надписью «Хлеб». Хлебом не пахнет.'] },
      { who: 'oryol', say: ['Hey, officer! Easy, easy. Everything’s okay. Very okay.', 'Хэй, офицер! Изи, изи. Всё окей. Очень окей.'] },
      { who: 'uchastkovy', say: ['Citizen Garik. What is in the crates?', 'Гражданин Гарик. Что в ящиках?'] },
      { who: 'oryol', say: ['Bread. Foreign bread. With buttons: play, stop, rewind.', 'Хлеб. Иностранный хлеб. С кнопками: плей, стоп, перемотка.'] },
      { who: 'koshka', say: ['Two crates, chief. Get them to our car and they become evidence.', 'Два ящика, начальник. Дотащишь до нашей машины — станут вещдоками.'] },
    ],
    barks: {
      start: { who: 'oryol', say: ['Guys, protect the business!', 'Парни, защищайте бизнес!'] },
      flag: { who: 'uchastkovy', say: ['Crate confiscated! Cover me!', 'Ящик изъят! Прикрой!'] },
      half: { who: 'koshka', say: ['One crate is ours!', 'Один ящик наш!'] },
      win: { who: 'uchastkovy', say: ['The bread is confiscated. With all its buttons.', 'Хлеб изъят. Со всеми кнопками.'] },
    },
    outro: [
      { who: 'caption', say: ['In the crates: foreign VCRs. And a stack of blank tapes, every one labelled «89».', 'В ящиках — иностранные видаки. И пачка чистых кассет, на каждой — «89».'] },
      { who: 'oryol', say: ['I’m only the driver! The buyer is the Tycoon. The deal is tonight. At the cemetery.', 'Я только водитель! Покупатель — Цеховик. Сделка сегодня ночью. На кладбище.'] },
      { who: 'uchastkovy', say: ['At the cemetery. Naturally.', 'На кладбище. Естественно.'] },
    ],
  },
  b9: {
    title: ['The Cemetery', 'Кладбище'],
    goal: ['Hold out until the patrol car arrives', 'Продержись до приезда наряда'],
    intro: [
      { who: 'caption', say: ['The old cemetery. Midnight. The deal was here. The buyer wasn’t.', 'Старое кладбище. Полночь. Сделка была здесь. Покупателя не было.'] },
      { who: 'koshka', say: ['It’s a trap, chief. They knew we would come.', 'Это ловушка, начальник. Они знали, что мы придём.'] },
      { who: 'uchastkovy', say: ['I’ve called for backup. The car will be here in a minute and a half.', 'Я вызвал наряд. Машина будет через полторы минуты.'] },
      { who: 'koshka', say: ['A minute and a half in a cemetery at night. How romantic.', 'Полторы минуты на кладбище ночью. Романтика.'] },
    ],
    barks: {
      start: { who: 'uchastkovy', say: ['Behind the headstones! And no jokes about headstones.', 'За надгробия! И без шуток про надгробия.'] },
      firstKill: { who: 'uchastkovy', say: ['One is having a rest.', 'Один отдыхает.'] },
      lowHp: { who: 'koshka', say: ['Chief, it’s too early for you to stay here!', 'Начальник, тебе тут оставаться рано!'] },
      win: { who: 'uchastkovy', say: ['The siren. Backup is here. Everyone, face down.', 'Сирена. Наряд прибыл. Всем лицом вниз.'] },
    },
    outro: [
      { who: 'koshka', say: ['The smugglers kept talking about a warehouse. At the pioneer camp. Everything is stored there.', 'Контрабандисты болтали про склад. В пионерлагере. Там всё хранится.'] },
      { who: 'uchastkovy', say: ['Then at dawn — a raid.', 'Тогда на рассвете — облава.'] },
    ],
  },
  b10: {
    title: ['The Raid', 'Облава'],
    goal: ['Take the camp: {score} of {limit} points', 'Возьми лагерь: {score} из {limit} очков'],
    intro: [
      { who: 'caption', fx: 'vhs', say: ['Dawn. The pioneer camp «Sunny Glade». In the cabins: crates, crates, crates.', 'Рассвет. Пионерлагерь «Солнечная поляна». В корпусах — ящики, ящики, ящики.'] },
      { who: 'uchastkovy', say: ['Three cabins. Three points. We take them in order, by the regulations.', 'Три корпуса. Три точки. Берём по порядку, как положено.'] },
      { who: 'koshka', say: ['And the volunteer patrol is with us. One of them even has a whistle.', 'И дружина с нами. У одного даже свисток есть.'] },
      { who: 'oryol', say: ['Officer! Let’s talk business! Fifty-fifty!', 'Офицер! Давай договоримся! Фифти-фифти!'] },
      { who: 'uchastkovy', say: ['Fifty-fifty is a bribe. And bribes go into the report.', 'Фифти-фифти — это взятка. А взятки идут в протокол.'] },
    ],
    barks: {
      start: { who: 'uchastkovy', say: ['Raid! Nobody move — and nobody run!', 'Облава! Никому не двигаться — и не бегать!'] },
      base: { who: 'koshka', say: ['That cabin is ours! Tapes under the beds!', 'Корпус наш! Под кроватями — кассеты!'] },
      half: { who: 'uchastkovy', say: ['Halfway. The camp is almost ours.', 'Полдела. Лагерь почти наш.'] },
      lowHp: { who: 'koshka', say: ['Chief, the infirmary is the last cabin on the left!', 'Начальник, медпункт — последний корпус слева!'] },
      win: { who: 'uchastkovy', say: ['The camp is taken. Lights out.', 'Лагерь взят. Отбой.'] },
    },
    outro: [
      { who: 'caption', say: ['On the camp noticeboard: a list of deliveries. Signed: «A. Arkadiev, Arkadia».', 'На доске объявлений лагеря — список поставок. Подпись: «А. Аркадьев, „Аркадия“».'] },
      { who: 'koshka', say: ['Chief, I’ll tell you for free: everything leads to him. The Tycoon. And that’s the last free tip.', 'Начальник, скажу бесплатно: всё ведёт к нему. К Цеховику. И это последняя бесплатная подсказка.'] },
      { who: 'uchastkovy', say: ['Murka. Come and work with me. Officially.', 'Мурка. Иди ко мне работать. Официально.'] },
      { who: 'koshka', say: ['Officially — no. But I’ll be around.', 'Официально — нет. Но рядом буду.'] },
      { who: 'volkov', fx: 'neon', say: ['2089. Oversight. Inspector Volkov writes in the case file: «Arkadiev. Arkadia Development. Coincidence?»', '2089. Отдел надзора. Инспектор Волков пишет в деле: «Аркадьев. „Аркадия Девелопмент“. Совпадение?»'] },
    ],
  },
};
