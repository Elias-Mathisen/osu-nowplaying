// One-time: get a Spotify refresh token. Run on your PC.
// PowerShell: $env:SPOTIFY_CLIENT_ID="..."; $env:SPOTIFY_CLIENT_SECRET="..."; node spotify-auth.js
import http from 'node:http';

const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first'); process.exit(1); }
const redirect = 'http://127.0.0.1:8888/callback';
const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: redirect, scope: 'user-read-currently-playing' });
console.log('\nOpen this link in your browser and click Agree:\n\n' + url + '\n');

http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/callback') return res.writeHead(404).end();
  const code = u.searchParams.get('code');
  if (!code) { res.end('No code: ' + (u.searchParams.get('error') || 'unknown')); return; }
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
  });
  const j = await r.json();
  res.end(j.refresh_token ? 'Done. Go back to the terminal and copy your refresh token.' : 'Failed: ' + JSON.stringify(j));
  console.log(j.refresh_token ? '\nSPOTIFY_REFRESH_TOKEN=' + j.refresh_token + '\n\nPut that in Render as SPOTIFY_REFRESH_TOKEN. Keep it private.' : j);
  process.exit(0);
}).listen(8888, '127.0.0.1');
