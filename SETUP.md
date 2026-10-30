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

Clicking the cnpt mark at the foot of any page puts a bar along the bottom with Google's sign-in
button in it. Picking an account happens in Google's popup, so the page never leaves; once an
address in `ADMIN_EMAILS` is in, the lines of copy on the page become typeable and Save commits the
page file to `main`. There is no content store — the HTML in git is the content, and a save is a
release like any other commit.

Set these in Vercel -> Settings -> Environment Variables. Leave any of the first three empty and
there is no editor at all: the mark says admin mode is not set up and nothing else changes.

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from the OAuth client below |
| `ADMIN_EMAILS` | the Google addresses that may edit, comma separated |
| `ADMIN_SECRET` | optional -- without it one is derived from `GOOGLE_CLIENT_SECRET` |
| `GITHUB_REPO` | `cnpt-canada/main` |
| `GITHUB_TOKEN` | fine-grained token, this repository only, **Contents: read and write** |

The Google client: [Google Cloud Console](https://console.cloud.google.com) -> APIs & Services ->
**OAuth consent screen** (External, scopes `openid` and `email` only, so it never goes for
verification -- add each editor under Test users, or publish it, since `ADMIN_EMAILS` is what
actually decides) -> **Credentials -> OAuth client ID -> Web application**, with
**Authorised JavaScript origins** = `https://cnpt.ca`. No redirect URI: the sign-in happens in the
page, so there is nothing to redirect to. No client secret either -- the browser receives the
`id_token` and `api/admin.js` verifies it against Google's published keys, checking the issuer,
audience, expiry, the nonce that page asked for, and that Google has verified the address.

`GITHUB_TOKEN` can push to the branch that deploys, so it can publish the site. Scope it to this one
repository, give it nothing but Contents, and give it an expiry.

Admin mode edits text on `/`, `/work` and `/network` -- 178 lines, each marked with a `data-ed` key
in the HTML. It cannot touch layout, images, links or section order, and a line sharing its element
with markup is not offered. Sign-ins and saves are logged in the Vercel function logs with the
address; the commit itself is authored as `cnpt admin <info@cnpt.ca>`, because this repository is
public.

## Deploying

`main` deploys straight to cnpt.ca, so a push is a release. Nothing has to be provisioned first and
no migration has to be run: there is no database to migrate.
