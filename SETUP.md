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

Clicking `© 2026 cnpt` at the foot of any page asks Google for an account straight away — Google's
own chooser, over the page, which stays where it is. Nothing of ours is on screen while that
happens. An address that is one of the editors gets a bar along the bottom and the lines of copy on
that page made typeable; Save commits the page file to `main`. Any other account gets no bar and no
message: the page is simply as it was. If Google cannot show the chooser — nobody is signed in to
Google in that browser — its own button goes up at the foot of the page instead.

Signing in needs nothing set: the Google client id is a public value and lives in
`api/_lib/admin.js`, and the editors are held there as SHA-256 of each address, so this public
repository carries no one's email. `GOOGLE_CLIENT_ID` and `ADMIN_EMAILS` override both if a new
address has to get in without a commit.

There is no session cookie and no secret of ours. Google's id_token, good for about an hour, travels
with every request and is checked from scratch each time -- signature against Google's published
keys, then issuer, audience, expiry, `email_verified`, and the address against the editors.

Two things it does need:

- **Google Cloud** -> Credentials -> the web client -> **Authorised JavaScript origins** must include
  `https://cnpt.ca`. Without it Google answers `invalid_client / no registered origin` and the button
  cannot sign anyone in. No redirect URI is used.
- **Saving** needs `GITHUB_REPO` (`cnpt-canada/main`) and `GITHUB_TOKEN` in Vercel -- a fine-grained
  token for this repository only, **Contents: read and write**. It can push to the branch that
  deploys, so it can publish the site: give it an expiry. Without it everything but Save works.

Admin mode edits text on `/`, `/work` and `/network` -- 178 lines, each marked with a `data-ed` key
in the HTML. It cannot touch layout, images, links or section order, and a line sharing its element
with markup is not offered. Sign-ins and saves are logged in the Vercel function logs with the
address; the commit itself is authored as `cnpt admin <info@cnpt.ca>`, because this repository is
public.

## Deploying

`main` deploys straight to cnpt.ca, so a push is a release. Nothing has to be provisioned first and
no migration has to be run: there is no database to migrate.
