<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Online features (accounts, cloud saves, global leaderboard) live in src/game/cloud.ts and must fail soft — the game never waits on the backend, guest/local play is the default.
- Global leaderboard sanity limits are enforced by a database trigger, not the client, so tampered clients can't post impossible scores.
