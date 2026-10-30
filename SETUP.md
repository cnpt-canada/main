# Setting up cnpt.ca

The site is static HTML, CSS and vanilla JavaScript, with no database and no build step: Vercel
serves the files as they are. The moving parts are four functions in `api/` — two that take a form and send it as
an email, and two behind admin mode, which signs an editor in with Google and saves by committing
to this repository.

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

Clicking `© 2026 cnpt` at the foot of any page opens Google's account chooser in a popup, while the
page stays where it is. An address that is one of the editors gets a bar along the bottom and the
lines of copy on that page made typeable; Save commits the page file to `main`. Any other account
gets no bar and no message: the page is simply as it was.

It needs nothing set up. The sign-in is the OAuth 2.0 implicit flow against
`https://cnpt.ca/api/auth/callback`, which the Google client already has as an authorised redirect
URI, so there is no JavaScript origin to add; `response_type=id_token` means Google hands the
browser a signed token rather than a code, so there is no client secret anywhere in this site. The
browser loads nothing of Google's — the page's own `script-src 'self'` stands — and the token travels
with every request and is checked from scratch each time: signature against Google's published keys,
then issuer, audience, expiry, `email_verified`, and the address against the editors. The client id
is a public value and lives in `api/_lib/admin.js`; the editors sit beside it as SHA-256 of each
address, so this public repository carries no one's email. `GOOGLE_CLIENT_ID` and `ADMIN_EMAILS`
override both.

**Saving** is the one thing that does need configuring: `GITHUB_REPO` (`cnpt-canada/main`) and
`GITHUB_TOKEN` in Vercel — a fine-grained token for this repository only, **Contents: read and
write**. It can push to the branch that deploys, so it can publish the site: give it an expiry.
Without it everything but Save works.

Admin mode edits text on `/`, `/work` and `/network` — 178 lines, each marked with a `data-ed` key in
the HTML. It cannot touch layout, images, links or section order, and a line sharing its element with
markup is not offered. Sign-ins and saves are logged in the Vercel function logs with the address;
the commit itself is authored as `cnpt admin <info@cnpt.ca>`, because this repository is public.

## Deploying

`main` deploys straight to cnpt.ca, so a push is a release. Nothing has to be provisioned first and
no migration has to be run: there is no database to migrate.
