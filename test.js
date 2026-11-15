import { renderCard } from './card.js';
import { writeFileSync } from 'node:fs';

const user = { name: 'yourname', pp: 4821, rank: 48210, countryRank: 2133 };
const map = { title: 'Midnight Static', artist: 'Fictional Artist', version: 'Insane', stars: 6.21, mods: 'HDDT', bpm: 210 };
const cases = {
  playing: { mode: 'playing', user, map, live: { acc: 98.41, combo: 412, pp: 388 } },
  menu: { mode: 'menu', user, map: { ...map, mods: '' } },
  offline: { mode: 'offline', user, lastSeen: new Date(Date.now() - 3 * 3600e3).toISOString(), lastPlayed: { title: 'Midnight Static', artist: 'Fictional Artist', version: 'Insane' } },
};
for (const [k, v] of Object.entries(cases)) writeFileSync(`samples/${k}.png`, await renderCard(v));
console.log('ok');
