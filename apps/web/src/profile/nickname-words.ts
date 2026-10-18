/** District-style nickname suggestions («Quiet Quartermaster», «Lucky Raccoon»): adjective + noun, ≤ 24 chars. */
const ADJ = ['Quiet', 'Garage', 'Factory', 'Night', 'Gloomy', 'Seasoned', 'Jolly', 'Courtyard', 'Imported', 'Lucky', 'Cassette', 'District', 'Elusive', 'Shady', 'Sleepy', 'Bald', 'Contraband', 'Comrade'];
const NOUN = ['Quartermaster', 'Watchman', 'Storekeeper', 'Gym Teacher', 'Foreman', 'Cabbie', 'Electrician', 'Fitter', 'Site Boss', 'Cooperator', 'Plumber', 'Projectionist', 'Spiv', 'Postman', 'Janitor', 'Badger', 'Raccoon', 'Ferret', 'Beaver', 'Owl', 'Weasel'];

export function randomNickname(rnd: () => number = Math.random): string {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length) % a.length]!;
  return `${pick(ADJ)} ${pick(NOUN)}`;
}
