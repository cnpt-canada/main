# Setting up cnpt.ca

The site is static HTML, CSS and vanilla JavaScript, with no database and no build step: Vercel
serves the files as they are. The moving parts are four functions in `api/` — two that take a form
and send it as an email, and two behind admin mode, which signs an editor in with Google and saves
by committing to this repository.

## Running it locally

Any static server will do, because nothing is compiled:

```
npx serve .
```

The two form routes need Vercel's runtime, so to exercise them use `vercel dev` with the variables
below in `.env.local`.

## The one service it needs: Resend

Both forms end in an email, so [Resend](https://resend.com) is the whole back end.

1. Create a Resend account and an API key (Resend → **API Keys**).
2. In Vercel → Project → **Settings → Environment Variables**, set, for Production:

   | Variable | Value |
   | --- | --- |
   | `RESEND_API_KEY` | the key from step 1 |
   | `CONTACT_TO` | where the note on the home page is sent |
   | `CONTACT_FROM` | optional, once `cnpt.ca` is verified in Resend, e.g. `cnpt <hello@cnpt.ca>` |
   | `TALENT_TO` | where the talent pool form is sent; falls back to `CONTACT_TO` |

Until a domain is verified in Resend, `CONTACT_TO` has to be the address the Resend account was
created with — Resend will not deliver anywhere else on an unverified domain.

`.env.example` carries the same list for local use.

If `RESEND_API_KEY` is missing the forms answer `not_configured` rather than failing silently, so a
missing key is visible instead of losing messages.

## Admin mode

Clicking the cnpt mark at the foot of any page opens admin mode, where the words on the page can be
retyped in place. Saving commits the page file to `main`, so a save is a release like any other
commit, and `git log` is the history of who changed the copy and when.

Only the addresses in `ADMIN_EMAILS` get in. Until all of `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `ADMIN_SECRET` and `ADMIN_EMAILS` are set there is no editor at all: the
mark answers that admin mode is not set up, and nothing else about the site changes.

### 1. The Google client

1. [Google Cloud Console](https://console.cloud.google.com) → pick or create a project.
2. **APIs & Services → OAuth consent screen**. User type **External** is fine; fill in the app name
   and support email. The only scopes needed are `openid` and `email`, both non-sensitive, so this
   never goes for verification. While the screen is in **Testing**, add each editor under **Test
   users** — or press **Publish app**, which is safe here because `ADMIN_EMAILS` is what actually
   decides who may edit.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web
   application**.
   - **Authorised JavaScript origins**: nothing. The browser never talks to Google directly.
   - **Authorised redirect URIs**: `https://cnpt.ca/api/admin`
     (add `http://localhost:3000/api/admin` as well if you want to sign in under `vercel dev`).
4. Copy the client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The redirect URI has to match character for character, including the scheme and no trailing slash.
If it does not, Google answers `redirect_uri_mismatch` before the site is ever reached. A preview
deployment has a different host, so to sign in on one, set `ADMIN_REDIRECT_URI` for that environment
and register that URI too.

### 2. The rest of the variables

In Vercel → Project → **Settings → Environment Variables**, for Production:

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `ADMIN_EMAILS` | the Google addresses that may edit, comma separated |
| `ADMIN_SECRET` | 32+ random characters, e.g. `openssl rand -base64 32` — signs the session cookie |
| `GITHUB_REPO` | `cnpt-canada/main` |
| `GITHUB_TOKEN` | a fine-grained token for this repository only, **Contents: read and write** |
| `GITHUB_BRANCH` | optional, defaults to `main` |

`GITHUB_TOKEN` can push to the branch that deploys, so it can publish the site. Scope it to this one
repository, give it nothing but Contents, and give it an expiry — the only thing it is for is
committing text an editor has already been let in to change.

### What is actually checked

- The login is the OAuth 2.0 authorization-code flow, run entirely in `api/admin.js`. The browser
  loads no Google script, which it could not anyway: the site's `Content-Security-Policy` allows
  scripts from this origin only. The client secret never leaves the function.
- Each login carries a `state` and a `nonce` kept in a short-lived signed cookie, and the token that
  comes back has to match both.
- The `id_token` is verified against Google's published signing keys, then its issuer, audience,
  expiry and nonce, and that Google itself has verified the address.
- The address is then checked against `ADMIN_EMAILS` — and checked again on every later request, so
  removing someone from the list ends their session on their next click rather than twelve hours
  later. A session lasts twelve hours.
- A save has to come from this origin, carry a live session, and name a line that still sits in an
  element holding nothing but words. An edit is sent as text, never as markup: `api/_lib/edit.js`
  writes the tags itself, so the only things an edit can put into a page are words and `<em>` or
  `<strong>` emphasis.
- Sign-ins and saves are logged in the Vercel function logs, with the address. The commit itself is
  authored as `cnpt admin <info@cnpt.ca>`, because this repository is public.

### What admin mode can and cannot change

It edits text in place on `/`, `/work` and `/network` — 178 lines in all, every one marked with a
`data-ed` key in the HTML. It cannot change layout, images, links, section order or anything on the
404 page, and a line that shares its element with markup (an icon, a card, a form control) is not
offered. `⌘B` and `⌘I` work inside a line; Escape leaves; `⌘S` saves.

The keys are generated from the markup, so if a page's structure changes by hand, the keys in it move
with the elements they are on — there is no separate map to keep in step.

## Deploying

`main` deploys straight to cnpt.ca, so a push is a release. Nothing has to be provisioned first and
no migration has to be run: there is no database to migrate.
