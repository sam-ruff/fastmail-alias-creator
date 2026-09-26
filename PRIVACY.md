# Privacy policy

Alias Creator for Fastmail talks to one service: Fastmail's API at `api.fastmail.com`. It has no server of its own, no analytics and no tracking, and the developer never receives any of your data.

## What is sent to Fastmail

- Your sign-in credentials: either the API token you paste in, or the OAuth tokens Fastmail issues when you sign in. They are sent with each request so Fastmail knows it is you.
- When you create an alias: the address of the website you are on (for example `https://example.com`, without the page path) and the optional note you type. Fastmail stores these with the alias so you can see later where each alias was used.
- When you enable or disable an alias: which alias and its new state.

Nothing is sent until you sign in, and website addresses are only sent when you click to create an alias. The extension does not read page contents or your browsing history.

## What is stored in your browser

- Your API token or OAuth tokens.
- A copy of your aliases (address, website, note, state and dates) so the popup can show and search them quickly.

This is kept in the extension's local storage on your computer. Signing out deletes it.

## Fastmail's handling

What Fastmail does with the data it receives is covered by [Fastmail's privacy policy](https://www.fastmail.com/policies/privacy/). This extension is independent and not made or endorsed by Fastmail.

## Contact

Questions or problems: open an issue at https://github.com/sam-ruff/fastmail-alias-creator/issues.
