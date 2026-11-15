import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';

const fonts = [
  { name: 'Inter', data: readFileSync(new URL('./fonts/inter-latin-400-normal.woff', import.meta.url)), weight: 400 },
  { name: 'Inter', data: readFileSync(new URL('./fonts/inter-latin-700-normal.woff', import.meta.url)), weight: 700 },
];

const W = 600, GAP = 12; // GAP = transparent space under a card, so stacked cards have room between them
const C = { text: '#ffffff', dim: 'rgba(255,255,255,0.74)', pink: '#ff8cc4', green: '#7df0b0', gray: 'rgba(255,255,255,0.45)', gold: '#ffd97a', panel: 'rgba(255,255,255,0.16)' };

const h = (type, style, ...children) => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) },
});
const txt = (s, style) => h('div', { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style }, String(s));
const chip = (s, color) => h('div', { background: C.panel, color, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 6, marginRight: 6 }, s);
const stat = (label, value) =>
  h('div', { flexDirection: 'column', marginRight: 22 }, txt(value, { fontSize: 17, fontWeight: 700 }), txt(label, { fontSize: 11, color: C.dim }));

const fmt = (n) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
const br = (v) => (v.startsWith('[') ? v : `[${v}]`);

export function ago(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// Blur an image (data URI) with resvg so it can sit behind the glass panel.
function blurred(uri, w, ht) {
  if (!uri) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${ht}"><defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter></defs><image xlink:href="${uri}" x="-40" y="-40" width="${w + 80}" height="${ht + 80}" preserveAspectRatio="xMidYMid slice" filter="url(#b)"/></svg>`;
  try {
    return 'data:image/png;base64,' + new Resvg(svg).render().asPng().toString('base64');
  } catch {
    return null;
  }
}

// Frosted glass panel: blurred artwork + translucent tint + highlight + soft border. Transparent outside, so it
// takes on your profile's own colors. gap = transparent space left under the panel.
async function render(w, ht, gap, bgUri, content, pad) {
  const abs = { position: 'absolute', top: 0, left: 0, width: w, height: ht, borderRadius: 14 };
  const bg = blurred(bgUri, w, ht);
  const tree = h(
    'div',
    { width: w, height: ht + gap, flexDirection: 'column' },
    h(
      'div',
      { position: 'relative', width: w, height: ht, borderRadius: 14, overflow: 'hidden', fontFamily: 'Inter', color: C.text },
      bg && { type: 'img', props: { src: bg, width: w, height: ht, style: { position: 'absolute', top: 0, left: 0 } } },
      h('div', { ...abs, background: 'rgba(0,0,0,0.30)' }),
      h('div', { ...abs, boxSizing: 'border-box', backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04))', border: '1px solid rgba(255,255,255,0.30)' }),
      h('div', { ...abs, boxSizing: 'border-box', padding: pad, alignItems: 'center' }, ...content)
    )
  );
  const svg = await satori(tree, { width: w, height: ht + gap, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng();
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

  return render(W, 170, GAP, cover, [
    art,
    h(
      'div',
      { flexDirection: 'column', flex: 1, marginLeft: 18, minWidth: 0, height: 130, justifyContent: 'space-between' },
      h('div', { alignItems: 'center' }, h('div', { width: 9, height: 9, borderRadius: 5, background: dot, marginRight: 8 }), txt(status, { fontSize: 12, color: dot, fontWeight: 700 }), txt(user.name || '', { fontSize: 12, color: C.dim, marginLeft: 'auto' })),
      h('div', { flexDirection: 'column' }, txt(title || 'Nothing played yet', { fontSize: 21, fontWeight: 700 }), txt(sub, { fontSize: 13, color: C.dim, marginTop: 2 })),
      h('div', {}, ...chips),
      h('div', {}, ...stats)
    ),
  ], 20);
}

const MODES = { osu: 'osu!', taiko: 'osu!taiko', fruits: 'osu!catch', mania: 'osu!mania' };

// s: { user, avatar (data URI or null), tagline }
export async function renderHeader({ user = {}, avatar, tagline }) {
  const pic = avatar
    ? { type: 'img', props: { src: avatar, width: 96, height: 96, style: { borderRadius: 48 } } }
    : h('div', { width: 96, height: 96, borderRadius: 48, background: C.panel, alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 700 }, (user.name || '?')[0].toUpperCase());
  const chips = [MODES[user.playmode] && chip(MODES[user.playmode], C.pink), user.rank != null && chip(`#${fmt(user.rank)} global`, C.text), user.countryRank != null && chip(`#${fmt(user.countryRank)} country`, C.dim), user.pp != null && chip(`${fmt(user.pp)}pp`, C.gold)];
  return render(W, 140, GAP, avatar, [
    pic,
    h('div', { flexDirection: 'column', marginLeft: 20, flex: 1, minWidth: 0 },
      txt('Welcome to my profile', { fontSize: 12, fontWeight: 700, color: C.pink }),
      txt(user.name || 'player', { fontSize: 30, fontWeight: 700, marginTop: 2 }),
      txt(tagline || '', { fontSize: 13, color: C.dim, marginTop: 2 }),
      h('div', { marginTop: 10 }, ...chips)),
  ], 22);
}

const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// { playing, title, artist, when, cover, progress, duration }  (ms values; title empty = nothing known)
export async function renderMusic({ playing, title, artist, when, cover, progress, duration }) {
  const bar = (hgt) => h('div', { width: 3, height: hgt, borderRadius: 2, background: playing ? C.green : C.gray, marginRight: 2 });
  const art = cover
    ? { type: 'img', props: { src: cover, width: 44, height: 44, style: { borderRadius: 6 } } }
    : h('div', { width: 44, height: 44, borderRadius: 6, background: C.panel, alignItems: 'center', justifyContent: 'center' }, h('div', { alignItems: 'flex-end', height: 14 }, bar(7), bar(14), bar(9)));
  const head = !title ? 'No music data yet' : `${playing ? 'Listening to' : 'Last listened'}  ${title} - ${artist}${!playing && when ? '  (' + when + ')' : ''}`;
  const pct = duration ? Math.max(0, Math.min(100, (progress / duration) * 100)) : 0;
  const line =
    playing && duration
      ? h('div', { alignItems: 'center', marginTop: 6 },
          txt(mmss(progress), { fontSize: 11, color: C.dim, width: 34 }),
          h('div', { flex: 1, height: 4, background: 'rgba(255,255,255,0.22)', borderRadius: 2 }, h('div', { width: `${pct}%`, height: 4, background: C.green, borderRadius: 2 })),
          txt(mmss(duration), { fontSize: 11, color: C.dim, width: 34, justifyContent: 'flex-end' }))
      : null;
  return render(W, 60, 0, cover, [
    art,
    h('div', { flexDirection: 'column', flex: 1, minWidth: 0, marginLeft: 12, justifyContent: 'center' }, txt(head, { fontSize: 12, color: C.text }), line),
  ], 8);
}
