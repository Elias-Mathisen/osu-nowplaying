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
  let value, failed = false;
  try { value = await fn(); } catch (e) { failed = true; console.error(key, e.message); value = hit?.value ?? null; }
  cache.set(key, { at: Date.now() - (failed ? ttl - 30_000 : 0), value });
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
      id: u.id, avatar: u.avatar_url, playmode: mode, name: u.username, pp: u.statistics?.pp, rank: u.statistics?.global_rank, countryRank: u.statistics?.country_rank,
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

async function getAvatar(url) {
  if (!url) return null;
  return memo(`avatar${url}`, 6 * 3600e3, async () => {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; osu-nowplaying)' } });
    if (!r.ok) throw new Error(`avatar ${r.status}`);
    const type = (r.headers.get('content-type') || 'image/png').split(';')[0];
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  });
}

async function getImage(url) {
  return memo(`img${url}`, 6 * 3600e3, async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`img ${r.status}`);
    return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
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
      if (url.pathname === '/spotify/login') {
        if (!PUSH_TOKEN || url.searchParams.get('key') !== PUSH_TOKEN || !SPOTIFY_CLIENT_ID) return res.writeHead(401).end('unauthorized');
        const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
        states.set(state, Date.now());
        const q = new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, response_type: 'code', redirect_uri: spRedirect(req), scope: 'user-read-currently-playing', state });
        return res.writeHead(302, { location: `https://accounts.spotify.com/authorize?${q}` }).end();
      }
      if (url.pathname === '/spotify/callback') {
        const st = url.searchParams.get('state'), code = url.searchParams.get('code');
        const ok = st && states.has(st) && Date.now() - states.get(st) < 600_000;
        states.delete(st);
        if (!ok || !code) return res.writeHead(400, { 'content-type': 'text/plain' }).end('Login failed or expired: ' + (url.searchParams.get('error') || 'start again from /spotify/login'));
        const r = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: spRedirect(req) }),
        });
        const j = await r.json();
        if (!j.refresh_token) return res.writeHead(400, { 'content-type': 'text/plain' }).end('Spotify said: ' + JSON.stringify(j));
        sp.refresh = j.refresh_token; sp.exp = 0; cache.delete('spotify');
        return res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(`<body style="font-family:sans-serif;max-width:640px;margin:40px auto"><h2>Spotify connected</h2><p>Your music strip works now. To keep it after Render restarts, add this in Render under Environment as <b>SPOTIFY_REFRESH_TOKEN</b> (keep it private):</p><textarea readonly rows="4" style="width:100%" onclick="this.select()">${j.refresh_token}</textarea></body>`);
      }
      if (url.pathname === '/card.png') {
        const png = await renderCard(await buildState());
        return res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=10' }).end(png);
      }
      if (url.pathname === '/header.png') {
        const user = (await getUser()) || {};
        const png = await renderHeader({ user, avatar: await getAvatar(user.avatar || (user.id ? `https://a.ppy.sh/${user.id}` : null)), tagline: TAGLINE });
        return res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' }).end(png);
      }
      if (url.pathname === '/music.png') {
        const m = (await getMusic()) || {};
        const cover = m.img ? await getImage(m.img) : null;
        const progress = m.playing && m.duration ? Math.min(m.duration, m.progress + (Date.now() - m.fetchedAt)) : 0;
        const png = await renderMusic({ ...m, cover, progress });
        return res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=10' }).end(png);
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('osu nowplaying: /card.png');
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('error');
    }
  })
  .listen(PORT, () => console.log(`listening on ${PORT}`));
