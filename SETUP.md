# cnpt — setup

The site is static HTML plus a few Vercel functions in `api/`. Without any of the setup below the public
pages still work; sign-in, the account and admin pages, and saving enquiries need the three services here.

| What | Service | Used for |
| --- | --- | --- |
| Sign-in | Google OAuth client | "Continue with Google" on `/signin` (a first sign-in creates the account) |
| Data | Supabase (Postgres) | users, enquiries, onboarding |
| Email (optional) | Resend | a copy of every enquiry in your inbox |

All values go in **Vercel → Project → Settings → Environment Variables**. `.env.example` lists every one.

## 1. Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. **SQL Editor → New query**, paste `supabase/schema.sql`, **Run**. It creates `users`, `enquiries` and
   `onboarding` and turns on row level security with no policies, so only the server can read or write them.
   It is safe to run again after pulling changes: it only adds what is missing.
3. **Project Settings → API**: copy the Project URL to `SUPABASE_URL` and the `service_role` key to
   `SUPABASE_SERVICE_ROLE_KEY`. The service-role key bypasses row level security: keep it in Vercel only.

## 2. Google sign-in

1. <https://console.cloud.google.com> → create or pick a project.
2. **APIs & Services → OAuth consent screen**: app name `cnpt`, support email, scopes `openid`, `email`, `profile`.
   Publish the app (while it is in "Testing", only listed test users can sign in).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://<your-domain>/api/auth/callback`
     (add one per domain you use, e.g. the `*.vercel.app` domain and later `https://cnpt.ca`).
4. Copy the client ID and secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Set `PUBLIC_URL` to the same origin as the redirect URI, e.g. `https://cnpt.ca`.

## 3. Secrets and admins

- `JWT_SECRET`: 32+ random characters; signs the session cookie. Changing it signs everyone out.
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- `ADMIN_EMAILS`: the Google accounts that are always admins, comma-separated. They can give admin access to
  other members on `/admin` → Members, and can't be demoted there.

## 4. Enquiry emails (optional)

Enquiries are always saved and shown on `/admin` → Enquiries. To also receive them by email:

1. <https://resend.com> → API Keys → create one → `RESEND_API_KEY`.
2. `CONTACT_TO`: where enquiries go. Until a domain is verified in Resend, this must be the address the Resend
   account was created with.
3. Once `cnpt.ca` is verified in Resend, set `CONTACT_FROM`, e.g. `cnpt <hello@cnpt.ca>`.

## 5. Deploy

Push to `main`; Vercel builds automatically (it installs `package.json` dependencies; there is no build step).
After adding or changing environment variables, redeploy so the functions pick them up.

If Vercel shows a login page to visitors, turn off **Settings → Deployment Protection → Vercel Authentication**
for production.

## How it fits together

- Public pages: `/`, `/practices`, `/process` (what we do + process; `/what-we-do` redirects here), `/work` (client works), `/team`, `/contact`. They share
  `site.css`, `site.js` (motion, cursor label, phone menu, contact form) and `site-icons.svg`; old `/#section` links
  redirect to the matching page. Type is Helvetica (Helvetica Neue on Apple devices, Arial where Helvetica isn't installed).

- `/signin` → `/api/auth/google` → Google → `/api/auth/callback` → session cookie → `/account`.
- The session cookie is HttpOnly, SameSite=Lax, Secure (`__Host-` prefixed on HTTPS) and holds only the user id.
  The role is read from the database on every request, so admin changes and account deletion apply at once.
- The OAuth `state` is signed and tied to a short-lived cookie, which stops login CSRF; `next=` only accepts
  paths on this site.
- Every write checks the request's `Origin`; admin routes check the admin role; all input is validated against
  the same lists the database enforces (`api/_lib/rules.js`, `supabase/schema.sql`).
- `vercel.json` sets security headers site-wide; `/signin`, `/account` and `/admin` add a strict CSP with no
  inline scripts.

| Page | Who | What |
| --- | --- | --- |
| `/signin` | anyone | Continue with Google |
| `/onboarding` | signed in | the step-by-step enquiry: company, fields (up to 5 tags), consultants, confirm. New clients see it first, with a welcome screen; "New enquiry" opens it later |
| `/account` | signed in | your enquiries (status, fields, consultants, estimate), profile, sign out, delete account |
| `/admin` | admins | enquiries (filter, search, sort, status, estimate, reply by email), onboarding (who finished their first run, where others stopped, view as user), members (grant/remove admin, view as user) |

New clients (not admins) are sent to `/onboarding` until they send their first enquiry through it; each step is saved,
so they can leave and come back. Sending completes the enquiry they sent from the website (if any) or creates one, with
the fields and consultants on it. The estimate is set per enquiry on `/admin` → Enquiries (whole CAD, up to 1,000,000);
until then the client sees "To be confirmed". Admins can open `/onboarding?preview` to walk through it without saving,
and "View as" (`/account?as=<id>`) shows a member's account read-only.

`/account` and `/admin` share one console layout: a left navigation, data tables, and a details panel that
opens beside the table (or over it on smaller screens). Views are addressed by hash, e.g. `/admin#members` or
`/admin#enquiries/12`, so links and the back button work.
