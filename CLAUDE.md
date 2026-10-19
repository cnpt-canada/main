# cnpt.ca

A static HTML/CSS/vanilla-JS site with Vercel serverless functions in `api/`. `main` deploys straight to
cnpt.ca, so a push is a release.

## Shipping

- Commit and push to `main` once a change is finished and verified — no need to ask first. Then say what
  shipped, in one line.
- Verify before committing: no console errors and nothing wider than the screen at 1440, 390 and 320.
- A commit message is one plain sentence saying what changed. No `feat:`/`fix:` prefixes.
- Never force-push `main`, and never rewrite a commit that is already pushed.
- If something is half-finished, say so instead of pushing it.

## Content

- Sample data is Canadian: Toronto, Canadian names, `@gmail.com` addresses. Never Korean examples.

## How the site is put together

- Four pages: `/` `/about` `/network` `/work`. There is no sign-in and no database — the only two
  functions, `api/contact.js` and `api/talent.js`, take a form and send it as an email through Resend.
- One stylesheet, `site.css`, with two themes: `:root` is dark, `:root[data-theme="light"]` is light.
  Colours are tokens (`--bg`, `--fg`, `--line`, `--signal`); anything sitting on the signal pink stays `#fff`
  in both themes.
- `site-head.js` applies the saved theme before the first paint; `site.js` is everything else.
- Icons live in `site-icons.svg` and are used as `<use href="/site-icons.svg#id">`, drawn 24×24 with a 2px
  stroke in `currentColor`.
- The site has no dependencies at all, so a deploy is just Vercel copying files. Keep it that way:
  anything that needs provisioning can take the whole site down with it. Code under `api/_lib/` is
  shared and is never deployed as a function.
- Old URLs are kept alive with redirects in `vercel.json` rather than by leaving pages behind.
