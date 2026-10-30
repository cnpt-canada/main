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

- Three pages: `/` (home and about are one page) `/work` `/network`. There is no database.
  `api/contact.js` and `api/talent.js` take a form and send it as an email through Resend.
- One stylesheet, `site.css`, with two themes: `:root` is light, `:root[data-theme="dark"]` is dark.
  Colours are tokens (`--bg`, `--fg`, `--line`, `--signal`); anything sitting on the signal pink stays `#fff`
  in both themes.
- `site-head.js` applies the saved theme before the first paint; `site.js` is everything else.
- Admin mode: `© 2026 cnpt` at the foot of the page opens a bar with Google's sign-in button in it;
  an editor retypes the lines marked `data-ed` in the HTML and Save commits the page file to `main`
  (`api/content.js`), so a save is a release and there is no content store. Google's id_token travels
  with each request and is verified every time — no session cookie, no secret of ours. The client id
  and the editors (as hashes) are in `api/_lib/admin.js`. `site-admin.js` is fetched only when the
  line is pressed. `SETUP.md` has the rest.
- Icons live in `site-icons.svg` and are used as `<use href="/site-icons.svg#id">`, drawn 24×24 with a 2px
  stroke in `currentColor`.
- The site has no dependencies at all, so a deploy is just Vercel copying files. Keep it that way:
  anything that needs provisioning can take the whole site down with it. Code under `api/_lib/` is
  shared and is never deployed as a function.
- Old URLs are kept alive with redirects in `vercel.json` rather than by leaving pages behind.
