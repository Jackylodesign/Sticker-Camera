# Sticker-Camera

A personal camera that turn photos into stickers

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. On a computer without a camera, use **Choose from library**.

Sticker border and shadow settings live in `lib/config/sticker-style.ts`.

There is also a private Figma plugin: see [`figma-plugin/README.md`](figma-plugin/README.md).

## Checks

Every pull request (and every push to `main`) runs these on GitHub. A red ✗ on the PR means one failed; click **Details** to see which.

- **Typecheck** (`tsc`): the code's types fit together.
- **Lint** (ESLint): catches likely bugs and React/Next.js mistakes.
- **Format check** (Prettier): the code is formatted the same way everywhere.
- **Build** (`next build`): the site still builds, like on Vercel.

To run them on your own computer (needs Node 26, see `.nvmrc`):

```bash
npm run check
npm run build
```

`npm run format` fixes formatting for you. `npm run lint -- --fix` fixes some lint problems.

## Setup (sign-in, storage, database)

Do these once. Nothing here is created automatically.

### 1. Storage (Vercel dashboard → your `sticker-camera` project → **Storage** tab)

1. **Create → Blob.** Choose **Private** access. Connect it to the project for all environments.
   This adds `BLOB_READ_WRITE_TOKEN` for you.
2. **Create → Neon (Postgres).** Connect it to the project for all environments.
   This adds `DATABASE_URL` for you.

### 2. Create the database tables

1. In Neon → your project → **Connection details**, copy the connection string.
   (Vercel hides "Sensitive" values, so copy it from Neon.)
2. In GitHub → this repo → Settings → Secrets and variables → Actions → **New repository secret**,
   name it `DATABASE_URL` and paste the connection string.
3. Run the **Migrate** action with `apply` (see [Database changes](#database-changes)).

### 3. Google sign-in (Google Cloud Console → APIs & Services)

1. **OAuth consent screen:** type _External_. Under _Test users_, add your own Google email.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins:
     - `https://stickerindex.page`
     - `http://localhost:3000`
   - Authorized redirect URIs:
     - `https://stickerindex.page/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`
   - Preview deployments need no extra URIs: they sign in through the production domain
     (see `AUTH_REDIRECT_PROXY_URL` below).
3. Copy the **Client ID** and **Client secret**.

### 4. Environment variables (Vercel → Settings → Environment Variables)

Set each one for **Production** and **Preview**:

| Name                      | Value                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| `AUTH_SECRET`             | a random secret: run `npx auth secret` or `openssl rand -base64 33` |
| `AUTH_GOOGLE_ID`          | Google Client ID                                                    |
| `AUTH_GOOGLE_SECRET`      | Google Client secret                                                |
| `OWNER_EMAIL`             | your Google email (the only account allowed in)                     |
| `AUTH_REDIRECT_PROXY_URL` | `https://stickerindex.page/api/auth`                                |

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are already there from step 1.
Then redeploy (Deployments → ⋯ → Redeploy) so the new values are used.

### Running locally with sign-in

Fill in `.env.local` (all of the above except `AUTH_REDIRECT_PROXY_URL`), then `npm run dev`.

## Database changes

Every change to the database is a numbered SQL file in `migrations/`. The table
`schema_migrations` remembers which files have run, so each runs only once.

**Adding one**

1. Make the next file, e.g. `migrations/0005_add_something.sql` (next number, no gaps).
2. Start it with a `--` comment saying why it exists.
3. Keep it safe to run twice: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   and an `UPDATE` only with `WHERE … IS NULL`. The tests check this.
4. Put it in the same PR as the code that needs it.

**Running it** (after the PR is merged)

1. GitHub → **Actions** → **Migrate** → **Run workflow**.
2. Pick `dry-run` first. The log lists each file as `already applied` or `would run`.
3. If that looks right, run it again with `apply`. Each file runs in its own transaction;
   if one fails, it stops there and nothing from that file is saved.

Merging deploys the new code right away, and it may fail until the new columns exist,
so run `apply` soon after merging.

Vercel builds never touch the database: previews and production share it, so changes
only happen when you run **Migrate** by hand.
