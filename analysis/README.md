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

Each puzzle gets a stanza headed by its seed, numeric score, and label,
such as `Seed 3f1ad099 — 52.63 (medium)`, followed by ten-route averages of
the placement-first scoring metrics. Blank lines separate puzzles.
The score is excess discards + 5 × scarcity, averaged over ten routes,
with Easy below 47 and Medium below 70. This default output does not reveal
clues or moves.
See [DIFFICULTY.md](DIFFICULTY.md) for the methodology.

For extreme puzzles, use `--extreme` or a URL containing the `extreme` flag:

```sh
./analysis/puzzle 0e2b42be --extreme
./analysis/puzzle 'file:///home/peff/work/logos/index.html#seed=0e2b42be&extreme'
```

These report the original extreme puzzle's numeric score and skull count,
such as `Seed 0e2b42be — 51.99 (1 skull)`, instead of a normal difficulty
score, followed by the mean bottleneck count. Seeds without an extreme variant are reported
as such, and processing continues with the remaining inputs.
`--extreme` applies to every input; URL flags apply only to their own input.
Snapshots automatically select extreme mode and restore any revealed clues;
the difficulty rating still describes the original puzzle without assistance.

The extreme score averages ten deterministic solving routes. Each route sums
the candidate eliminations in its failed assumptions, raised individually to
the power 1.5. Inner lemmas contribute their own scores, added to their parent's
score rather than pooled before exponentiation. One skull represents 1,500
points, rounded up, with no cap. Maximum assumption depth is reported separately
and does not multiply the score. These ratings use Extreme difficulty version 4;
older cached ratings are recomputed, including formerly infinite ratings.

At each real-board stall, the rating first combines pairs of clues, enforcing
both clues and row uniqueness. These deductions are free; a puzzle solved
without assumptions has zero score and displays a skull followed by `× 0`.
Analysis reports the mean number of useful two-clue deductions separately.
Hypothetical branches still use ordinary propagation. Seed generation and
hint explanations retain their existing solver, so a zero-skull puzzle's
hint walkthrough may still explain a move through a chalk contradiction.

Single-level contradictions retain their existing selection rules. When they
cannot advance the board, the solver tries nested contradictions, currently
limited to two assumption levels. It explores distinct outer boards ranked
by determined tiles, then remaining candidates, until it proves a contradiction
or exhausts the shared trial budget. There is no board-count cutoff: the most
productive boards can all come from correct guesses. Inner searches prefer guesses
with fewer symbol positions or slot candidates. Successful guessed solutions
do not count as deductions. Recursive calls share the route's 10,000-trial
budget. Exhausting that budget leaves the rating unavailable; exhausting the
bounded search without progress still displays infinite skulls. That denotes a
solver limitation, not a proof that deeper reasoning cannot solve the puzzle.

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

This uses the game's expanded hint walkthrough, including explicit explanations
of placements that normal play makes automatically. It is not a trace of a
randomized difficulty-scoring route, and its step count should not be compared
directly with the difficulty metrics.

When ordinary deductions run out, the walkthrough inserts numbered lemmas
with substeps for the chalk assumption, deductions, contradiction, and proven
discard. If single-level lemmas cannot advance the board, the same bounded
nested search supplies recursive certificates for the walkthrough. Inner steps
use numbers such as `30.46.1`; rejecting the inner guess restores its enclosing
chalk board, and only the outer rejection changes the real board. It then
resumes the main proof. If the bounded search cannot prove a lemma, it prints
the stalled board instead of claiming a complete solution.

The tools reject unsupported generator versions and snapshots inconsistent
with their seed. They do not change the game, run history, or stored settings.

## Experimental extreme costs

For experimental extreme bottleneck costs, run from the repository root:

```sh
deno run --allow-read=logos.js analysis/extreme-cost.js 0 d40791eb ac185eca 59
```

This writes one JSON record per seed, with ten deterministic routes and their
arithmetic means. Routes vary clue order and trial tie-breaking. Each selected
failed assumption records candidate eliminations and propagation passes before
the solver reports a contradiction, plus the progress after rejecting it.
Elimination counts exclude making the assumption itself. They measure solver
work, not narrated proof steps or the shortest possible argument; a propagation
sweep can continue after a clue has already become impossible.

The score is the sum of each lemma's eliminations raised to 1.5, averaged
over ten routes. Nested costs appear in `children`; their scores are added
recursively. Parent eliminations exclude hypothetical inner work but include
each proved inner discard once. Progress after rejecting the outer assumption
is excluded as before. This gives longer branches more weight. The output also
keeps recursive unweighted elimination totals and maximum assumption depth for
comparison.
Incomplete routes suppress the averages. The game maps this score to
`ceil(score / 1500)` skulls, without a cap. Reported time covers all ten rating
routes, excluding puzzle generation.

## Experimental two-clue deductions

Compare the existing extreme rating with a pass that combines pairs of clues:

```sh
deno run --allow-read=logos.js analysis/two-clue-cost.js 1000 > /tmp/two-clue.jsonl
deno run analysis/two-clue-summary.js < /tmp/two-clue.jsonl
deno run analysis/two-clue-summary.js --csv < /tmp/two-clue.jsonl > /tmp/two-clue.csv
```

The count selects the first 1,000 seeds with an extreme variant, scanning
upward from hexadecimal seed zero. An optional second argument changes that
starting seed. To analyze one particular puzzle:

```sh
deno run --allow-read=logos.js analysis/two-clue-cost.js --seed a56f91ef
```

The tool compares legacy rating behavior with the integrated two-clue pass.
The current game rating uses the latter, with zero cost for pair deductions.
It tries pairs whenever ordinary propagation stalls on the real board,
before searching for a contradiction.
Each pair enumerates compatible assignments to its symbols, enforcing both
clues, agreement on shared symbols, and distinct columns for different
symbols in the same row. Pairs can interact through row uniqueness even
without a shared symbol. Unsupported positions are removed; the first useful
pair counts as one deduction, and ordinary propagation resumes. Pair order
varies across the same ten deterministic routes used by the baseline.

Hypothetical branches still use ordinary propagation. The experiment therefore
measures the benefit of applying pair deductions before assumptions, rather
than strengthening every part of the search. It retains the existing
contradiction selection policy, work accounting, and trial budget. Stronger
real-board deductions can change the selected route, so the heuristic score
is not guaranteed to decrease for every puzzle.

Raw output records contradiction scores and pair-deduction counts separately.
The summary compares pair costs of 0, 10, 50, and 100 points; these are
sensitivity checks, not calibrated difficulty weights. Score and skull
comparisons use puzzles completed on all routes by both methods. With zero
pair cost, a puzzle solved entirely by pairs has score zero and zero skulls;
that is also the current game rating behavior. Timings
cover all ten routes, with pair compilation included in the experimental
summary, but exclude puzzle generation and extreme clue pruning.

Check tuple enumeration, pair support, baseline agreement, and the recorded
puzzle's one-deduction solution with the standard test suite:

```sh
./test deno
```

The initial 1,000-puzzle run examined 1,227
consecutive seeds (`00000000` through `000004ca`); both methods completed
all ten routes for every puzzle. 147 puzzles needed no assumptions with
the pair pass. These results use the original generation version 1 and
extreme rating version 2 as the baseline. Version 3 integrates the zero-cost
pair pass; the other experimental deduction weights are not used in the game.
