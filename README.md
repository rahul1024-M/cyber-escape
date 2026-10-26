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
`npm run build` to produce the deployment output in `.output`. This workspace has
no checked-in Wrangler deployment configuration or deploy script, so confirm the
Cloudflare project, binding setup, and deployment command with the project owner
before deploying. A successful local build is not a production deployment test.

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
