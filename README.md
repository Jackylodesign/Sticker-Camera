# Sticker-Camera
A personal camera that turn photos into stickers

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. On a computer without a camera, use **Choose from library**.

Sticker border and shadow settings live in `lib/constants.ts`.

There is also a private Figma plugin: see [`figma-plugin/README.md`](figma-plugin/README.md).

## Setup (sign-in, storage, database)

Do these once. Nothing here is created automatically.

### 1. Storage (Vercel dashboard → your `sticker-camera` project → **Storage** tab)

1. **Create → Blob.** Choose **Private** access. Connect it to the project for all environments.
   This adds `BLOB_READ_WRITE_TOKEN` for you.
2. **Create → Neon (Postgres).** Connect it to the project for all environments.
   This adds `DATABASE_URL` for you.

### 2. Create the database table

1. In Vercel → Settings → Environment Variables, copy the value of `DATABASE_URL`.
2. On your computer: copy `.env.example` to `.env.local` and paste it into `DATABASE_URL=`.
3. Run `npm run db:setup`. It prints "Database is ready". Running it again is safe.

### 3. Google sign-in (Google Cloud Console → APIs & Services)

1. **OAuth consent screen:** type *External*. Under *Test users*, add your own Google email.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins:
     - `https://sticker-camera-brown.vercel.app`
     - `http://localhost:3000`
   - Authorized redirect URIs:
     - `https://sticker-camera-brown.vercel.app/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`
   - Preview deployments need no extra URIs: they sign in through the production domain
     (see `AUTH_REDIRECT_PROXY_URL` below).
3. Copy the **Client ID** and **Client secret**.

### 4. Environment variables (Vercel → Settings → Environment Variables)

Set each one for **Production** and **Preview**:

| Name | Value |
| --- | --- |
| `AUTH_SECRET` | a random secret: run `npx auth secret` or `openssl rand -base64 33` |
| `AUTH_GOOGLE_ID` | Google Client ID |
| `AUTH_GOOGLE_SECRET` | Google Client secret |
| `OWNER_EMAIL` | your Google email (the only account allowed in) |
| `AUTH_REDIRECT_PROXY_URL` | `https://sticker-camera-brown.vercel.app/api/auth` |

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are already there from step 1.
Then redeploy (Deployments → ⋯ → Redeploy) so the new values are used.

### Running locally with sign-in

Fill in `.env.local` (all of the above except `AUTH_REDIRECT_PROXY_URL`), then `npm run dev`.
