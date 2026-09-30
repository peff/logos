# Optional Logos server

This is a small Cloudflare Worker prototype for collecting difficulty feedback
in D1. The beta game opts in through the `logos-feedback-endpoint` meta tag in
`index.html`, currently pointing to `https://logos.peff.workers.dev/api/feedback`.
Clear that value to disable feedback entirely in a standalone copy. Deploying
this server does not host the game or change its current location.

The Worker has one public operation: `POST /api/feedback`. Database reads and
exports use your authenticated Cloudflare tooling. There is no player account
system, public report browser, or runtime dependency beyond Workers and D1.

## Files

- `worker.js`: HTTP handling, report validation, and a parameterized insert.
- `migrations/0001_feedback.sql`: the feedback table.
- `wrangler.jsonc`: deployment configuration.
- `worker-test.js`: Deno tests for requests and database binding arguments.

## Local development

Run the handler tests without a Cloudflare account or Node installation:

```sh
deno test server/worker-test.js
```

For the actual Workers runtime and a local D1 database, install Node.js supported
by Wrangler 4, then run from this directory:

```sh
npm ci
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

Wrangler is a development dependency pinned by `package-lock.json`; `npm ci`
installs those exact versions, and `npx wrangler` runs the local copy.

Local D1 state lives under
`.wrangler/`; `--local` does not modify a deployed database. Local state and
secret files are ignored by Git. The deployment configuration is checked in;
the Worker name and D1 identifier are not secrets.

## Request format

Send JSON with `Content-Type: application/json`:

```json
{
  "id": "ab68dd83-793c-449c-a2a9-d52bc3dfb450",
  "senderId": "171409b8-a54c-47a2-84a5-e7c13f1722b2",
  "playerName": "Peff",
  "seed": "02b839f1",
  "generatorVersion": 1,
  "ratingVersion": "placement-composite-2",
  "newLevel": "hard",
  "answer": "about-right",
  "outcome": "won",
  "elapsedMs": 466000,
  "hintsUsed": false,
  "continuedAfterLoss": false,
  "zenMode": false
}
```

The client creates `id` once with `crypto.randomUUID()` when the player sends
an answer and reuses it for retries. The first accepted report for an ID wins; subsequent submissions with that ID return success without changing it.
`senderId` is a separate UUID generated once per browser profile and stored in
localStorage, so reports can be grouped across games. It is not an account or
authenticated identity. A new origin, another device, or clearing browser storage
will produce a new ID. If storage is unavailable, the client retains the
ID in memory for the page's lifetime.

`playerName` is optional: a name or nickname, at most 80 characters, without
control characters. The server trims surrounding whitespace and stores empty
or omitted names as null. The feedback dialog offers this field, remembers it
locally when sending, and allows the player to clear it. Names are recorded per
submission, so editing a name does not rewrite previous reports. Even without a
name, the persistent sender ID makes the reports pseudonymous, not anonymous.
The dialog explains that answers are grouped by browser and names are optional.

The seed is eight lowercase hexadecimal digits. `ratingVersion` identifies the
scoring method; current clients use `placement-composite-2` (excess discards +
5 × scarcity averaged over ten routes, with cutoffs 47/70). `newLevel` is the
reported difficulty.
The names remain compatible with earlier clients; `oldLevel` is optional
and stores a historical comparison when provided. Otherwise `old_level`
is NULL. Reports are not independently verified; the seed lets us recompute
the difficulty later.

The server also accepts the historical versions `stretch-scarcity-1`,
`stretch-scarcity-2`, `allowance3-scarcity-1`, and the five-route
`placement-composite-1` from older clients. Their formulas and experiments
are recorded in Git history.

`answer` is one of `about-right`, `felt-easier`, `felt-harder`, or `unsure`, relative
to `newLevel`. `elapsedMs` is the displayed game timer in milliseconds, or null
when unavailable. Since the timer stops in Zen, this is not necessarily total
solving time. Assistance flags preserve that context. The endpoint accepts
assisted completions as well as scored wins and losses.

`outcome` is `won` for a completed puzzle (including assisted play), or `lost`
for a loss. Completion after continuing from a loss is `won` with
`continuedAfterLoss: true`; it does not imply a scored victory in the Chronicle.
The client defers the feedback prompt when the player continues
after a loss, then asks on completion. Closing the browser is not reported as
a loss or abandonment.

Success is HTTP 200 with `{"ok":true}`, including retries. Invalid input is 400,
oversized input is 413, and a database failure is 503. Reports are limited to
4 KiB, with a fixed set of fields. CORS allows unauthenticated submissions from any
origin, including `file://`; it grants no read access. The endpoint is publicly
writable, with no abuse throttling yet. Before wider exposure, consider a
Cloudflare rate limit; an API key embedded in the game would not be a secret.

## Deploy when ready

These commands create remote resources and publish the endpoint. They are not
needed to play Logos or to run the handler tests.

```sh
npx wrangler login
npx wrangler d1 create logos
```

The checked-in config points to the existing Logos database; its creation
step is already complete. For an independent deployment, create a database in
your own account and replace the database ID and names in `wrangler.jsonc`,
retaining `DB` as the binding name. If Wrangler adds a second database entry,
merge its ID into the existing entry rather than keeping both.

After configuring the database:

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Wrangler prints the HTTPS `workers.dev` address. Set the
`logos-feedback-endpoint` meta tag to its `/api/feedback` URL to opt in, or leave
it blank to disable prompting and submission. Cloudflare credentials belong in Wrangler's authentication or deployment environment,
never in the game or committed configuration.

## Read the reports

From this directory, query the deployed database:

```sh
npx wrangler d1 execute DB --remote --json \
  --command 'SELECT * FROM difficulty_feedback ORDER BY received_at' > feedback.json
```

Wrangler emits a result envelope containing the rows. To export the database
as SQL instead:

```sh
npx wrangler d1 export DB --remote --output feedback.sql
```

`received_at` is the server receive time in Unix milliseconds. Retrieval uses
your Cloudflare credentials; the Worker exposes no corresponding GET endpoint.
Keep downloaded player reports outside the public repository.

Cloudflare references: [D1 setup](https://developers.cloudflare.com/d1/get-started/),
[prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/),
[Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## Player controls

The beta samples 20% of eligible completed games for feedback. After showing
a prompt, it skips the next two completed attempts. Dismissing increases the
gap to five attempts, then ten,
then twenty on subsequent dismissals. A successful submission resets the gap
to two. This backoff lasts only until the page is reloaded. A qualifying
Pantheon entry is shown first; feedback waits until it is dismissed. Nothing
is sent unless the player submits.

Each response button submits immediately, using the optional name above it.
Players can dismiss with Dismiss, Escape, or a click outside the dialog. They
can also choose Never ask again. That preference is stored as
`difficultyFeedbackDisabled`; deleting that localStorage entry and reloading
re-enables prompts. The browser ID and optional name use
`difficultyFeedbackSenderId` and `difficultyFeedbackName`.

Failed submissions can be retried with the same report ID, or dismissed.
There is no background upload queue. Successful submission closes the dialog and shows a thank-you in the status bar.

When publishing a client with a new rating version, deploy the Worker first
so it accepts that version before clients begin submitting reports.

Before publishing clients that omit `oldLevel`, apply migration 0002 to the
local and remote databases, then deploy the Worker. It keeps existing reports
and accepts both old and new clients:

```sh
npx wrangler d1 migrations apply logos --local
npx wrangler d1 migrations apply logos --remote
npx wrangler deploy
```
