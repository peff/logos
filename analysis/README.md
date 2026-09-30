# Puzzle analysis

These command-line tools use Deno, like the test suite. Run them from any
working directory; no browser or server is required. They load the generator,
scorer, and deduction functions from the game's `logos.js`.

## Difficulty

```sh
./analysis/puzzle 3f1ad099
./analysis/puzzle b73aa28a ec29e0c8
./analysis/puzzle 'file:///home/peff/work/logos/index.html#seed=3f1ad099'
```

Multiple seeds or URLs produce separate reports in command-line order;
`--trace` applies to each puzzle. The stdin `--position` mode still accepts
one snapshot and cannot be combined with seed arguments.

The output includes the label, numeric score, and five-route averages of the
placement-first scoring metrics. The score is excess discards + 5 × scarcity,
with Easy below 47 and Medium below 70. The old composite shown for comparison
uses its original anchored-first routes and 45/80 cutoffs. This default output does not reveal clues or moves.
See [DIFFICULTY.md](DIFFICULTY.md) for the methodology.

## A position where you wanted help

In Options, click the difficulty readout three times to unlock Puzzle analysis
(only one click is needed afterward). Choose **Copy position**, then run:

```sh
./analysis/puzzle --position
```

Paste the snapshot, press Enter, then Ctrl-D to finish input. You can also pipe
JSON into the command or redirect a saved snapshot:

```sh
./analysis/puzzle --position < position.json
```

This prints the whole puzzle's difficulty, a board-shaped table of candidates
for each slot, all available clue observations, and the next suggested deduction.
Placed tiles appear in brackets. An observation groups reductions to one
symbol from one clue; multiple clues can offer the same reduction. Automatic row placements are separate from
that count. Chalk marks do not affect the deductions, just as in the game's
hint interface. Printed column and clue numbers start at one.

## Walkthroughs

Add `--trace` to either mode to reveal successive hints through the solution:

```sh
./analysis/puzzle 3f1ad099 --trace
./analysis/puzzle --position --trace < position.json
```

This follows the game's hint ordering, including explicit explanations of
placements that normal play makes automatically. It is not a trace of a
randomized difficulty-scoring route, and its step count should not be compared
directly with the difficulty metrics.

The tools reject unsupported generator versions and snapshots inconsistent
with their seed. They do not change the game, run history, or stored settings.

## Dependency rounds (experimental)

```sh
./analysis/puzzle 555dd3ae b73aa28a ec29e0c8 --rounds
./analysis/puzzle --position --rounds < position.json
```

This separate solver applies each clue to its own copy of the frozen board,
then intersects all the results. Row deductions also read only the frozen
board: known symbols exclude their columns from other symbols, and columns
with a single candidate determine that symbol. Newly determined tiles cannot
influence other deductions until the next round. It does not repeatedly
propagate automatic placements within a round.

Round zero contains givens (or the supplied position), without additional
row propagation. A tile is counted as determined when its candidate domain
first contains one column; the output lists its symbol and column in that
round. The summary includes rounds to solve and the longest consecutive run
of rounds without a new placement. Per-round counts are individual candidate
bits removed, including row propagation, not the grouped observations used
by the difficulty scorer. Rounds with placements do not count toward the
placement-free run.

This measures layers of existing clue reasoning, not atomic logical steps.
The current clue constraints compute supported positions for a pair or a
whole triple in one invocation. Those deductions remain one round; only
propagation between clues and rows is delayed. Results are independent of
clue order and use no random route selection. `--rounds` does not change
normal difficulty ratings and may reveal placements. With `--position`, its
round counts describe the remaining work; the difficulty rating above them
still describes the original puzzle.

Each round also reports its breadth: the number of distinct clue observations
available on the frozen board. An observation is the full reduction to one
symbol from one clue, without the scorer's anchored/candidate tier split.
Identical reductions from different clues count once; different, overlapping
reductions count separately. This is an opportunity count, not the minimum
work needed to advance. Candidate-bit removal counts remain separate and
include automatic row consequences.

Experimental **round scarcity** sums `1 / observations` over rounds without
a new placement. Rounds with no clue observations contain only automatic row
deductions and contribute zero. Their count is reported separately. In a mixed
round, a clue reduction can overlap an automatic row deduction; it still counts
as an available clue observation. Nothing is propagated early to compute these
counts, so the original round boundaries and placement timing are unchanged.

The experimental composite is `rounds + 5.5 * roundScarcity`, returned as
`score` by `measureRounds()` and printed by `--rounds`. The fixed weight
approximately balances the terms' interquartile ranges in the 1,000-seed
sample documented in DIFFICULTY.md. It was not fitted to player assessments.
Provisional levels use the empirical thirds of integer seeds 1–1000:
Easy <16.916666666666668, Medium <23.914484126984128, otherwise Hard.
Comparisons use unrounded scores, even though displayed scores have two decimal
places. `measureRounds()` also returns this `level`. With `--position`, the
score and label describe remaining work, not the original puzzle's difficulty.
These experimental labels do not change the game's ratings.

The implementation is in `rounds.js`; its tests run through `./test`.

## Bounded shortest-path search (experimental)

```sh
./analysis/puzzle 555dd3ae --search=10000
./analysis/puzzle --position --search=10000 < position.json
```

The budget is the maximum number of state expansions per puzzle. The search
starts with the best completed path from five historical anchored-first routes, then
uses depth-first branch-and-bound with a memo table of candidate boards and
the cheapest known arrival at each board. A shorter arrival reopens the state
and consumes another expansion. Already-seen states reached at equal or higher
cost are skipped. The search stops immediately when it needs another expansion
beyond the budget; it retains a completed path even if it has proved nothing.
The budget bounds expansions and stored states, not elapsed time or bytes.

Each edge costs one observation from `difficultyOpportunities()`: reductions
for one symbol from one clue. Automatic row deductions are free and run to
completion after each edge, including at the initial position. Move ordering
prefers anchored observations, then placements, like the historical scorer, but
the search also explores the other available moves. This retains its distinction
between an anchored reduction and a later candidate-based reduction; it does
not add combined-clue shortcuts or arbitrary partial discards.

Output distinguishes a proven shortest path within that move model from the
best completed path found before the budget ran out. The elapsed time includes
the five starting routes, but excludes puzzle generation and the ordinary
metric report. The returned `path` in `search.js` contains replayable reductions;
the CLI prints only the summary. This is an analysis experiment, not a new
rating or an optimality claim about human play.
