# Difficulty calibration

The game entry point is `puzzleDifficulty(puzzle)` in `logos.js`. It rates an
already-generated puzzle and returns `{ score, level }`, independent of player
progress. Generation and seed identity are unchanged.

The score is:

```
supportSteps + 2.65 * scarcity + 0.87 * maxDiscardRun
```

Scores below 45 are easy, below 72 are medium, and the rest are hard. These
are empirical units, not percentiles or predicted completion times.

## Measurements

The solver starts from the original clues and automatically applies row
single-position and single-candidate deductions after every observation.
For each clue, it evaluates both the full candidate state and a state retaining
only placements. Deductions available in the latter are called anchored;
those needing other symbols' partial candidate sets are candidate-based.
All reductions for one target symbol from one clue form one observation.

The solver prefers anchored observations, then candidate-based observations;
within each category it prefers immediate placements. Ties use a deterministic
random stream. It records:

- `supportSteps`: number of selected candidate-based observations.
- `scarcity`: sum of 1 / available observations at each selected move.
- `maxDiscardRun`: longest consecutive run of discard observations without a
  placement. A discard that triggers automatic row placement ends the run.

Five routes are measured, with seeds `Math.imul(i + 1, 0x9e3779b9)` for
`i = 0..4`. Each metric is averaged before applying the formula. We average
routes rather than take the easiest one. This models the solver's typical
work, not an optimal human solution. Multi-clue insights can bypass much of
that work, so especially high scores need not mean exceptionally hard play.

## Where the constants came from

The initial experiment measured 1,000 version-1 puzzles. Each of the three
metrics was converted to its empirical percentile in that sample (averaging
lower and upper bounds for ties). The mean of those percentiles was the
original composite, with provisional label boundaries at 1/3 and 2/3.
Several deliberate play tests, including blind tests around the boundaries,
supported the broad labels. An extreme-tail puzzle was easier for the player
than its score suggested; we retained three levels rather than adding Expert.

We then fitted a weighted sum to the original composite, avoiding large
percentile tables in the game:

1. Fit three coefficients and an intercept by ordinary least squares on the
   original 1,000 seeds.
2. Divide coefficients by the first coefficient, making its weight 1, and
   round the other two to two decimal places.
3. Choose two integer thresholds jointly to maximize agreement with the
   original labels on those training seeds. Break ties by proximity to the
   least-squares crossings. The intercept is absorbed into the thresholds.
4. Evaluate unchanged weights and thresholds on 10,000 separate seeds.

The validation rank correlation with the original composite was 0.99899, with
97.39% label agreement and no easy-to-hard jumps. Recomputing the percentile
reference from the larger batch gave correlation 0.99903 and 97.47% agreement
with the weighted score. This supports the approximation, not independent
validation of human difficulty. No player times were used to fit the weights.

## Manual play tests

These are five-route raw scores from the current formula, for generator
version 1. Times and impressions are one experienced player's reports, not
controlled speed trials. The player sometimes focused on evaluating difficulty
rather than playing quickly.

| Seed | Score | Current label | Time | Player assessment |
| --- | ---: | --- | --- | --- |
| `98079244` | 20.81 | easy | 1:18 | Easy, smooth progress. |
| `d7f8091b` | 27.90 | easy | 1:40 | Very easy; attention divided. Replay after a mistake about 12 seconds in. |
| `c549b7c4` | 54.75 | medium | 2:43 | Harder than the easy pair; long opening of discards before the first cascade. |
| `dcfeb188` | 61.54 | medium | 2:19 | Similar difficulty to the other medium; satisfying cascade. |
| `93b24744` | 105.82 | hard | ~3:40 | Harder than the mediums, but not exceptional; noticed a helpful shortcut. Mis-click at 3:17 interrupted the run. |
| `e2a689dd` | 129.82 | hard | 9:41 | Legitimately hard; satisfying final cascade. Proved a four-tile run, but inferred its orientation without fully checking it. |
| `35adb143` | 75.61 | hard | 5:22 | Upper medium or lower hard; slow to notice a linchpin deduction midway through. |
| `d49bc27a` | 42.59 | easy | 1:42 | Very easy. |
| `be0e8074` | 75.49 | hard | 7:42 | Hard; combined many clues mentally, without chalk marks. An accidentally correct deduction preceded a justified route by a few moves. |
| `e7e2214f` | 43.52 | easy | 2:14 | Medium, possibly lower medium; looked hard but unfolded nicely after a multi-clue insight. Combined time around a mis-click. |
| `219558b4` | 174.85 | hard | ~5:30 | Initially daunting, then opened up through a structural deduction. Mis-click at 4:59. Less difficult than the extreme score suggested. |
| `1adb6058` | 60.48 | medium | Not reported | Not difficult, but long-ish; easy side of medium felt accurate. |

The four tests from `35adb143` through `e7e2214f` were blind. Their original
predictions used 50-route percentile scores: medium, easy, hard, and medium,
respectively. The current five-route labels differ for `35adb143` and
`e7e2214f`; this is route sensitivity, not a change caused by the weighted
approximation. Other initial candidates were also rechecked with 50 routes.

`1adb6058` was selected because its one-route percentile score labeled it
easy, while averaging five routes labeled it medium. The player's assessment
supported the latter. The extreme-tail example `219558b4` shows why these
scores should remain broad guidance rather than precise predictions.

## Future calibration

The statistical samples and fitting scripts were exploratory and are not
retained. A new sample can be generated and measured with `measureDifficulty()`
in `logos.js`, then fitted using the method above. The original sample RNG
seeds were hexadecimal `20260924` (1,000 puzzles) and `20260925` (10,000 puzzles),
using `Math.floor(seedRandomOutput * 0x100000000)` for each puzzle seed.
There is no need to preserve those exact samples: a fresh representative
sample should yield a similar ordering, though not identical coefficients.
The manual examples above preserve the observations that cannot simply be
regenerated by running the solver again.

## Other findings from the experiments

- On 24 ordinary recorded wins, five-route composite/time rank correlation
  was 0.589; discard count alone was 0.607. The sample was too small to
  establish which was better. Ten likely imported top scores and deliberate
  play tests were separated from those ordinary wins.
- On 1,000 seeds, one-route versus five-route rank correlation was 0.964;
  16% changed adjacent labels under the percentile formula. Five versus
  50 routes correlated at 0.991. Five routes reduce sensitivity to move order.
- A warmed Deno 2.5.6 benchmark on an i9-9880H averaged 1.50 ms for generation
  and 5.32 ms for five-route diagnostic measurement. This used a fake DOM,
  excluded browser layout, and predates removal of diagnostic bookkeeping.
  It is not a mobile or browser latency guarantee.
