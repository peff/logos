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
