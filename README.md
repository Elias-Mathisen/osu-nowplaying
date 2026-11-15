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
