/**
 * Playable characters. Combat attributes are identical by design (see CHARACTER_BASE_STATS);
 * the differences are visual and narrative only (the abilities on the owner's sheets are deliberately
 * not implemented: half of the roster is sold for money, so no character may be stronger). The first
 * two (the rooster and the panther) are free; the rest are unlocked in the shop (see economy.ts): six
 * for experience level + talons (tokens), six for diamonds. Player-facing text is English with a
 * Soviet flavour.
 */
export const CHARACTER_IDS = ['petya', 'valuta', 'uchastkovy', 'mihalych', 'vorona', 'zmeya', 'varan', 'popugay', 'piranya', 'akula', 'oryol', 'leopard', 'slon', 'lobster'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

/** Free for everyone, unlocked by level + tokens, or bought for diamonds. */
export type CharacterTier = 'base' | 'progress' | 'premium';

export interface CharacterDef {
  id: CharacterId;
  /** Display name as used on the reference sheets. */
  name: string;
  nickname: string;
  species: string;
  role: string;
  personality: string;
  quote: string;
  district: string;
  business: string;
  weaponsNote: string;
  /** A short backstory for the character screen and the shop. */
  lore: string;
  tier: CharacterTier;
  /** UI accent colour (hex) taken from the character's palette. */
  accent: string;
  /** Short label used in kill feed / name tags. */
  tag: string;
}

export const CHARACTER_BASE_STATS = Object.freeze({ maxHp: 100, speed: 1, radius: 10 });

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  petya: {
    id: 'petya',
    name: 'Petya',
    nickname: 'The Commandant',
    species: 'Rooster',
    role: 'Former dormitory commandant',
    personality: 'Keeps order. Knows every corner of the yard.',
    quote: 'My yard. My rules.',
    district: '3rd Microdistrict',
    business: 'Running the yard',
    weaponsNote: 'Anything, as long as it comes with respect.',
    lore: 'For twenty years he ran the textile mill dormitory with an iron fist: lights out at 23:00, guests until 22:00, immersion heaters strictly forbidden. The dormitory was resettled, the habit of giving orders stayed. Now Petya has appointed himself commandant of the whole yard — and nobody has dared to argue yet.',
    tier: 'base',
    accent: '#c8312a',
    tag: 'Petya',
  },
  valuta: {
    id: 'valuta',
    name: 'Valuta',
    nickname: 'The Black Marketeer',
    species: 'Panther',
    role: 'Black marketeer and fixer',
    personality: 'Always knows where to get it. Settles questions at any level.',
    quote: 'Connections decide everything.',
    district: 'Garage Cooperative',
    business: 'Trade, deliveries, hard currency',
    weaponsNote: 'A gun, connections and good information.',
    lore: 'Started out flogging chewing gum outside the Intourist hotel; now half the jeans in the district pass through his garages. Moves without a sound, talks in a whisper and never lets go of his little book of phone numbers. Need a VCR, a sheepskin coat or the right certificate with the right stamp? Everybody goes to Valuta. The only question is the price.',
    tier: 'base',
    accent: '#d8a637',
    tag: 'Valuta',
  },
  // ── unlocked by level + talons (the wolf and the bear were free until v0.23: accounts made before
  //    then keep them, see migration 009) ─────────────────────────────────────────────────────────
  uchastkovy: {
    id: 'uchastkovy',
    name: 'Uchastkovy',
    nickname: 'Knows Everyone',
    species: 'Wolf',
    role: 'The beat cop. Watches the district, knows everyone and everything.',
    personality: 'Suspicious, observant, bureaucratically relentless.',
    quote: 'Where are you off to? Papers, please.',
    district: '3rd Microdistrict',
    business: 'Order, reports, district affairs',
    weaponsNote: 'Pistol, rifle, baton, sawn-off.',
    lore: 'Fifteen years on the beat, and he remembers everyone who ever crossed the street in the wrong place. His reports get read out at tenants’ meetings like detective novels. The bosses keep promising him a transfer to the city centre, but he is in no hurry: here he knows who, where and for how much.',
    tier: 'progress',
    accent: '#3d5a8c',
    tag: 'Uchastkovy',
  },
  mihalych: {
    id: 'mihalych',
    name: 'Mikhalych',
    nickname: 'The Demob',
    species: 'Bear',
    role: 'Ex-army. Went out for bread, now settles the district’s affairs.',
    personality: 'Calm, experienced, stays out of the fuss — but sorts it out when he has to. Respects his own, keeps his word.',
    quote: 'Order isn’t what they write down. Order is what people hold together.',
    district: 'Garage Cooperative',
    business: 'Security, muscle, settling disputes',
    weaponsNote: 'Rifle, sawn-off, pistol, hand-to-hand.',
    lore: 'Served his time, came home and went out for a loaf of bread. On the way he broke up two fights, made peace between the garage owners and somehow became head of security for the whole cooperative. They say he never did buy the bread. You don’t need to talk Mikhalych into anything — just ask him like a human being.',
    tier: 'progress',
    accent: '#6b7536',
    tag: 'Mikhalych',
  },
  // (art of the next characters: references/08…16, supplied by the product owner)
  vorona: {
    id: 'vorona',
    name: 'Karlych',
    nickname: 'The Informant',
    species: 'Raven',
    role: 'Knows everything that happens in the district. Gets information, brings people together, sorts things out.',
    personality: 'Sly, observant, always a step ahead. Stays out of open fights, but is always there at the right moment.',
    quote: 'Walls hear more than people think.',
    district: 'Old Town',
    business: 'Connections, rumours, people',
    weaponsNote: 'Pistols, SMGs',
    lore: 'Karlych has ears in every yard of the Old Town: caretakers, cabbies, canteen ladies — everyone tells him something. A cassette recorder hangs on his chest and his pockets are full of tapes of other people’s conversations. Karlych never sells information — he trades it. And if you were the last to hear the news, Karlych was the first.',
    tier: 'progress',
    accent: '#b8302a',
    tag: 'Karlych',
  },
  zmeya: {
    id: 'zmeya',
    name: 'Sonka',
    nickname: 'The Temptress',
    species: 'Snake',
    role: 'Reconnaissance, cunning operations, provocations. Knows every loophole in the district.',
    personality: 'Quiet, clever, always a step ahead. Knows how to strike a deal — and how to vanish.',
    quote: 'Everyone has a price. You just need to know where to press.',
    district: 'Market / Railway Station',
    business: 'Connections, deliveries, reconnaissance',
    weaponsNote: 'SMGs, pistols, knife',
    lore: 'Every conductor at the station knows Sonka, and so does every scales lady at the market. She turns up wherever a deal is being made and disappears before anyone misses their wallet. She smiles, whispers, promises — and everyone walks away sure they got a bargain. They realise they were taken a week later. Beautiful, dirty, effective: that is her signature.',
    tier: 'progress',
    accent: '#6f8a3a',
    tag: 'Sonka',
  },
  varan: {
    id: 'varan',
    name: 'Tolyan',
    nickname: 'The Techie',
    species: 'Monitor Lizard',
    role: 'Knows machines, locks and engines. Fixes, improves and gets what can’t be bought.',
    personality: 'Calm, calculating, always on the move. Does more than he talks. At home among the garages.',
    quote: 'If it can be fixed, it can still fight.',
    district: 'Garage Cooperative',
    business: 'Weapons, machinery, modifications, break-ins',
    weaponsNote: 'Rifles, SMGs, shotguns',
    lore: 'There is no lock in the cooperative Tolyan can’t open in a minute, and no engine he can’t push-start. He’ll build an armoured car out of an old Moskvich, a timer out of an alarm clock, and out of a written-off shotgun — a piece people drive over from other districts to see. Says little, smokes a lot and always smells of engine oil.',
    tier: 'progress',
    accent: '#8a7444',
    tag: 'Tolyan',
  },
  popugay: {
    id: 'popugay',
    name: 'Gosha',
    nickname: 'The Liaison',
    species: 'Parrot',
    role: 'Passes the word, coordinates the crew, knows every district. Quick to react and always in the loop.',
    personality: 'Talkative, charismatic, sharp-tongued, always on the line. Can talk his way out of anything. Loves freedom and a bit of action.',
    quote: 'I hear it all, see it all, fly everywhere. News travels faster than a bullet!',
    district: 'Market / Radio Tower',
    business: 'Communications, reconnaissance, passing on the word',
    weaponsNote: 'Pistols, SMGs, rifles',
    lore: 'Gosha sits on the radio tower above the market and listens to the whole city: the militsiya band, the cabbies, the port dispatchers. Every negotiation in the district goes through him — he’ll pass it on, remind you, warn you and, if needed, embellish it a little. Walkie-talkie on his belt, pipe in his beak, flying goggles on his forehead. Whoever owns the information owns the district.',
    tier: 'progress',
    accent: '#e0a020',
    tag: 'Gosha',
  },
  // ── premium (diamonds) ────────────────────────────────────────────────────
  piranya: {
    id: 'piranya',
    name: 'Vityok',
    nickname: 'The Madman',
    species: 'Piranha',
    role: 'First into any brawl. Close combat and pressure are his element. Creates chaos so his own can take what’s theirs.',
    personality: 'Impulsive, wild, unpredictable. Does what he feels. Lives for the moment.',
    quote: 'The smell of blood is the best plan.',
    district: 'River / Port',
    business: 'Muscle, cargo protection',
    weaponsNote: 'Uzi, shotguns, knives, mines',
    lore: 'They found Vityok on a river barge, where he had single-handedly chased off a whole gang of dockers from the next district. Since then he gets called when the talking is over. He never has a plan — just a red bandana, a mouth full of teeth and the firm conviction that fish have a say too. His own people are a bit scared of him; strangers even more so.',
    tier: 'premium',
    accent: '#c24a3a',
    tag: 'Vityok',
  },
  akula: {
    id: 'akula',
    name: 'Zhora',
    nickname: 'The Businessman',
    species: 'Shark',
    role: 'Settles things with money, connections and force. Controls trade, deliveries and protection.',
    personality: 'Cold-blooded, calculating, always looking for an angle. Keeps smiling even when it’s too late to save anything.',
    quote: 'Everything in the district is for sale. It’s only a question of price.',
    district: 'Port / Market',
    business: 'Deliveries, contraband, a cut of every business',
    weaponsNote: 'Rifles, SMGs, shotguns',
    lore: 'Zhora came to the port back when they only loaded timber and fish. Now VCRs, jeans and everything “not allowed” come through his piers. He wears a pinstripe suit, smokes a fat cigar and never raises his voice — why would he, when he can simply smile. Everyone who trades by the sea pays Zhora his cut. Those who don’t pay don’t trade any more.',
    tier: 'premium',
    accent: '#3d5a8c',
    tag: 'Zhora',
  },
  oryol: {
    id: 'oryol',
    name: 'Garik',
    nickname: 'Pendos',
    species: 'Eagle',
    role: 'Sniper. Takes out targets from a distance, holds the key positions.',
    personality: 'Calm, deliberate, never says a word too many.',
    quote: 'I see further. I shoot straighter.',
    district: 'Port',
    business: 'Holding the territory',
    weaponsNote: 'Sniper rifle',
    lore: 'They started calling Garik “Pendos” — the Yankee — back in 1980: aviator shades, a sheepskin bomber jacket and chewing gum he chews even in his sleep. He traded a crate of matryoshka dolls for the shades with a foreign sailor and has never taken them off since. Garik sits up on the port cranes and sees everything that happens at the piers. He says little, shoots rarely — and almost never misses.',
    tier: 'premium',
    accent: '#e8b030',
    tag: 'Garik',
  },
  leopard: {
    id: 'leopard',
    name: 'Lyova',
    nickname: 'The Mercenary',
    species: 'Leopard',
    role: 'Takes on the hard jobs. Settles matters when speed and precision are needed.',
    personality: 'Cold, confident, always in control. Doesn’t chatter. Values results.',
    quote: 'A job should be clean, like tracks in fresh snow.',
    district: 'The Whole City',
    business: 'Protection, escorts, special orders',
    weaponsNote: 'Assault and sniper rifles, pistols',
    lore: 'Nobody hires Lyova — you put your name down on his waiting list. He takes only difficult jobs, works alone and never haggles: the price is named, the question is closed. He wears a sheepskin coat all year round and never takes the cigarette out of his mouth, even on a job. The district tells legends about his past; the few who know the truth prefer to keep quiet.',
    tier: 'premium',
    accent: '#d89a2a',
    tag: 'Lyova',
  },
  slon: {
    id: 'slon',
    name: 'Batya',
    nickname: 'The Roof',
    species: 'Elephant',
    role: 'Holds the districts, covers the businesses, settles the big conflicts. The heavy artillery of any affair.',
    personality: 'Calm, massive, says little but every word counts. Always keeps his word. When the Elephant is around, problems disappear.',
    quote: 'Big things are done slowly — but forever.',
    district: 'The Whole City',
    business: 'Protection (“a roof”) for businesses, security, muscle',
    weaponsNote: 'Machine guns, RPGs, heavy weapons',
    lore: 'Every kiosk, cooperative and car workshop in the city has a “roof” — protection. And every roof has Batya. He doesn’t run, doesn’t shout and doesn’t hurry: he arrives in person, sits down, listens in silence — and the matter is closed for good. A red tracksuit, a fur waistcoat and a gold chain with a star: the whole city knows him by these, and nobody wants to check whether it’s true that he never forgets.',
    tier: 'premium',
    accent: '#c8312a',
    tag: 'Batya',
  },
  lobster: {
    id: 'lobster',
    name: 'Slavik',
    nickname: 'The Fence',
    species: 'Lobster',
    role: 'Controls deliveries, gets hold of defitsit, weapons and hard currency. Always knows where to find anything.',
    personality: 'Sly, enterprising, a born negotiator who always comes out dry. Loves luxury, but is always ready for a fight.',
    quote: 'Everything you need is already on its way. All it takes is the right port.',
    district: 'Port',
    business: 'Deliveries, defitsit, currency exchange',
    weaponsNote: 'Pistols, SMGs, shotguns',
    lore: 'Slavik grew up in the port and has spent his whole life mastering one skill: coming out of the water dry. Jeans, chewing gum, video cassettes, hard currency — whatever the district needs, with Slavik it’s “already on its way”. He adores gold, tracksuits and good cigars, and in an argument he always offers a deal first — and only then uses his claws.',
    tier: 'premium',
    accent: '#c8402a',
    tag: 'Slavik',
  },
};

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);
}

/** Characters every player owns from the start. */
export const FREE_CHARACTERS: readonly CharacterId[] = CHARACTER_IDS.filter((c) => CHARACTERS[c].tier === 'base');
