import http from 'node:http';
import { renderCard, renderHeader, renderMusic, ago } from './card.js';

const { OSU_CLIENT_ID, OSU_CLIENT_SECRET, OSU_USER, PUSH_TOKEN, PORT = 3000, MOCK, LASTFM_USER, LASTFM_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
const TAGLINE = process.env.TAGLINE || 'osu!mania 4K player from Norway';
const LIVE_TTL = 20_000; // helper pushes every few seconds; older than this = game closed

let music = null; // pushed by helper: { at, data }
let live = null; // { at, data }
const cache = new Map(); // key -> { at, value }
const memo = async (key, ttl, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  let value;
  try { value = await fn(); } catch (e) { console.error(key, e.message); value = hit?.value ?? null; }
  cache.set(key, { at: Date.now(), value });
  return value;
};

let token = { v: null, exp: 0 };
async function api(path) {
  if (Date.now() > token.exp) {
    const r = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: OSU_CLIENT_ID, client_secret: OSU_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'public' }),
    });
    if (!r.ok) throw new Error(`token ${r.status}`);
    const j = await r.json();
    token = { v: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  }
  const r = await fetch(`https://osu.ppy.sh/api/v2${path}`, { headers: { authorization: `Bearer ${token.v}`, accept: 'application/json' } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function getUser() {
  if (MOCK) return { id: 1, playmode: 'mania', name: OSU_USER || 'yourname', pp: 4821, rank: 48210, countryRank: 2133, lastSeen: new Date(Date.now() - 3 * 3600e3).toISOString(), lastPlayed: { title: 'Midnight Static', artist: 'Fictional Artist', version: 'Insane' } };
  return memo('user', 60_000, async () => {
    const u = await api(`/users/${encodeURIComponent(OSU_USER)}?key=${/^\d+$/.test(OSU_USER) ? 'id' : 'username'}`);
    const mode = u.playmode || 'osu';
    let recent = await api(`/users/${u.id}/scores/recent?limit=1&include_fails=1&mode=${mode}`).catch(() => []);
    let top = false;
    if (!recent.length) { recent = await api(`/users/${u.id}/scores/best?limit=1&mode=${mode}`).catch(() => []); top = true; }
    const r = recent[0];
    return {
      id: u.id, playmode: mode, name: u.username, pp: u.statistics?.pp, rank: u.statistics?.global_rank, countryRank: u.statistics?.country_rank,
      lastSeen: u.last_visit,
      lastPlayed: r ? { title: r.beatmapset?.title, artist: r.beatmapset?.artist, version: r.beatmap?.version, setId: r.beatmapset?.id, top } : null,
    };
  });
}

async function getCover(setId) {
  if (!setId) return null;
  return memo(`cover${setId}`, 6 * 3600e3, async () => {
    const r = await fetch(`https://assets.ppy.sh/beatmaps/${setId}/covers/list@2x.jpg`);
    if (!r.ok) throw new Error(`cover ${r.status}`);
    return `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  });
}

async function getAvatar(id) {
  return memo(`avatar${id}`, 6 * 3600e3, async () => {
    const r = await fetch(`https://a.ppy.sh/${id}`);
    if (!r.ok) throw new Error(`avatar ${r.status}`);
    return `data:${r.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  });
}

const sp = { v: null, exp: 0, last: null };
async function getSpotify() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) return null;
  return memo('spotify', 12_000, async () => {
    if (Date.now() > sp.exp) {
      const r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: SPOTIFY_REFRESH_TOKEN }),
      });
      if (!r.ok) throw new Error(`spotify token ${r.status}`);
      const j = await r.json();
      sp.v = j.access_token; sp.exp = Date.now() + (j.expires_in - 60) * 1000;
    }
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { authorization: `Bearer ${sp.v}` } });
    if (r.status !== 204) {
      if (!r.ok) throw new Error(`spotify ${r.status}`);
      const j = await r.json();
      if (j.is_playing && j.item?.name) {
        sp.last = { title: j.item.name, artist: (j.item.artists || []).map((a) => a.name).join(', '), at: Date.now() };
        return { playing: true, title: sp.last.title, artist: sp.last.artist };
      }
    }
    return sp.last ? { playing: false, title: sp.last.title, artist: sp.last.artist, when: ago(new Date(sp.last.at).toISOString()) } : {};
  });
}

async function getMusic() {
  if (music) {
    const fresh = Date.now() - music.at < 25_000;
    if (fresh) return music.data;
    if (!LASTFM_USER) return { ...music.data, playing: false, when: ago(new Date(music.at).toISOString()) };
  }
  const spot = await getSpotify();
  if (spot) return spot;
  if (MOCK) return { playing: true, title: 'Midnight Static', artist: 'Fictional Artist' };
  if (!LASTFM_USER || !LASTFM_KEY) return {};
  return memo('music', 20_000, async () => {
    const r = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(LASTFM_USER)}&api_key=${LASTFM_KEY}&format=json&limit=1`);
    if (!r.ok) throw new Error(`lastfm ${r.status}`);
    const t = [].concat((await r.json()).recenttracks?.track || [])[0];
    if (!t) return {};
    const playing = t['@attr']?.nowplaying === 'true';
    return { playing, title: t.name, artist: t.artist?.['#text'], when: !playing && t.date?.uts ? ago(new Date(t.date.uts * 1000).toISOString()) : '' };
  });
}

async function buildState() {
  const user = (await getUser()) || {};
  const d = live && Date.now() - live.at < LIVE_TTL ? live.data : null;
  if (!d) return { mode: 'offline', user, lastSeen: user.lastSeen, lastPlayed: user.lastPlayed, cover: await getCover(user.lastPlayed?.setId) };
  return { mode: d.playing ? 'playing' : 'menu', user, map: d, live: d, cover: await getCover(d.setId) };
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'POST' && url.pathname === '/update') {
        if (!PUSH_TOKEN || req.headers['x-token'] !== PUSH_TOKEN) return res.writeHead(401).end();
        let body = '';
        for await (const c of req) { body += c; if (body.length > 20_000) return res.writeHead(413).end(); }
        live = { at: Date.now(), data: JSON.parse(body) };
        return res.writeHead(204).end();
      }
      if (req.method === 'POST' && url.pathname === '/music') {
        if (!PUSH_TOKEN || req.headers['x-token'] !== PUSH_TOKEN) return res.writeHead(401).end();
        let body = '';
        for await (const c of req) { body += c; if (body.length > 5_000) return res.writeHead(413).end(); }
        const d = JSON.parse(body);
        music = { at: Date.now(), data: { playing: !!d.playing, title: String(d.title || '').slice(0, 120), artist: String(d.artist || '').slice(0, 120) } };
        return res.writeHead(204).end();
      }
      if (url.pathname === '/card.png') {
        const png = await renderCard(await buildState());
        return res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=10' }).end(png);
      }
      if (url.pathname === '/header.png') {
        const user = (await getUser()) || {};
        const png = await renderHeader({ user, avatar: await getAvatar(user.id), tagline: TAGLINE });
        return res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' }).end(png);
      }
      if (url.pathname === '/music.png') {
        const png = await renderMusic((await getMusic()) || {});
        return res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=10' }).end(png);
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('osu nowplaying: /card.png');
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('error');
    }
  })
  .listen(PORT, () => console.log(`listening on ${PORT}`));
