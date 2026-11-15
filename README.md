# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

### Cyber Range development preview

The optional Cyber Range is disabled unless explicitly enabled in a development build. To preview it locally, create `.env.development.local` in the project root with:

```sh
VITE_ENABLE_CYBER_RANGE=true
```

Restart the Vite development server after changing the flag. The feature is never enabled by this setting in production builds.

## Production deployment notes

The application uses TanStack Start with Nitro. `vite.config.ts` delegates the Nitro
target to `@lovable.dev/vite-tanstack-config`; the current build generates a
Cloudflare Worker module with `nodejs_compat` and a static asset binding. Run
`npm run build` to produce the deployment output in `.output`. The separate
`wrangler.staging.json` configuration targets the staging-only entry and uses no
production route or account identifier. There is no production deployment
configuration or deploy script. A successful local build is not a production
deployment test.

### NEXUS staging quota foundation

The staging Worker wrapper exports a SQLite-backed `AiQuotaCoordinator` using
Wrangler's current declarative `exports` class lifecycle setting. Its single
globally named Durable Object serializes identity quota checks, in-flight limits,
and daily cost reservations in one synchronous storage transaction.
Minute and hour quotas use rolling windows; daily request and budget limits reset
at 00:00 UTC. Accepted requests count toward request quotas even if a known
pre-provider failure releases their cost reservation.

An uncompleted reservation expires after two minutes. Its reserved amount is
counted as spent on expiry, so an uncertain provider failure cannot repeatedly
refund the daily budget. Expired records are cleaned lazily on the next
coordinator operation. The staging hard budget is $1 per UTC day. The current
$0.10 maximum reservation per request is only a conservative staging policy
ceiling, not a Gemini cost estimate. Before enabling a provider, choose the
model and supply its current input/output token prices and enforced token limits
to calculate a true worst-case reservation. `AI_ENABLED` remains `false`.

### NEXUS guest-session foundation

Guest session helpers use a server-generated 192-bit guest ID and session ID in
a versioned payload signed with HMAC-SHA-256. Verification uses Web Crypto
signature verification and checks the configured audience, environment, issue
time, and 12-hour maximum expiry. The signing key is read only from the Nitro
Cloudflare request binding `GUEST_SESSION_SIGNING_SECRET`; it must be at least
32 UTF-8 bytes.

The `__Host-cyber-guest-session` cookie is HttpOnly, Secure, SameSite=Strict,
host-only, and scoped to `/`. In particular, Secure is not weakened for local
HTTP. Guest session issue/renew/logout handlers require the exact configured
HTTPS origin and host, POST JSON, and same-origin Fetch Metadata when supplied.
The application-origin binding is deliberately unset in staging until the
authorized staging hostname is known, so these operations fail closed there.

Guest issuance requires `GUEST_SESSIONS_ENABLED=true`, a `test` or `staging`
session environment, a valid signing configuration, and complete Turnstile
configuration. Turnstile verification sends the submitted token to Cloudflare's
Siteverify endpoint from the server and requires a successful, fresh response
whose hostname and action match the server bindings. `TURNSTILE_SECRET_KEY` is a
server-only Cloudflare secret; `TURNSTILE_EXPECTED_HOSTNAME` and
`TURNSTILE_EXPECTED_ACTION` are server configuration for creation;
`TURNSTILE_RENEW_EXPECTED_ACTION` is a distinct server-configured action for
renewal. Both operations require their own valid challenge before issuing a
cookie. `TURNSTILE_SITE_KEY` is public and can be returned to a client only
when issuance is fully configured. The challenge timestamp must use Cloudflare's
ISO-8601 UTC timestamp format; Siteverify redirects fail closed.
Siteverify receives a UUID idempotency key. Duplicate-token rejection follows
Cloudflare's single-use validation behavior, which is eventually consistent and
does not guarantee rejection of concurrent replays.

Staging declares issuance disabled and has no expected hostname, site key, or
secret configured. Do not enable staging issuance until the authorized hostname
and widget configuration are supplied. Production issuance is not permitted by
the current gate. Guest-session creation and renewal each require a verified
Turnstile token, but no current client UI invokes the guest-session creation
Server Function, so the official widget is not yet mounted in the application.
Do not enable guest access until that UI integration is completed and verified.
Supabase identities continue to come from server-verified claims and take
precedence over a valid guest cookie.
Only the resolved `guest:<id>` or `user:<sub>` identity and its type cross the
Mentor authorization boundary. When a provider is deliberately configured and
AI is enabled, the server reserves the configured worst-case request cost for
that identity before authorization and provider execution. A pre-provider
authorization failure releases only the cost reservation (not the accepted
request count). Provider success, invalid output, and completed-but-uncertain
failures settle the full reserved amount; they are not refunded without provider
usage accounting. A timeout aborts the provider and leaves its reservation active
until the coordinator expires and charges it, preserving the in-flight lock for
the remainder of the lease. The provider timeout is capped before the
coordinator's two-minute reservation expiry. The deployed Mentor still has
`provider: null`, `AI_ENABLED=false`, and deny-all authorization, so it does not
create reservations or make provider calls.

Logout clears the browser cookie but does not revoke a copied stateless token.
A copied token may be replayed until its expiry (up to 12 hours); the session ID
rotation on renewal does not revoke the previous token. Immediate revocation
requires a separately designed server-side revocation store.

For isolated local Worker testing, build first and use a dedicated persistence
directory; do not point Wrangler at production state. Prevent Wrangler from
loading this repository's `.env` values. Do not keep production credentials in
`.dev.vars`:

```powershell
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false"
$env:CLOUDFLARE_INCLUDE_PROCESS_ENV = "false"
npm run build
npx wrangler dev --local --config wrangler.staging.json --persist-to .wrangler/staging-test-5504
Remove-Item Env:\CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV
Remove-Item Env:\CLOUDFLARE_INCLUDE_PROCESS_ENV
```

```sh
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false CLOUDFLARE_INCLUDE_PROCESS_ENV=false npm run build
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false CLOUDFLARE_INCLUDE_PROCESS_ENV=false npx wrangler dev --local --config wrangler.staging.json --persist-to .wrangler/staging-test-5504
```

The local persistence directory is intentionally not reset by project scripts.

Configure these values in the appropriate environment; never commit populated
environment files:

- Build-time public browser configuration: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is public client
  configuration, not an authorization boundary.
- Server runtime configuration: `SUPABASE_URL` and
  `SUPABASE_PUBLISHABLE_KEY`, used by server-side Supabase authentication and the
  NEXUS Mentor request boundary.
- `SUPABASE_SERVICE_ROLE_KEY` is read only by the server-only admin client module.
  Configure this value only as a server secret and never as a `VITE_*` value.
  Verified global leaderboard submissions are currently disabled: challenge
  answer data is present in the browser bundle, so server-side answer checking
  cannot prevent answer-key extraction. Guest/local gameplay, scores, and saves
  continue to work, but new runs do not qualify for the online board. Do not
  re-enable ranked submissions until challenge validation no longer depends on
  answer data shipped to clients. The migration remains a prerequisite for any
  future server-validated leaderboard implementation; do not grant browser
  clients direct insert access to leaderboard entries.

The live NEXUS provider is intentionally unavailable: AI is disabled in the
feature flags and the server dependencies return no provider and deny requests.
Do not enable live AI until a server-side provider, authorization, and shared
rate-limiting configuration have been implemented and verified. Guest/local play
and scripted mentor/debrief responses are the intended default.

Before release, apply and verify all database migrations, authentication,
cloud-save row-level security, leaderboard validation, runtime environment
bindings, and the worker using an authorized non-production deployment. Those
external service and production checks are not established by the local build.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
  Supabase deployment is connected to the main branch.
