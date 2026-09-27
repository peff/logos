# Difficulty calibration

The game entry point is `puzzleDifficulty(puzzle)` in `logos.js`. It rates an
already-generated puzzle and returns `{ level }`, independent of player
progress. Generation and seed identity are unchanged.

The current rule uses five-route averages:

| | Scarcity <10 | Scarcity ≥10 |
| --- | --- | --- |
| Longest discard stretch <13 | Easy | Medium |
| Longest discard stretch ≥13 | Medium | Hard |

Both low means Easy, both high means Hard, and mixed means Medium.

The original weighted score is retained in `compositeDifficultyRating()` for
comparison, returning `{ score, level }`:

```
supportSteps + 2.65 * scarcity + 0.87 * maxDiscardRun
```

Its cutoffs remain 45 and 80. The analysis dialog and command-line inspector
show both ratings. There is no single numeric score for the new rule.
Existing cached Chronicle labels are not migrated; new and backfilled ratings
use the new rule.

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
`i = 0..4`. Each metric is averaged before applying the rating rule. We average
routes rather than take the easiest one. This models the solver's typical
work, not an optimal human solution. Multi-clue insights can bypass much of
that work, so especially high scores need not mean exceptionally hard play.

## Where the original composite constants came from

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

These are five-route raw scores from the original composite, for generator
version 1. Times and impressions are one experienced player's reports, not
controlled speed trials. The player sometimes focused on evaluating difficulty
rather than playing quickly.

| Seed | Score | Composite label | Time | Player assessment |
| --- | ---: | --- | --- | --- |
| `98079244` | 20.81 | easy | 1:18 | Easy, smooth progress. |
| `d7f8091b` | 27.90 | easy | 1:40 | Very easy; attention divided. Replay after a mistake about 12 seconds in. |
| `c549b7c4` | 54.75 | medium | 2:43 | Harder than the easy pair; long opening of discards before the first cascade. |
| `dcfeb188` | 61.54 | medium | 2:19 | Similar difficulty to the other medium; satisfying cascade. |
| `93b24744` | 105.82 | hard | ~3:40 | Harder than the mediums, but not exceptional; noticed a helpful shortcut. Mis-click at 3:17 interrupted the run. |
| `e2a689dd` | 129.82 | hard | 9:41 | Legitimately hard; satisfying final cascade. Proved a four-tile run, but inferred its orientation without fully checking it. |
| `35adb143` | 75.61 | medium | 5:22 | Upper medium or lower hard; slow to notice a linchpin deduction midway through. |
| `d49bc27a` | 42.59 | easy | 1:42 | Very easy. |
| `be0e8074` | 75.49 | medium | 7:42 | Hard; combined many clues mentally, without chalk marks. An accidentally correct deduction preceded a justified route by a few moves. |
| `e7e2214f` | 43.52 | easy | 2:14 | Medium, possibly lower medium; looked hard but unfolded nicely after a multi-clue insight. Combined time around a mis-click. |
| `219558b4` | 174.85 | hard | ~5:30 | Initially daunting, then opened up through a structural deduction. Mis-click at 4:59. Less difficult than the extreme score suggested. |
| `1adb6058` | 60.48 | medium | Not reported | Not difficult, but long-ish; easy side of medium felt accurate. |

The four tests from `35adb143` through `e7e2214f` were blind. Their original
predictions used 50-route percentile scores: medium, easy, hard, and medium,
respectively. With the original Hard cutoff of 72, the five-route labels differed for
`35adb143` and `e7e2214f`; this was route sensitivity, not a change caused
by the weighted approximation. Raising the cutoff to 80 restores Medium
for `35adb143`. Other initial candidates were also rechecked with 50 routes.

`1adb6058` was selected because its one-route percentile score labeled it
easy, while averaging five routes labeled it medium. The player's assessment
supported the latter. The extreme-tail example `219558b4` shows why these
scores should remain broad guidance rather than precise predictions.

## Boundary adjustment after further play

On September 25, 2026, we raised the Medium/Hard boundary from 72 to 80,
leaving the Easy boundary and score formula unchanged. Recent play suggested
that the lower end of Hard more often felt Medium. This is a modest empirical
adjustment, not evidence that a few score points reliably predict differences
in human difficulty. The statistical validation above used the original 72
cutoff. Previously cached Chronicle labels are not migrated.

| Seed | Score | Composite label | Time | Player assessment |
| --- | ---: | --- | --- | --- |
| `e581b64b` | 80.66 | hard | 1:59 | Felt Medium; probably assumed the correct orientation of die-4, 1, 3 at the start. Accepted as easy Hard, with the lucky opening making the time inconclusive. |
| `12357692` | 89.27 | hard | Not reported | Felt Medium. |
| `64467f3d` | 77.58 | medium | 2:47 | Solidly Medium. |
| `644f7f3d` | 149.56 | hard | 6:11 | Hard; substantial chipping away and multi-clue deductions, without a major shortcut. |
| `be0e8074` | 75.49 | medium | 7:11 replay | Consistent with the original 7:42. Easy Hard or hard Medium both seemed defensible; repeatedly overlooked a useful discard. Replay was not blind. |
| `154a1aae` | 78.33 | medium | 3:07 | High Medium / low Hard; nontrivial but not especially hard. |
| `6ffbd6db` | 74.18 | medium | 1:59 | Medium; early placements followed by a discard stretch. |
| `d8574052` | 83.80 | hard | 4:29 | Felt harder than the previous two. |

The last three were fresh seeds selected around the proposed boundary and
presented in shuffled order with scores withheld. They were not fully blind:
the Options seed preview exposed the existing label (explicitly noticed for
`154a1aae`). Their score ordering matched the reported experience, but the
sample is too small to infer fine-grained accuracy. The replay of `be0e8074`
also illustrates the unavoidable overlap between the broad labels.

## Discard-stretch and scarcity rule

On September 27, 2026, we replaced the composite level with the 13/10 rule.
The motivation was to distinguish sustained discarding from difficulty finding
progress: short stretches indicate Easy, while scarcity separates Medium and
Hard once the puzzle requires more discarding. Scarcity is still the total
reciprocal opportunity count per route, averaged over five routes, not a
per-observation mean. An experiment using the latter did not fit the earlier
manual examples better.

Two shuffled play sets tested the rule. The first used a provisional stretch
cutoff of 12; we raised it to 13 before the second set. Predictions were withheld
until each set was complete, though the existing in-game label was visible if
the player opened Options (explicitly seen for `82890831`). These small,
deliberately selected samples support plausibility, not measured accuracy.

The table uses cutoffs 13/10 throughout; the later short-but-scarce adjustment
does not change any of these examples:

| Seed | Time | Composite | New rule | Stretch | Scarcity | Player assessment |
| --- | ---: | --- | --- | ---: | ---: | --- |
| `50e8c8d9` | 3:28 | medium | hard | 26.6 | 10.56 | Huge opening discard chain; never really stuck. Lower Hard later considered defensible. |
| `403c07ef` | 2:13 | easy | easy | 12.4 | 6.02 | Pretty easy; overlooked a useful connection. A boundary case. |
| `82890831` | 6:58 | hard | hard | 41.6 | 21.07 | Clearly Hard; tight opening bottleneck, then a cascade. |
| `2068ddf1` | 1:13 | easy | easy | 11.2 | 6.01 | Super easy. |
| `dccd2c9b` | 3:19 | medium | medium | 30.0 | 7.65 | Upper Medium or lower Hard; some opening bottleneck and work after the cascade. |
| `67d6cd2b` | 0:56 | easy | easy | 5.0 | 4.04 | Emphatically Easy; almost no discards. |
| `0a649ccc` | 3:35 | medium | medium | 27.0 | 9.32 | Opening bottleneck; possibly missed connections around square. |
| `02b839f1` | 7:46 | medium | hard | 19.8 | 12.54 | Definitively Hard; struggled to find useful discards. |
| `0e9f4c26` | 3:08 | medium | easy | 12.4 | 7.39 | Harder than expected; replay suggested Easy was defensible after spotting an overlooked clue. |
| `4e233909` | 3:50 | medium | hard | 24.2 | 13.25 | Tough opening bottleneck; Hard felt defensible. |
| `0a568040` | 3:48 | easy | medium | 15.8 | 6.88 | Easy opening, substantial mid-puzzle bottleneck; Medium felt plausible. |
| `b91f28c7` | 2:59 | hard | medium | 36.6 | 9.66 | Moderate bottleneck; Medium felt plausible. |

After these sets, `3772d85c` also felt Medium. Its stretch is exactly 13.0
and scarcity is 6.55, making it Medium under the new rule; the composite
called it Easy (42.66). No completion time was reported.

A fresh sample of 10,000 distinct seeds (sample RNG seed `260927c3`, five
routes each) yielded:

| Level | Composite | New rule |
| --- | ---: | ---: |
| Easy | 31.65% | 23.76% |
| Medium | 45.45% | 43.06% |
| Hard | 22.90% | 33.18% |

26.05% changed labels, all between adjacent levels. No changes were made to
measurements or route selection. The old composite remains available for
continued comparison; the new rule does not model how noticeable a deduction
is, and narrow opportunities can still feel easy when the player sees them
immediately.

### Short stretches with high scarcity

Two further playtests exposed the weakness of assigning Easy to all short
stretches. Both had enough bottlenecks to feel harder than Easy, but opened
up quickly enough after each bottleneck to make Medium a good description:

| Seed | Composite | Stretch | Scarcity | Player assessment |
| --- | ---: | ---: | ---: | --- |
| `8f859a04` | 57.47 (medium) | 8.60 | 13.05 | Easy undersold it; finding the right sequence through a bottleneck took time. |
| `8da4603e` | 55.12 (medium) | 8.20 | 13.35 | Definitely not Easy; many bottlenecks, but smooth progress once the right move was found. Medium felt reasonable. |

We therefore changed Easy to require both stretch <13 and scarcity <10.
Hard still requires both measurements at or above their thresholds; mixed
cases are Medium. Feedback identifies this revision as `stretch-scarcity-2`,
retaining `stretch-scarcity-1` for the original short-stretch-first rule.

In the same 10,000-seed sample, only 51 puzzles (0.51% of all puzzles, 2.15%
of the original rule's Easy group) moved from Easy to Medium. Fifty were
Medium under the composite; one was Easy. The revised proportions are
23.25% Easy, 43.57% Medium, and 33.18% Hard. These targeted playtests support
the exception but do not establish accuracy for every puzzle in that group.

Another observed bottleneck, `fbcf6d77`, remained Hard: stretch 23.80,
scarcity 10.53, composite 68.41 (Medium). The recorded mid-game position had
just two available clue observations, and the player felt Hard was justified.

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

## Capturing a stuck position

Open Options during a started game and click its difficulty readout three
times without closing Options to unlock Puzzle analysis. This is remembered
in the browser; subsequent visits need just one click. The seed field must
still match the current game.

The dialog shows both ratings and their metrics, the number of available clue
observations, and up to three alternative deductions. It refreshes each time
it opens and does not enter Zen or change the board. Use **Copy position**
to preserve the position for later discussion or the command-line tools.
Hints no longer log snapshots automatically.

The snapshot contains the seed and generator version, `domains[row][symbol]`
bitmasks of possible columns, and `placements[row]` bitmasks of explicitly
placed symbols. Indices are zero-based, with the low bit representing the
leftmost column (or first symbol). Chalk marks are recorded separately;
they do not influence the hint. The snapshot records the actual board, not
the temporary deductions displayed by an open proof or hint.
