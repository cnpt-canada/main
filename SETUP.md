# Setting up cnpt.ca

The site is static HTML, CSS and vanilla JavaScript. There is no database, no sign-in and no build
step: Vercel serves the files as they are. The only moving parts are two functions in `api/`, and
both of them do the same thing — take a form and send it as an email.

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

## Deploying

`main` deploys straight to cnpt.ca, so a push is a release. Nothing has to be provisioned first and
no migration has to be run: there is no database to migrate.
