import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';

const fonts = [
  { name: 'Inter', data: readFileSync(new URL('./fonts/inter-latin-400-normal.woff', import.meta.url)), weight: 400 },
  { name: 'Inter', data: readFileSync(new URL('./fonts/inter-latin-700-normal.woff', import.meta.url)), weight: 700 },
];

const W = 600, H = 170;
const C = { bg: '#1d1a1f', panel: '#2a262d', text: '#f4f1f6', dim: '#a79fb0', pink: '#ff66aa', green: '#5fd08a', gray: '#6f6877', gold: '#ffcc44' };

const h = (type, style, ...children) => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) },
});
const txt = (s, style) => h('div', { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style }, String(s));
const chip = (s, color) => h('div', { background: C.panel, color, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 6, marginRight: 6 }, s);
const stat = (label, value) =>
  h('div', { flexDirection: 'column', marginRight: 22 }, txt(value, { fontSize: 17, fontWeight: 700 }), txt(label, { fontSize: 11, color: C.dim }));

const br = (v) => (v.startsWith('[') ? v : `[${v}]`);
const fmt = (n) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));

export function ago(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// s: { mode: 'playing'|'menu'|'offline', map?, live?, user?, lastSeen?, lastPlayed?, cover? }
export async function renderCard(s) {
  const { mode, map = {}, live = {}, user = {}, cover } = s;
  const dot = mode === 'playing' ? C.green : mode === 'menu' ? C.gold : C.gray;
  const status =
    mode === 'playing' ? 'Playing now' : mode === 'menu' ? 'In game, choosing a map' : `Offline${s.lastSeen ? ' - seen ' + ago(s.lastSeen) : ''}`;

  const title = mode === 'offline' ? s.lastPlayed?.title : map.title;
  const sub =
    mode === 'offline'
      ? s.lastPlayed ? `${s.lastPlayed.artist} - ${br(s.lastPlayed.version)}` : ''
      : `${map.artist || ''} - ${br(map.version || '')}`;

  const chips = [];
  if (mode !== 'offline') {
    if (map.stars) chips.push(chip(`${Number(map.stars).toFixed(2)} stars`, C.gold));
    if (map.mods) chips.push(chip(map.mods, C.pink));
    if (map.bpm) chips.push(chip(`${Math.round(map.bpm)} BPM`, C.dim));
  } else if (s.lastPlayed) chips.push(chip(s.lastPlayed.top ? 'Top play' : 'Last played', C.dim));

  const stats =
    mode === 'playing'
      ? [stat('Accuracy', live.acc != null ? `${Number(live.acc).toFixed(2)}%` : '-'), stat('Combo', live.combo != null ? `${live.combo}x` : '-'), stat('PP now', fmt(live.pp))]
      : [stat('Performance', user.pp != null ? `${fmt(user.pp)}pp` : '-'), stat('Global rank', user.rank != null ? `#${fmt(user.rank)}` : '-'), stat('Country rank', user.countryRank != null ? `#${fmt(user.countryRank)}` : '-')];

  const art = cover
    ? { type: 'img', props: { src: cover, width: 130, height: 130, style: { borderRadius: 10 } } }
    : h('div', { width: 130, height: 130, borderRadius: 10, background: C.panel, alignItems: 'center', justifyContent: 'center', color: C.gray, fontSize: 40 }, '?');

  const tree = h(
    'div',
    { width: W, height: H, boxSizing: 'border-box', background: C.bg, borderRadius: 14, padding: 20, fontFamily: 'Inter', color: C.text },
    art,
    h(
      'div',
      { flexDirection: 'column', flex: 1, marginLeft: 18, minWidth: 0, justifyContent: 'space-between' },
      h('div', { alignItems: 'center' }, h('div', { width: 9, height: 9, borderRadius: 5, background: dot, marginRight: 8 }), txt(status, { fontSize: 12, color: dot, fontWeight: 700 }), txt(user.name || '', { fontSize: 12, color: C.dim, marginLeft: 'auto' })),
      h('div', { flexDirection: 'column' }, txt(title || 'Nothing played yet', { fontSize: 21, fontWeight: 700 }), txt(sub, { fontSize: 13, color: C.dim, marginTop: 2 })),
      h('div', {}, ...chips),
      h('div', {}, ...stats)
    )
  );

  const svg = await satori(tree, { width: W, height: H, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

const MODES = { osu: 'osu!', taiko: 'osu!taiko', fruits: 'osu!catch', mania: 'osu!mania' };

// s: { user, avatar, tagline }
export async function renderHeader({ user = {}, avatar, tagline }) {
  const pic = avatar
    ? { type: 'img', props: { src: avatar, width: 96, height: 96, style: { borderRadius: 48 } } }
    : h('div', { width: 96, height: 96, borderRadius: 48, background: C.panel });
  const chips = [MODES[user.playmode] && chip(MODES[user.playmode], C.pink), user.rank != null && chip(`#${fmt(user.rank)} global`, C.text), user.countryRank != null && chip(`#${fmt(user.countryRank)} country`, C.dim), user.pp != null && chip(`${fmt(user.pp)}pp`, C.gold)];
  const tree = h(
    'div',
    { width: W, height: 140, boxSizing: 'border-box', background: C.bg, borderRadius: 14, padding: 22, fontFamily: 'Inter', color: C.text, alignItems: 'center' },
    pic,
    h('div', { flexDirection: 'column', marginLeft: 20, flex: 1, minWidth: 0 },
      txt('Welcome to my profile', { fontSize: 12, fontWeight: 700, color: C.pink }),
      txt(user.name || 'player', { fontSize: 30, fontWeight: 700, marginTop: 2 }),
      txt(tagline || '', { fontSize: 13, color: C.dim, marginTop: 2 }),
      h('div', { marginTop: 10 }, ...chips))
  );
  const svg = await satori(tree, { width: W, height: 140, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
