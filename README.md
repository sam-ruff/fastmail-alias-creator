# Fastmail Alias Creator

A Firefox toolbar button for Fastmail's Masked Email. Open it on a sign-up page, click once, and a new alias for that site is created and put on your clipboard.

It also remembers where each alias went. The popup lists the aliases already used on the site you are looking at, and a search tab finds any alias by address, website or note. The website is saved on the alias in Fastmail itself, so aliases made on your phone or through a password manager show up too.

Inspired by Kevin Graham's [Fastmail Masked Email Creator](https://kevingraham.com/fastmail-masked-email-creator/).

## Signing in

Fastmail has to approve each OAuth app by hand, so "Sign in with Fastmail" only appears in builds that include an approved client ID. Until then, use an API token:

1. In Fastmail, go to Settings, Privacy & Security, API tokens.
2. Create a token with Masked Email access (read-only off).
3. Paste it into the extension.

The token is stored in the extension's local storage and only sent to `api.fastmail.com`.

## Installing

Grab the `.xpi` from the latest release. Release builds of Firefox only install signed extensions, so an unsigned build has to be loaded from `about:debugging` as a temporary add-on, which lasts until Firefox restarts.

## Development

```sh
npm install
npm run dev       # popup and settings as plain pages, backed by a fake Fastmail
npm run check     # formatting, lint, types, tests, build and web-ext lint
npm run build && npm start   # run the real extension in a scratch Firefox profile
```

The dev server takes `?scenario=` (`signed-out`, `signed-in`, `no-oauth`, `empty`, `rate-limit`, `offline`) and `?url=` to pretend the popup was opened on a given page.

To build with OAuth enabled, set `FASTMAIL_OAUTH_CLIENT_ID` in the environment or a `.env` file.

`FASTMAIL_API_TOKEN=... npm run test:integration` runs a few tests against the real API. It creates one alias and deletes it again.

Commits follow Conventional Commits and releases are cut automatically from `main`.

## Licence

MIT
