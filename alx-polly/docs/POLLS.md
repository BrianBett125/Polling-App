# Poll lifecycle, editing and results

Where things live: `app/polls/new` (create), `app/polls/[id]` (public page), `app/polls/[id]/edit`,
`app/polls/[id]/export/route.ts`, `lib/actions-poll-admin.ts` (owner actions), `lib/csv.ts`,
`lib/results-live.ts`, `components/LiveRefresh.tsx`.

## Settings

Set when a poll is created, changeable later on the edit page.

| Setting | Values | Notes |
| --- | --- | --- |
| Closing date and time | empty, or a future moment | Picked in the browser's timezone and converted to a UTC instant before it is sent. The server rejects anything that is not an ISO timestamp with `Z` or an offset, and anything not in the future. The database checks again on create with its own clock. |
| Require sign-in to vote | on / off | One vote per account across browsers. Visitors can still open the poll and see results (subject to visibility). |
| Results visibility | `always` / `after_close` | With `after_close`, visitors see "Results will be shown when voting closes." and the numbers are never put in the HTML (`get_poll` returns null counts). The owner always sees them. |

Creating a poll is limited to 10 per account per hour (`withinRateLimit('createPoll', user.id)`). Over the limit
the form shows "Too many attempts. Please wait a few minutes and try again." and nothing is created.

## Closing semantics

A poll is closed when either holds, decided by the database clock:

1. `closed_at` is set (the owner pressed Close voting), or
2. `closes_at` is in the past.

Closed polls show a "Voting closed" banner and no vote form, and `cast_vote` refuses votes (`POLL_CLOSED`).
Open polls with a closing time show "Closes <date>" in the visitor's timezone (`LocalTime`: the server prints an
explicit UTC time, the browser swaps in local time after mount, so server and client markup always match).

Owner toolbar on the poll page: Edit, Close voting / Reopen voting, Export CSV.

- **Close voting** sets `closed_at` to now. Asks for confirmation.
- **Reopen voting** clears `closed_at`. If `closes_at` has already passed it clears that too, otherwise the poll
  would stay closed by time. A closing time still in the future is kept. The toolbar says so when a poll closed by time.
- On the edit page, entering a new future closing time on a poll that closed by time also reopens it. Leaving the
  field empty there means "unchanged", not "remove".

## Editing

Title, description and settings can always be changed. **Options** can be added, removed, edited and reordered
(2 to 20 options, 200 characters each, no duplicates ignoring case) only while the poll has zero votes. Once any vote
exists the page shows them read-only with "Options are locked because voting has started." The database enforces the same
rule (`replace_poll_options` raises `VT008`), so a vote that lands while the form is open produces a clear error
instead of silently losing votes.

Save order: options, then title and description, then settings. Each step is validated in the browser first. If a
later step fails the form says "Earlier changes were saved." and refreshes.

## CSV export

`GET /polls/<id>/export`, owner only. Signed out: 401. Missing poll and someone else's poll: the same 404.

```
Poll,Lunch?
Status,Open
Closes at (UTC),2030-01-02T10:30:00.000Z      <- only when a closing time is set
Total votes,4

Option,Votes,Percent
Pizza,3,75
Tacos,1,25
```

- `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="poll-<slug>.csv"` (ASCII slug of the title).
- UTF-8 byte order mark first, so Excel reads accents, emoji and non-Latin scripts correctly.
- CRLF line endings, RFC 4180 quoting (cells with comma, quote, CR or LF are quoted, quotes doubled).
- Formula injection: a text cell starting with `=`, `+`, `-`, `@`, tab or CR gets a leading single quote.
  Numbers (votes, percent) are never user text and are not touched.
- Percentages are whole numbers that add up to 100 (same largest-remainder rule as the page).

## Live results

`LiveRefresh` calls `router.refresh()` every 8 seconds while the tab is visible. Hidden tab: the timer is cleared. Tab
visible again: refresh immediately, then resume. Closed poll: no timer, no listener. The timing logic is pure
(`startLiveRefresh` in `lib/results-live.ts`) and unit tested with fake timers. A visually hidden `role="status"`
`aria-live="polite"` region announces "Results updated: N votes in total" only when the total changes, never on a tick
that brought nothing new.

## Tests

- `lib/poll-form.test.ts`, `lib/csv.test.ts`, `lib/actions-poll-admin.test.ts`, `lib/results-live.test.ts`,
  `lib/export-route.test.ts`, `lib/actions.test.ts` (createPoll settings and rate limit): `npm test`.
- `tests/db/lifecycle-extra.test.ts`: reopen after a passed closing time, settings updates, owner reads of vote totals
  (`TEST_DATABASE_URL=... npm run test:db`).
