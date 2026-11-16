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

These report the original extreme puzzle's effort score and skull count,
such as `Seed ac185eca — 125.99 (3 skulls)`, followed by solving metrics.
Seeds without an extreme variant are reported as such, and processing continues
with the remaining inputs. Reports include scarcity, excess discards, and the
score split between real-board deductions and used suppositions.
`--extreme` applies to every input; URL flags apply only to their own input.
Snapshots automatically select extreme mode and restore any revealed clues;
the difficulty rating still describes the original puzzle without assistance.

The Extreme score uses the ordinary formula, excess discards + 5 × scarcity,
averaged over ten deterministic routes. It includes ordinary real-board work
and the work inside selected suppositions, including nested proofs. Rolled-back
work still counts; discarded search attempts do not. There is no extra penalty
for making a supposition or for its depth. Each skull represents 50 effort
points, rounded up, with no cap. These ratings use Extreme difficulty version 6;
older cached ratings are lazily recomputed, including formerly unavailable and
zero-skull ratings. Extreme mode and puzzle generation are unchanged.

At each real-board stall, the rating first combines pairs of clues, enforcing
both clues and row uniqueness. These deductions are free, but the ordinary work
around them still counts: puzzles needing no assumptions now receive an effort
rating too. Analysis reports useful two-clue deductions and maximum assumption
depth separately. Hypothetical branches still use ordinary propagation. Hint
explanations retain their existing solver, so a puzzle needing no assumptions
in its rating may still receive a chalk contradiction in its hint walkthrough.

Single-level contradictions retain their existing selection rules. When they
cannot advance the board, the solver tries nested contradictions, currently
limited to two assumption levels. It explores distinct outer boards ranked
by determined tiles, then remaining candidates, until it proves a contradiction
or exhausts the shared trial budget. There is no board-count cutoff: the most
productive boards can all come from correct guesses. Inner searches prefer guesses
with fewer symbol positions or slot candidates. Successful guessed solutions
do not count as deductions. Recursive calls share the rating route's 20,000-trial
budget. At the cutoff, the route uses any contradiction already found and
continues deductions that need no trials. If some routes remain unfinished,
the rating averages the completed routes; if none finish, it averages their
partial scores. Analysis marks these ratings as estimates and reports how
many routes completed. They can underestimate difficulty. Exhausting the
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

The legacy `score` is the sum of each lemma's eliminations raised to 1.5, averaged
over ten routes. Nested costs appear in `children`; their scores are added
recursively. Parent eliminations exclude hypothetical inner work but include
each proved inner discard once. Progress after rejecting the outer assumption
is excluded as before. This gives longer branches more weight. The output also
keeps recursive unweighted elimination totals and maximum assumption depth for
comparison.
This experimental tool reports null averages if any route is incomplete;
the game instead uses the estimate fallback described above. The former
rating mapped this legacy score to `ceil(score / 1500)` skulls; the current
game uses `ceil(effort / 50)` instead. Reported time covers all ten rating
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
that was the game rating behavior before version 6. Timings
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

## Effort replay and legacy comparisons

The `extreme-cost.js` tool also includes each route's `effort` replay, with ten-route means
under `averages.effort`. Its score is the ordinary formula, excess discards +
5 × scarcity, accumulated across the real board and every selected supposition.
`real` and `hypothetical` split the totals; `proofs` records each supposition's
own metrics and nested `children`. A proof's own score excludes its children,
while the hypothetical total includes every level once. Search attempts which
were not selected contribute nothing. The replay preserves the current
rating solver's selection policy, rather than the hint solver's separate
progress-per-explanation-step policy.

Replay uses the normal placement-first observation model, including free row
cascades and three free discards per stretch. Each assumption starts a fresh
stretch; its parent resumes its saved stretch after rollback. The proved
rejection counts as a reduction in the parent, but adds no scarcity charge:
its proof already paid for establishing it. Contradictions end a branch, with
an immediately available empty-domain observation preferred over other moves.
Two-clue deductions remain free and restricted to the real board, matching the
existing rating policy; they reset a discard stretch if they unlock placements.
Ordinary deductions before and after these deductions still accrue effort.

This is the current in-game score, including ordinary solving work for puzzles
that need no suppositions. Incomplete routes retain partial metrics, but this
tool reports null `averages` unless all routes completed. The score measures
following the selected reasoning, not discovering which suppositions to try.

To sample Extreme puzzles and compare the legacy numeric rating with current effort:

```sh
deno run --allow-read=logos.js analysis/extreme-comparison.js 150 > /tmp/extreme-comparison.csv
gnuplot -c analysis/extreme-comparison.gnuplot /tmp/extreme-comparison.csv /tmp/extreme-comparison.png
```

The sampler uses a fixed xorshift32 stream starting at `0x731b9a2d`, retaining
seeds with an extreme variant until the requested sample size is reached. Each
puzzle uses ten routes and the usual 20,000-trial budget. It appends `ac185eca`
and `aac80a9c` as separately labeled references, excluded from the random sample.
CSV rows retain incomplete/stalled statuses with no effort value. `old_score`
and `skulls` retain the legacy version-5 values for these comparisons;
`effort` is the current score. The exporters request `compareLegacy` to obtain
both formulas from the same selected routes. The plot
shows a sample close-up and a full-scale view including both references; its
axes are sized for the default 150-puzzle sample.

## Extreme ratings versus recorded time

Export the browser history with
`copy(JSON.stringify((await accessRunHistory(null, true)).runs, null, 2))`
and save the JSON as `analysis/scores`. Then run:

```sh
deno run --allow-read=logos.js,analysis/scores analysis/extreme-times.js analysis/scores > /tmp/extreme-times.csv
python3 analysis/extreme-times-summary.py /tmp/extreme-times.csv
gnuplot -c analysis/extreme-times.gnuplot /tmp/extreme-times.csv /tmp/extreme-times.png
```

The CSV preserves every Extreme run with an inclusion flag and exclusion
reason. Analysis uses the earliest recorded timed solo win for each supported
seed, excluding losses, untimed completions, and later wins. It does not impose
a time cutoff or remove puzzles whose ratings disagree with their times.
Both ratings are recomputed with the current ten-route, 20,000-trial settings;
partial ratings are excluded. Times are active play minutes, excluding pauses.
`prior_runs` counts earlier recorded Extreme runs on that seed, including losses
and untimed completions: earliest recorded timed win need not mean first exposure.

The summary reports Pearson linear and Spearman rank correlations, including
sensitivity checks without the 80-minute puzzle, without earlier recorded
attempts, and for wins under 15 minutes. These are descriptive comparisons on
completed games, not validation on an independent test set. The plot includes
full-range panels and explicitly cropped detail panels; its title and axes are
currently sized for the 67 eligible puzzles in the November 16 export.

For effort distributions, compare a larger random sample with the eligible
played runs (the two reference puzzles are excluded from the random sample):

```sh
deno run --allow-read=logos.js analysis/extreme-comparison.js 1000 > /tmp/effort-sample.csv
python3 analysis/effort-distribution.py /tmp/effort-sample.csv /tmp/extreme-times.csv /tmp/effort-distribution
gnuplot -c analysis/effort-distribution.gnuplot /tmp/effort-distribution.dat /tmp/effort-distribution.png 1000 67
```

The summary JSON reports quantiles, score-band counts, and completion status.
The chart compares percentages in categorical score bands of unequal numeric
widths, not histogram density. Pass the actual complete sample sizes as the
last two plotting arguments. Played puzzles are a separate observational set;
do not use their upper-tail frequency to infer random-generation frequency.

## Supposition penalties and skull calibration

Both comparison CSV exporters now append `suppositions`: the mean number of
used assumptions across ten routes, counting every nested assumption once.
This is distinct from the existing outer bottleneck count. The baseline effort
score is unchanged. Regenerate the CSVs before running:

```sh
python3 analysis/supposition-penalties.py /tmp/effort-sample.csv /tmp/extreme-times.csv /tmp/penalties
gnuplot -c analysis/supposition-penalties.gnuplot /tmp/penalties.dat /tmp/penalties.png
```

The experiment evaluates `effort + penalty * suppositions` for penalties 0–40.
The baseline presentation is the live game's `ceil(effort / 50)`. The recalibrated divisor is
`50 * mean(adjusted effort) / mean(original effort)` over the random sample.
This preserves mean continuous skull units, not exactly the rounded mean skull
count. A positive divisor rescaling never changes numeric ordering, but may
lower skull counts for deduction-only puzzles whose scores did not increase.

The JSON reports skull-count changes, the penalty's share of adjusted effort,
and strict ordering reversals among all pairs with unequal baseline scores.
It also reports Pearson and Spearman correlations with recorded times, with
and without the 80-minute puzzle. These correlations are secondary descriptive
checks, not an objective used to select the penalty or divisor. Reference
puzzles are excluded from random-sample calibration. The plot title currently
assumes 1,000 random puzzles and 67 eligible played puzzles.
