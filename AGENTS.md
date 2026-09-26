# Alias Creator for Fastmail development notes

Firefox extension (Manifest V3) that creates Fastmail Masked Email aliases for the current site and keeps a searchable record of which alias belongs to which website.

## Private notes

Read `PRIVATE.md` in the repository root before doing anything involving accounts, credentials, signing keys, the Fastmail OAuth registration or release infrastructure. It is gitignored and holds details that must not appear in this public repository. The pre-commit hook refuses any commit that tracks a `PRIVATE.md`. Never copy its contents into tracked files, commit messages, issues or pull requests. If it is missing, create it from the outline in the `new-repo-setup` skill and ask the owner for the details.

## Layout and boundaries

- `src/background` owns all network and token work. The popup is destroyed when the OAuth window opens, and Fastmail revokes the grant if an old refresh token is reused, so refresh must stay single-flight in the background.
- `src/shared/messages.ts` is the typed contract between the UI and the background. Change both sides together.
- `src/api/jmap.ts` is the only code that speaks JMAP. Anything else depends on the `MaskedEmailApi` interface and takes it through the constructor.
- `src/dev` is a fake Fastmail and a mock bridge. `npm run dev` serves the popup and options as plain pages against it; pick a scenario with `?scenario=signed-out|signed-in|no-oauth|empty|rate-limit|offline&url=<tab url>`.
- Site matching uses the registrable domain (`tldts`), so `login.example.com` and `example.com` share history.

## Auth

OAuth needs a client ID issued by Fastmail. It is injected at build time as `FASTMAIL_OAUTH_CLIENT_ID`; without it the UI shows only the API token form. The redirect URI is Firefox's loopback form `http://127.0.0.1/mozoauth2/<hash>`, derived in `src/background/redirect.ts`.

## Checks

`npm run check` runs Prettier, ESLint, `tsc`, unit tests, the build and `web-ext lint`. The pre-commit hook runs the lint and unit test parts; the commit-msg hook requires Conventional Commits because semantic-release derives versions from them. `npm install` sets `core.hooksPath` to `.githooks`.

`npm run test:integration` hits the real Fastmail API when `FASTMAIL_API_TOKEN` is set. It creates one alias and marks it deleted.

Unit tests mock the network through injected fakes (`vi.fn` for `MaskedEmailApi`/`fetch`, or `FakeFastmail`). Do not add real network calls to unit tests.

## CI and releases

All workflows run on the self-hosted pool (`[self-hosted, sophie]`), never GitHub-hosted runners. `ci.yml` plans the next version with a semantic-release dry run, then stamps, checks, builds and packages the XPI. `release.yml` runs after a successful main push, checks that the plan matches the tested revision, submits the build to the listed channel on addons.mozilla.org (with a source zip, since Mozilla reviews it) and publishes the GitHub release. A review that outlasts the 20 minute wait is not a failure; that release just has no XPI attached. `listing.yml` runs `scripts/amo-listing.ts` whenever `amo/`, `PRIVACY.md` or the script change (or by hand), pushing the listing text from `amo/metadata.json`, the icon `amo/icon.png`, `PRIVACY.md` as the privacy policy, and `amo/screenshots` if the listing has none yet. To replace screenshots, delete the old ones on addons.mozilla.org first. Pin actions to commit SHAs.

The manifest declares `authenticationInfo` and `browsingActivity` under `data_collection_permissions` because the token and each alias's website go to Fastmail. Update that, `PRIVACY.md` and the listing together if what is sent ever changes. The name must stay in the "... for Fastmail" form to satisfy Mozilla's trademark rules.

Use `Sam R <sam@technesci.co.uk>` for the Git author and committer identity.

## Style

UK spelling, no emojis, no em dashes. Keep comments for things the code cannot say itself.
