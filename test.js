import { Resvg } from '@resvg/resvg-js';
import { renderCard, renderHeader, renderMusic } from './card.js';
import { writeFileSync } from 'node:fs';

const art = (a, b) => 'data:image/png;base64,' + new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="110" cy="120" r="60" fill="#fff" opacity=".6"/></svg>`).render().asPng().toString('base64');
const user = { name: 'yourname', pp: 4821, rank: 48210, countryRank: 2133 };
const map = { title: 'Midnight Static', artist: 'Fictional Artist', version: 'Insane', stars: 6.21, mods: 'HDDT', bpm: 210 };
const cases = {
  playing: { mode: 'playing', cover: art('#ff4f9a', '#3a2bd9'), user, map, live: { acc: 98.41, combo: 412, pp: 388 } },
  menu: { mode: 'menu', user, map: { ...map, mods: '' } },
  offline: { mode: 'offline', user, lastSeen: new Date(Date.now() - 3 * 3600e3).toISOString(), lastPlayed: { title: 'Midnight Static', artist: 'Fictional Artist', version: 'Insane' } },
};
for (const [k, v] of Object.entries(cases)) writeFileSync(`samples/${k}.png`, await renderCard(v));
writeFileSync('samples/header.png', await renderHeader({ avatar: art('#2bd9a5', '#d92b6e'), user: { ...user, playmode: 'mania' }, tagline: 'osu!mania 4K player from Norway' }));
writeFileSync('samples/music-playing.png', await renderMusic({ playing: true, title: 'Glimpse of Us', artist: 'Joji', progress: 72000, duration: 233000, cover: art('#ffb347', '#7a3ad9') }));
writeFileSync('samples/music-last.png', await renderMusic({ playing: false, title: 'Midnight Static', artist: 'Fictional Artist', when: '2 h ago' }));
console.log('ok');
