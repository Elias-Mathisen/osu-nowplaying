import http from 'node:http';
import { renderCard } from './card.js';

const { OSU_CLIENT_ID, OSU_CLIENT_SECRET, OSU_USER, PUSH_TOKEN, PORT = 3000, MOCK } = process.env;
const LIVE_TTL = 20_000; // helper pushes every few seconds; older than this = game closed

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
  if (MOCK) return { id: 1, name: OSU_USER || 'yourname', pp: 4821, rank: 48210, countryRank: 2133, lastSeen: new Date(Date.now() - 3 * 3600e3).toISOString(), lastPlayed: { title: 'Midnight Static', artist: 'Fictional Artist', version: 'Insane' } };
  return memo('user', 60_000, async () => {
    const u = await api(`/users/${encodeURIComponent(OSU_USER)}/osu?key=${/^\d+$/.test(OSU_USER) ? 'id' : 'username'}`);
    const recent = await api(`/users/${u.id}/scores/recent?limit=1&include_fails=1`).catch(() => []);
    const r = recent[0];
    return {
      id: u.id, name: u.username, pp: u.statistics?.pp, rank: u.statistics?.global_rank, countryRank: u.statistics?.country_rank,
      lastSeen: u.last_visit,
      lastPlayed: r ? { title: r.beatmapset?.title, artist: r.beatmapset?.artist, version: r.beatmap?.version } : null,
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

async function buildState() {
  const user = (await getUser()) || {};
  const d = live && Date.now() - live.at < LIVE_TTL ? live.data : null;
  if (!d) return { mode: 'offline', user, lastSeen: user.lastSeen, lastPlayed: user.lastPlayed, cover: null };
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
      if (url.pathname === '/card.png') {
        const png = await renderCard(await buildState());
        return res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=10' }).end(png);
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('osu nowplaying: /card.png');
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('error');
    }
  })
  .listen(PORT, () => console.log(`listening on ${PORT}`));
