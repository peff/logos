# Puzzle difficulty

`puzzleDifficulty(puzzle)` in `logos.js` returns `{ score, level }` for an
already-generated puzzle. It measures the original clues, independent of the
player's progress. Generation, seed identity, and generator version 1 are
unchanged.

## Score and labels

```
score = excessDiscards + 5 * scarcity
```

| Score | Label |
| --- | --- |
| Below 47 | Easy |
| 47 to below 70 | Medium |
| 70 or above | Hard |

Labels use unrounded scores. These are broad estimates of solver effort,
not predictions of completion time. Human multi-clue insights can bypass a
long solver route; overlooking a useful clue can make a low-scoring puzzle
feel difficult.

## What is measured

An observation is the full reduction of one symbol's possible columns by
one clue. Different clues offering the same reduction count as separate
opportunities. Automatic row deductions are free: a symbol with only one
position is placed, and a column with only one candidate determines that
symbol. These deductions run to completion initially and after every move.

For each available observation, the scorer tries the move on a copy of the
board and follows its automatic row deductions. It chooses the move that
determines the most new tiles. This includes discards that open placement
cascades. It does not look ahead through further clues. Ties are randomized;
there is no preference for anchored over candidate-based deductions.

Each route records:

- **Excess discards:** sum of `max(0, stretchLength - 3)` over consecutive
  discard stretches. Each stretch gets three free discards. A discard which
  triggers automatic placements counts at the end of its stretch, then resets
  the stretch. Direct placements also reset it.
- **Scarcity:** sum of `1 / availableObservations` before every selected move,
  including placements. Narrow choices accumulate more scarcity.

`measureDifficulty(puzzle, routes = 5)` averages each metric over deterministic
routes seeded with `Math.imul(i + 1, 0x9e3779b9)`, for `i = 0..routes-1`.
Game ratings always use five routes. They are averages, not the best route or
an optimal solution, and do not consume the generator's random stream.

## Calibration and observations

The weight approximately balances the two terms' sampled interquartile
spreads. We chose 5 for simplicity after checking nearby weights. Empirical
thirds provided starting cutoffs; manual play informed the final 47/70 pair.
In the 1,000-seed calibration sample these give 343 Easy, 346 Medium, and
311 Hard. Equal thirds are a starting convention, not a claim that human
solve difficulty naturally splits that way.

[assessments.csv](assessments.csv) preserves manually reported times and
impressions, including replays, uncertain assessments, and the latest blind
tests. These are Peff's reports for generator version 1, not independent or
controlled trials. Missing times are blank; approximate times retain `~`.
Repeated seeds may describe replays or clarifications. Some ratings were
visible during play, so do not assume an entry was blind unless stated.
The file stores observations rather than computed scores: use
`analysis/puzzle SEED...` to recalculate the current baseline.

Earlier scorers, rounds, search experiments, and detailed comparisons remain
in Git history. A fresh statistical sample can be generated whenever needed;
the manually recorded impressions are the part that cannot be regenerated.
Existing cached Chronicle labels are not migrated by this cleanup.

## Analysis and hints

See [README.md](README.md) for command-line reports, stdin position snapshots,
walkthroughs, and the hidden in-game analysis dialog. Snapshots store
`domains[row][symbol]` as possible-column bitmasks and `placements[row]` as
placed-symbol bitmasks. Indices start at zero; the low bit is the leftmost
column or first symbol. Chalk marks are separate and do not affect reasoning.

Hints also favor immediate placement cascades, but enumerate explainable
steps, which may split a scorer observation. Ties retain anchored/placement
priorities and stable clue order. Their walkthrough length is therefore not
one of the difficulty metrics. Mistake proofs keep their own ordering:
finding a short explanation of a particular error differs from solving the
whole board.

Feedback uses rating version `placement-composite-1` and samples 10% of
eligible completions, subject to cooldowns and player preferences. Historical
comparison fields remain readable on the server, but new reports contain
only the current label.
