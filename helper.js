// Runs on your gaming PC next to tosu. Reads the game state and pushes it to your card server.
// Usage: SERVER_URL=https://your-app.example PUSH_TOKEN=secret node helper.js [--dump]
import WebSocket from 'ws';

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
