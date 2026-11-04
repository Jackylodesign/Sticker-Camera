# Sticker Index — Figma plugin (private)

Browse your sticker library inside Figma (or FigJam) and drop stickers into the file,
with or without the white border and shadow. You can also delete stickers from here.

It's a private development plugin: it is not published, and it only runs on the
computer where you import it.

## Install in Figma (no coding)

1. **Download the plugin folder.**
   - On GitHub, open the `Jackylodesign/Sticker-Camera` repository.
   - Click the green **Code** button → **Download ZIP**.
   - Unzip it. Inside, the folder you need is `figma-plugin`. You can move it somewhere
     safe (e.g. your Documents folder) and delete the rest.
2. **Import it in Figma.** This needs the **Figma desktop app** (not the browser).
   - Open any design file.
   - Menu → **Plugins → Development → Import plugin from manifest…**
   - Pick `manifest.json` inside the `figma-plugin` folder.
3. **Make a token.**
   - Open https://stickerindex.page/library and sign in.
   - Open **Figma plugin** → **Generate token** → **Copy**.
     The token is shown only once. If you lose it, generate a new one.
4. **Connect.**
   - In Figma: **Plugins → Development → Sticker Index**.
   - Paste the token and click **Connect**. Figma remembers it on this computer.

To update the plugin later, download the ZIP again and replace the folder (same place,
so Figma keeps finding `manifest.json`).

## Using it

- **Click a sticker** to add it. It lands in the middle of your view, or next to what
  you have selected, at up to 400px on its longer side.
- **Select** lets you add several at once: tap stickers to pick them (or **Select all**),
  then **Add**. They're laid out in a neat grid. **Done** leaves select mode.
- **White border / Shadow** decide how the next sticker is added.
- **Refresh** reloads the list (e.g. after saving new stickers on your phone).
- Hover a sticker and click **×** to delete it. It asks first, and deleting is forever
  (it's gone from your Library too).
- **Sign out** forgets the token on this computer.

If the plugin says the token doesn't work, it was revoked or mistyped: make a new one
in Library and paste it again. Revoke tokens you no longer use in Library → Figma plugin.

## For developers

- Plain JavaScript: `manifest.json`, `code.js` (Figma main thread) and `ui.html` (the
  plugin window). Edit them directly. In Figma, re-run the plugin to pick up changes.
- The window fetches from `https://stickerindex.page` with
  `Authorization: Bearer <token>`. That domain is the only one allowed in
  `manifest.json` → `networkAccess`.
- The server accepts the token only on: `GET` and `POST /api/stickers`,
  `GET /api/stickers/[id]/image` (and `?size=thumb`), and `DELETE /api/stickers/[id]`.
  The plugin doesn't upload; `POST` is for the iPhone app.
  See `requireOwnerOrToken` in `lib/owner.ts` and `isTokenRoute` in `lib/cors.ts`.
- The border/shadow code in `ui.html` (between `BEGIN GENERATED` and `END GENERATED`)
  is built from `lib/sticker.ts`, so the web app is the only place to change the look.
  After changing `lib/sticker.ts`, `lib/mask.ts` or `STYLE` in `lib/config/sticker-style.ts`, run
  `npm run build:plugin` and commit `ui.html`. The tests fail if you forget. The built
  file is committed, so the folder stays ready to import without Node.
- The token is kept in `figma.clientStorage` (only on this computer); the server stores
  only its SHA-256 hash.
