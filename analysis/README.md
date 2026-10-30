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

The output includes the label, numeric score, and ten-route averages of the
placement-first scoring metrics. The score is excess discards + 5 × scarcity,
with Easy below 47 and Medium below 70. This default output does not reveal
clues or moves.
See [DIFFICULTY.md](DIFFICULTY.md) for the methodology.

For extreme puzzles, use `--extreme` or a URL containing the `extreme` flag:

```sh
./analysis/puzzle 0e2b42be --extreme
./analysis/puzzle 'file:///home/peff/work/logos/index.html#seed=0e2b42be&extreme'
```

These report the original extreme puzzle's skull count and score instead
of a normal difficulty score. Seeds without an extreme variant are reported
as such, and processing continues with the remaining inputs.
`--extreme` applies to every input; URL flags apply only to their own input.
Snapshots automatically select extreme mode and restore any revealed clues;
the difficulty rating still describes the original puzzle without assistance.

The extreme score averages ten deterministic solving routes. Each route sums
the candidate eliminations in its failed assumptions, raised individually to
the power 1.5. One skull represents 1,500 points, rounded up, with no cap.
If a route cannot finish within the search limit, the rating is unavailable.

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
discard. It then resumes the main proof. If no single-assumption lemma can be
proved, it prints the stalled board instead of claiming a complete solution.

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

The score is the sum of each bottleneck's eliminations raised to 1.5, averaged
over ten routes. This gives longer branches more weight. The output also keeps
unweighted elimination totals for comparison.
Incomplete routes suppress the averages. The game maps this score to
`ceil(score / 1500)` skulls, without a cap. Reported time covers all ten rating
routes, excluding puzzle generation.
