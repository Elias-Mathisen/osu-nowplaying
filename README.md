# osu! now playing card

tosu (on your PC) -> helper.js -> your server (/update) -> /card.png -> osu! bio `[img]`

## 1. Get osu! API credentials
osu.ppy.sh -> Settings -> OAuth -> New OAuth Application (callback can be http://localhost). Copy client ID and secret.

## 2. Deploy the server (Render, Railway, Fly, or any Node host)
Start command: `npm start`. Environment variables:
- OSU_CLIENT_ID, OSU_CLIENT_SECRET
- OSU_USER  (your username or numeric id)
- PUSH_TOKEN  (any long random string; the helper must send the same one)

Check it: open https://YOUR-APP/card.png. You should see the offline card.

## 3. Run tosu and the helper on your PC
Install tosu (https://github.com/tosuapp/tosu) and start it before osu!.
    npm install
    SERVER_URL=https://YOUR-APP PUSH_TOKEN=... node helper.js
(Windows PowerShell: `$env:SERVER_URL="..."; $env:PUSH_TOKEN="..."; node helper.js`)

If the card shows wrong or empty data, run `node helper.js --dump` while in a map and compare the
printed JSON with the field names in the `map()` function in helper.js.

## 4. Put it in your bio
    [centre][img]https://YOUR-APP/card.png[/img][/centre]

Notes: osu! proxies bio images and may cache them, so expect some delay. Free hosts can sleep when idle,
so the first load after a quiet period may be slow. Cards are latin-font only (romanised titles).
Preview locally with `node test.js` (writes samples/*.png).

## Full bio layout
Extra environment variables on the server:
- TAGLINE  (optional, shown under your name; default "osu!mania 4K player from Norway")
- LASTFM_USER, LASTFM_KEY  (for the tiny music strip; free key at https://www.last.fm/api/account/create)

Routes: /header.png (welcome banner), /card.png (now playing), /music.png (music strip).

    [centre][img]https://YOUR-APP/header.png[/img]
    [img]https://YOUR-APP/card.png[/img]
    [img]https://YOUR-APP/music.png[/img][/centre]

## Spotify without the Spotify API
helper.js also reads the desktop Spotify app's window title (Windows) or asks the app via AppleScript (macOS)
every 5 seconds and pushes it to POST /music. No Spotify developer account or Premium needed. Keep the Spotify
window open or minimized (not closed to the tray). Last.fm is only a fallback and is optional.

## Spotify via the official API (optional)
Spotify dashboard app with redirect URI http://127.0.0.1:8888/callback. Run `node spotify-auth.js` once (see file header)
to get SPOTIFY_REFRESH_TOKEN. Server env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN.
