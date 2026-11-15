// Runs on your gaming PC next to tosu. Reads the game state and pushes it to your card server.
// Usage: SERVER_URL=https://your-app.example PUSH_TOKEN=secret node helper.js [--dump]
import WebSocket from 'ws';
import { execFile } from 'node:child_process';

const { SERVER_URL, PUSH_TOKEN, TOSU_WS = 'ws://127.0.0.1:24050/ws' } = process.env;
const dump = process.argv.includes('--dump');
if (!dump && (!SERVER_URL || !PUSH_TOKEN)) { console.error('Set SERVER_URL and PUSH_TOKEN'); process.exit(1); }

let last = 0;
function map(d) {
  const m = d.menu || {}, bm = m.bm || {}, g = d.gameplay || {};
  const mods = m.mods?.str && m.mods.str !== 'NM' ? m.mods.str : '';
  return {
    playing: m.state === 2,
    title: bm.metadata?.title, artist: bm.metadata?.artist, version: bm.metadata?.difficulty, mapper: bm.metadata?.mapper,
    setId: bm.set, stars: bm.stats?.SR ?? bm.stats?.fullSR, bpm: bm.stats?.BPM?.common,
    mods, acc: g.accuracy, combo: g.combo?.current, pp: g.pp?.current,
  };
}

function connect() {
  const ws = new WebSocket(TOSU_WS);
  ws.on('message', async (raw) => {
    if (Date.now() - last < 3000) return;
    last = Date.now();
    const d = JSON.parse(raw);
    const out = map(d);
    if (dump) { console.log(JSON.stringify({ menu: d.menu, gameplay: d.gameplay }, null, 1).slice(0, 3000)); console.log('MAPPED', out); return; }
    try {
      const r = await fetch(`${SERVER_URL}/update`, { method: 'POST', headers: { 'x-token': PUSH_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(out) });
      if (!r.ok) console.error('push failed', r.status);
    } catch (e) { console.error('push error', e.message); }
  });
  ws.on('error', () => {});
  ws.on('close', () => setTimeout(connect, 5000));
}
connect();
console.log(`reading ${TOSU_WS}${dump ? ' (dump mode)' : ''}`);

// ---- Spotify desktop app -> /music (no Spotify API, no Premium needed) ----
export function parseTitle(t) {
  t = (t || '').trim();
  if (!t) return null; // app not running / no window
  if (/^Spotify( (Free|Premium))?$/.test(t)) return { playing: false }; // paused or idle
  if (t === 'Advertisement' || t === 'Spotify') return { playing: false, ad: true };
  const i = t.indexOf(' - ');
  return i < 0 ? { playing: false } : { playing: true, artist: t.slice(0, i), title: t.slice(i + 3) };
}

function readSpotifyTitle() {
  return new Promise((res) => {
    const done = (e, out) => res(e ? '' : String(out).trim());
    if (process.platform === 'win32')
      execFile('powershell', ['-NoProfile', '-Command', '(Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1 -ExpandProperty MainWindowTitle)'], { timeout: 5000 }, done);
    else if (process.platform === 'darwin')
      execFile('osascript', ['-e', 'if application "Spotify" is running then tell application "Spotify" to if player state is playing then return (artist of current track) & " - " & (name of current track)\nreturn "Spotify"'], { timeout: 5000 }, done);
    else res('');
  });
}

let lastTrack = null, lastSent = 0, lastKey = '';
async function spotifyTick() {
  const p = parseTitle(await readSpotifyTitle());
  if (!p) return; // Spotify closed: stop pushing, server shows "last listened"
  if (p.playing) lastTrack = { artist: p.artist, title: p.title };
  if (!lastTrack) return;
  const body = { playing: !!p.playing, ...lastTrack };
  const key = JSON.stringify(body);
  if (dump) { console.log('SPOTIFY', body); return; }
  if (key === lastKey && Date.now() - lastSent < 10_000) return;
  lastKey = key; lastSent = Date.now();
  try {
    const r = await fetch(`${SERVER_URL}/music`, { method: 'POST', headers: { 'x-token': PUSH_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) console.error('music push failed', r.status);
  } catch (e) { console.error('music push error', e.message); }
}
setInterval(spotifyTick, 5000);
spotifyTick();
