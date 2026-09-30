# Difficulty calibration

The game entry point is `puzzleDifficulty(puzzle)` in `logos.js`. It rates an
already-generated puzzle and returns `{ score, level }`, independent of player
progress. Generation and seed identity are unchanged.

The current score uses five placement-first routes:

```
score = excessDiscards + 5 * scarcity
```

Easy scores below 47, Medium below 70, and Hard at or above 70. Comparisons
use unrounded scores. The weight approximately balances the sampled
interquartile spreads of the two terms; the cutoffs round the empirical thirds
into provisional boundaries informed by the manual cases below. These are
broad estimates, not guarantees about any individual playthrough.

The original weighted score remains in `compositeDifficultyRating()`:

```
supportSteps + 2.65 * scarcity + 0.87 * maxDiscardRun
```

Its cutoffs remain 45/80, and callers use `measureDifficulty(puzzle, 5, false)`
to preserve the original anchored-first routes. The analysis dialog, CLI,
and feedback compare against that historical result, not the old formula
applied to the new routes. Feedback identifies the current method as
`placement-composite-1`; deploy the updated Worker before publishing clients
that submit this version. Existing cached Chronicle labels are not migrated.

## Measurements

The solver starts from the original clues and automatically applies row
single-position and single-candidate deductions after every observation.
All reductions for one target symbol from one clue form one observation.
The current policy uses the full candidate-state reduction, even when a
weaker anchored reduction is also available.

Each available move is tried on a copy of the board, followed by automatic
row deductions. The solver chooses the move producing the most newly
determined tiles, randomizing ties with a deterministic stream. A discard
that triggers automatic placements competes equally with a direct placement.
Lookahead includes only row deductions, not subsequent deductions from other
clues. Anchored/candidate status no longer affects move selection.

Five routes are measured, with seeds `Math.imul(i + 1, 0x9e3779b9)` for
`i = 0..4`. Each metric is averaged before rating the puzzle:

- `supportSteps`: number of selected candidate-based observations, retained
  for diagnostics. The anchored test asks whether the clue can make any
  reduction after resetting non-singleton domains to full. It does not imply
  that the entire selected reduction is anchored.
- `scarcity`: sum of 1 / available observations at each selected move.
- `maxDiscardRun`: longest consecutive run of discard observations without a
  placement. A discard that triggers automatic row placement ends the run
  and is included in its length.
- `excessDiscards`: sum of discards beyond the first three of each stretch.
  This accumulates effort over repeated stretches.

Only excess discards and scarcity enter the current score. We average routes
rather than take the easiest one. Multi-clue human insights can bypass much
of the measured work. `placementFirst=false` retains the original policy:
prefer anchored observations, then immediate placements, with anchored
partial reductions offered before stronger candidate-state reductions.

The sections below record the historical experiments and their then-current
rules. References there to unchanged production behavior describe that stage
of the experiment; the current implementation is the policy above.

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

## Accumulated discard effort

On September 28, 2026, we replaced longest stretch in the level rule with
`excessDiscards`, retaining longest stretch for the old composite and analysis.
One long stretch and several substantial stretches should both count as work;
a placement between stretches should not erase the earlier effort.

We measured 1,000 fresh distinct seeds (sample RNG seed `20260928`, excluding
41 previously discussed seeds), keeping the same five routes and scarcity.
For allowances of 2, 3, and 5, each route sums `max(0, stretch - allowance)`.
Cutoffs were selected to approximate the 32% of this sample with longest
stretch below 13, without using player times. Ties prevent exact matching.

| Metric | Cutoff | Easy | Medium | Hard | Changes from longest-stretch rule |
| --- | ---: | ---: | ---: | ---: | ---: |
| Longest stretch | 13 | 319 | 415 | 266 | — |
| Allowance 2 | 15.3 | 315 | 420 | 265 | 95 |
| Allowance 3 | 13.1 | 321 | 412 | 267 | 83 |
| Allowance 5 | 9.7 | 321 | 412 | 267 | 57 |

Allowance 3 was tested with four shuffled disagreement puzzles. Predictions
were withheld until all four were played, though the current in-game label
remained accessible. A replacement was then chosen in the same direction as
the inconclusive first example; its direction was disclosed before play.

| Seed | Time | Previous rule → Allowance 3 | Longest stretch | Excess discards | Player assessment |
| --- | ---: | --- | ---: | ---: | --- |
| `ae48a08e` | 3:41 | medium → easy | 15.2 | 12.8 | Felt like obvious placements were overlooked; set aside as inconclusive. |
| `f8167b9b` | 1:45 | medium → easy | 13.4 | 11.8 | Fairly easy; opening discards then smooth progress. |
| `830cb2fb` | 2:21 | easy → medium | 11.2 | 13.4 | Opening discards then opened up; a little harder than the preceding Easy example. |
| `eeaf9adc` | 2:32 | easy → medium | 11.6 | 16.2 | Smooth start, then several discard patches; a little harder than the Easy example. |
| `18530f24` | 1:11 | medium → easy | 14.6 | 11.8 | Replacement for the first example; felt quite easy. |

We adopted allowance 3 provisionally with cutoff 13.1, keeping scarcity at 10.
Feedback identifies it as `allowance3-scarcity-1`. Existing Chronicle labels
are not migrated. This is a small, selected set of subjective observations,
not an independent accuracy estimate; setting aside an unfavorable example
also limits the strength of the evidence.

The earlier manual examples remain mixed: `d49bc27a` moves to Easy and
`e7e2214f` to Medium, consistent with their assessments, but `0a568040` moves
to Easy despite feeling Medium and `0e9f4c26` moves to Medium despite Easy
being defensible on replay. Both short-but-scarce examples remain Medium;
total discard count without an allowance would have made them Hard.

`e36efbeb`, which prompted the experiment, remains Medium (scarcity 7.96,
longest stretch 22.8, excess discards 21.6). Its routes mostly contain one
dominant stretch, so this change does not explain why it felt fairly easy.

Subsequent reports provided a useful mixed pair. `ec29e0c8` had been Easy;
an unnamed player reported that it felt harder (17:17), and Peff found it
harder than expected (4:35). Allowance 3 makes it Medium (excess 16.4,
scarcity 8.66). But `b73aa28a` also becomes Medium (excess 17.2, scarcity
8.25), despite both the reporting player (2:51) and Peff (1:36) endorsing
Easy. This is a known regression, not just a boundary case. Times across
players are not directly comparable, and the change remains provisional.

## Experimental dependency rounds and breadth

On September 30, 2026, we extended the analysis-only frozen-round solver with
round breadth: distinct reductions to one symbol from one clue, evaluated
against the starting board for that round. Identical target reductions offered
by different clues count once. These use the full candidate state, without
the scoring solver's anchored/candidate split. They describe available work,
not work a player necessarily needs to perform. See `analysis/puzzle --rounds`
and [the analysis README](README.md) for the round semantics.

Experimental round scarcity is the sum of `1 / breadth` over rounds without
a new placement. Rounds containing only automatic row deductions contribute
zero, avoiding division by zero and treating automatic propagation as free.
Round boundaries and placement timing are unchanged. Mixed rounds can contain
clue observations that overlap automatic row consequences; these observations
are still counted. No production difficulty rules have changed.

A fresh sample of 1,000 distinct seeds, generated with `seedRandom(0x20260930)`
and excluding the 53 recorded examples remeasured in this experiment, had
median round scarcity 0.341, 75th percentile 1.166, and 90th percentile 2.192.
192 puzzles scored zero. Rank correlation was 0.951 with placement-free round
count, 0.871 with the current five-route scarcity, and 0.755 with excess
discards. This primarily refines placement-free depth rather than providing
an independent difficulty dimension. The old temporary sample files were no
longer available, so this is not a paired comparison against that sample.

| Seed | Rounds | Placement-free rounds | Round scarcity | Earlier assessment |
| --- | ---: | ---: | ---: | --- |
| `555dd3ae` | 15 | 1 | 0.167 | Felt much shorter than its discard stretch. |
| `b73aa28a` | 18 | 2 | 0.268 | Easy, 1:36. |
| `ec29e0c8` | 21 | 5 | 0.985 | Harder than expected, 4:35. |
| `be0e8074` | 22 | 4 | 1.025 | Hard, 7:42 and 7:11 on replay. |
| `02b839f1` | 27 | 6 | 1.535 | Clearly Hard, 7:46. |
| `e2a689dd` | 23 | 11 | 4.339 | Hard, 9:41. |
| `8f859a04` | 26 | 2 | 2.000 | Short but bottlenecked; Medium. |
| `8da4603e` | 24 | 1 | 0.500 | Many bottlenecks but smooth progress; Medium. |
| `8b3e52f6` | 21 | 8 | 3.285 | Long but smooth; never felt stuck. |
| `d49bc27a` | 18 | 1 | 1.000 | Very easy, 1:42. |
| `219558b4` | 34 | 24 | 17.313 | Human shortcut bypassed a difficult opening. |

The Easy/Medium pair separates better: the placement-free rounds have breadths
8, 7 for `b73aa28a`, versus 9, 11, 5, 4, 3 for `ec29e0c8`. But `8b3e52f6`
remains a counterexample, and one narrow round puts the very easy `d49bc27a`
near `be0e8074`. This cannot distinguish an obvious lone deduction from a
hard-to-notice one. No cutoffs were selected for scarcity alone.

### Experimental two-term composite

The round analyzer now reports `score = rounds + 5.5 * roundScarcity`.
The weight balances the terms' interquartile ranges in the same 1,000-seed
sample: rounds have Q1=13 and Q3=19 (spread 6), while round scarcity has
Q1=0.066667 and Q3=1.165698 (spread 1.099031). Their spread ratio is 5.45935,
rounded to the nearest half unit, 5.5. This is a fixed initial scale choice,
not a fit to play times or subjective labels.
For supplied positions, the score describes remaining work.

Provisional composite cutoffs use the 1/3 and 2/3 quantiles of integer seeds
1–1000 (hexadecimal `00000001` through `000003e8`): Easy below
16.916666666666668, Medium below 23.914484126984128, otherwise Hard.
The quantile calculation linearly interpolates sorted scores at index
`(N - 1) * p`; these two indices are integers for N=1000. Comparisons use
unrounded scores, with equality assigned to the higher level. Tied scores
can make group sizes slightly unequal. These are population splits, not
boundaries validated against player assessments.

A validation sample of 10,000 distinct random seeds (`seedRandom(0x20260930)`,
excluding integer seeds 1–1000) yielded 3,393 Easy (33.93%), 3,226 Medium
(32.26%), and 3,381 Hard (33.81%) with those fixed cutoffs. Its own thirds
were 16.785714285714285 and 24.05; adopting them would change 111 labels
(1.11%). We retained the original cutoffs. This supports the stability of
the population split, not the accuracy of the labels for human players.


Sample composite quartiles are 13.777, 18.283, and 25.285; the 90th percentile
is 33.002. Some illustrative scores are `555dd3ae` 15.92, `b73aa28a` 19.47,
`ec29e0c8` 26.42, `be0e8074` 27.64, and `e2a689dd` 46.87. The existing
counterexamples remain: `d49bc27a` scores 23.50 despite feeling very easy,
and the long-but-smooth `8b3e52f6` scores 39.07. The short-but-bottlenecked
Medium example `8f859a04` also scores relatively high at 37.00. Production
ratings still use the existing five-route excess-discard/scarcity rule.

### Label comparison across all three schemes

Applying the fixed round cutoffs to the earlier 1,000-seed breadth sample
(RNG seed `20260930`, excluding the 53 recorded examples) gives:

| Scheme | Easy | Medium | Hard |
| --- | ---: | ---: | ---: |
| Original composite (45/80) | 319 | 456 | 225 |
| Current excess discards / scarcity | 208 | 462 | 330 |
| Round composite | 427 | 280 | 293 |

Pairwise agreement is 74.0% for original/current, 64.3% for original/round,
and 60.5% for current/round. All three agree on 498 puzzles. Original/round
has nine Easy/Hard jumps; current/round has seven. Current-to-round changes
are Easy→Medium 24, Easy→Hard 3, Medium→Easy 242, Medium→Hard 43,
Hard→Easy 4, and Hard→Medium 79.

This batch is more round-Easy than the 10,000-seed validation (42.7% versus
33.93%). All 1,000 seeds overlap that larger sample and their scores agree;
this is a sample-composition difference, not a scoring discrepancy. The fixed
cutoffs were not adjusted. These counts should not be treated as precise
population proportions.

Among the 53 recorded examples, all three agree on 27. Current/round agree
on 39, with no Easy/Hard jumps. Promising changes include `555dd3ae` and
`e36efbeb` becoming Easy, and `35adb143`, `12357692`, and `2b4ad928`
becoming Medium. But `d49bc27a` becomes Medium despite feeling very easy,
`e7e2214f`, `64467f3d`, and `dccd2c9b` become Easy despite Medium-like
assessments, and both short-but-bottlenecked examples (`8f859a04` and
`8da4603e`) become Hard despite the player's preference for Medium.
`b73aa28a` still rates Medium despite feeling Easy, and `8b3e52f6` remains
Hard despite smooth progress. The new composite is not a clear improvement
on these selected cases; agreement between metrics is not accuracy against
human judgments.

### Blind tests of Easy/Hard disagreements

Four puzzles were selected from the 1,000-seed comparison: two current-Easy /
round-Hard and two current-Hard / round-Easy, with their presentation order
shuffled. Predictions were withheld until all four were played, though the
current in-game label remained accessible. All four subjective assessments
supported the current rule over the round composite.

| Seed | Original | Current | Rounds | Round score | Time | Player assessment |
| --- | --- | --- | --- | ---: | --- | --- |
| `2916964e` | medium | easy | hard | 31.69 | 1:41 | Easy. |
| `0fd2687a` | medium | easy | hard | 24.53 | 2:12 | Pretty easy; small bottleneck at the end. Upper Easy. |
| `698db641` | hard | hard | easy | 16.43 | 2:22 replay | Very good Hard puzzle; long opening deduction bottleneck, then satisfying cascade. Logic error on first attempt, then restarted; time is not an independent first-play result. |
| `9b6d3e95` | hard | hard | easy | 15.89 | 3:48 | Great Hard puzzle. |

This small, deliberately selected disagreement set is not an overall accuracy
estimate, but is strong reason not to replace the current rule with this
round composite. Both felt-Hard puzzles scored below both felt-Easy puzzles,
so moving the two score cutoffs cannot repair their ordering. Frozen rounds
may still be useful diagnostics, but dependency depth and this breadth-based
scarcity miss relevant aspects of human effort.

### Replacing only the effort term with rounds

We also tried keeping the current five-route scarcity and its cutoff of 10,
replacing only excess discards with either total rounds or placement-free
rounds. Both low still means Easy, both high Hard, and mixed Medium. This
uses sequential-route scarcity, not experimental round scarcity.

In the same 1,000-seed breadth sample, 209 puzzles have excess discards <13.1.
For each integer round metric, we chose the strict-less-than threshold whose
low-effort count is closest to 209 (ties favor the lower threshold). Total
rounds <13 selects 223 puzzles; placement-free rounds <1 selects 192. Ties
make exact matching impossible: the next higher thresholds select 286 and
358 respectively. These thresholds were chosen without the play assessments.

| Effort metric | Easy | Medium | Hard | Changes from current |
| --- | ---: | ---: | ---: | ---: |
| Excess discards <13.1 | 208 | 462 | 330 | — |
| Total rounds <13 | 223 | 446 | 331 | 216 |
| Placement-free rounds <1 | 192 | 477 | 331 | 125 |

Neither alternative produces Easy/Hard jumps in this sample. Both retain all
330 current Hard labels and promote one Medium to Hard. Most movement is
between Easy and Medium. These results use this particular sample's low-effort
share, not an attempt to create equal-sized final groups.

For 57 recorded examples (the prior 53 plus the four blind disagreements),
total rounds changes nine labels and placement-free rounds changes eleven.
Both alternatives retain Hard for `698db641` and `9b6d3e95`, but promote
`2916964e` and `0fd2687a` from Easy to Medium, despite their Easy assessments.
They also promote `d49bc27a`, `2068ddf1`, and `18530f24` to Medium despite
clear Easy assessments, and `8f859a04` and `8da4603e` to Hard despite Medium
assessments. Total rounds does restore Medium for `0a568040`; placement-free
rounds makes `e36efbeb` Easy, but also makes `eeaf9adc` Easy despite its more
Medium-like assessment. Both leave `b73aa28a` and `555dd3ae` Medium.

Subsequent replays softened, but did not reverse, two Easy assessments.
`d49bc27a` still felt Easy, though less trivial than the original "very easy"
description suggested; no replay time was reported. `18530f24` took 1:43
versus the original 1:11, but the player still judged Easy appropriate.
These are repeat plays, not independent blind tests. Both round-based
replacements would still promote these puzzles to Medium.

These are mixed results, not evidence to adopt either alternative. Production
ratings and the analysis tools' displayed rules remain unchanged by this
experiment.

### Placement-first route policy experiment

We tested removing the anchored/candidate preference in two places: every
clue offers its full candidate-state reduction, and moves are ranked by the
number of newly determined tiles after automatic row closure. The maximum
cascade wins, with ties randomized using the same five route seeds as before.
Moves with no placements have no tier preference. Lookahead includes row
closure only, not subsequent deductions from other clues. Scarcity and discard
accounting remain unchanged, including counting a discard that triggers a row
placement at the end of its stretch. The baseline metrics were checked against
the cached values for all 1,000 sample seeds and 57 recorded examples.

With unchanged cutoffs, sample counts move from 208/462/330 Easy/Medium/Hard
to 290/493/217. To separate policy changes from this overall scale shift,
we also matched the old marginal low-effort and low-scarcity counts (209 and
669): cutoffs 10.2 and 8.749321453960702 yield 209/460/331. These are exploratory
population-matching thresholds, not proposed production constants.

Some route changes are substantial: `18530f24` excess discards fall from
11.8 to zero; `555dd3ae` falls from 21.2 to 14.0. With matched proportions,
`6ffbd6db` becomes Medium and `0a568040` becomes Medium, consistent with their
assessments. Both short-but-bottlenecked Mediums retain Medium. But `d49bc27a`
and `f8167b9b` become Medium despite Easy assessments, `1adb6058` becomes Hard
despite being judged low Medium, and `698db641` becomes Medium despite its
Hard assessment. The other three recent blind examples retain their assessed
labels. This policy is plausible but is not a universal labeling improvement.

Average measurement time across this run (five routes, excluding generation)
was about 10.8 ms versus 4.8 ms for the baseline. This unoptimized prototype
copies the board and runs row closure for every available observation. It is
an analysis experiment only; production route selection and ratings have not
changed.

### Equal-thirds cutoffs for the placement-first policy

We jointly fitted the two cutoffs on the same 1,000 placement-first puzzles,
minimizing squared deviations of the three label counts from N/3. Candidate
cutoffs were midpoints between distinct observed values (plus the endpoints).
The unique best classification split is 333 Easy, 333 Medium, 334 Hard,
achieved by excess discards <24.3 and scarcity <6.3. The exact midpoint for
scarcity is 6.302599289526042; rounding to 6.3 preserves every sample label.
No manual assessments entered this fit.

These thresholds produce more Easy and Hard puzzles than the old-proportion
fit (209/460/331), but through a different balance: more discard effort is
allowed below the effort threshold, while much lower scarcity is required
below the scarcity threshold. They preserve Easy for `d49bc27a`, `18530f24`,
and `f8167b9b`; make `555dd3ae` Easy and `6ffbd6db` Medium; and keep the two
short-but-bottlenecked examples Medium. Both recent blind Hard examples stay
Hard, but both blind Easy examples become Medium because their scarcity is
6.61 and 6.89. Other regressions include `02b839f1` and `4e233909` becoming
Medium despite Hard assessments, and `b91f28c7` becoming Hard despite a Medium
assessment. This is a population balance experiment, not evidence of improved
accuracy; the cutoffs have not been adopted in production.

On replay, `b91f28c7` was reassessed as Hard being justifiable (no new time
reported), softening that counterexample. Its placement-first excess discards
are 26.2 against cutoff 24.3, and scarcity 8.61 against 6.3. `2916964e` was
replayed in exactly 1:41 again and still judged Easy, toward the upper end of
Easy. Its placement-first excess discards are 7.6, while scarcity 6.61 puts
it just above the Easy/Medium scarcity boundary of 6.3.

### Nearby placement-first cutoff pairs

A grid sweep over effort cutoffs 18.0–26.0 and scarcity cutoffs 6.3–8.0,
in increments of 0.1, explored departures from exact thirds. Selected pairs
on the same 1,000-seed sample give:

| Effort cutoff | Scarcity cutoff | Easy | Medium | Hard |
| ---: | ---: | ---: | ---: | ---: |
| 24.3 | 6.3 | 333 | 333 | 334 |
| 24.3 | 6.7 | 389 | 287 | 324 |
| 24.3 | 7.0 | 421 | 261 | 318 |
| 23.0 | 7.0 | 404 | 237 | 359 |
| 22.0 | 7.0 | 399 | 214 | 387 |
| 20.0 | 7.0 | 379 | 184 | 437 |

The simple 23/7 pair makes both recent blind Easy examples Easy and retains
Hard for both blind Hard examples. It also restores Hard for `02b839f1`,
while retaining Easy for `d49bc27a` and `18530f24`, Medium for `6ffbd6db`,
and Medium for both short-but-bottlenecked puzzles. But `dcfeb188`,
`3772d85c`, and `830cb2fb` move from Medium to Easy despite Medium-like
assessments, and `2b4ad928` moves back to Hard despite the player's lower
assessment. `4e233909` and `fbcf6d77` remain Medium despite Hard assessments.

Lowering effort to 20 with scarcity 7 restores Hard for `4e233909`, but also
makes `c549b7c4`, `64467f3d`, and `6ffbd6db` Hard. Raising scarcity creates
more Easy puzzles, and lowering effort creates more Hard puzzles; together
they shrink Medium rather than preserving all group sizes. Around 23/7
(effort 22.5–23.5, scarcity 6.9–7.1), the grid gives 39.9–42.1% Easy,
21.4–25.8% Medium, and 33.5–37.3% Hard. This is a population sensitivity
check, not an independent validation of the selected cases. No new cutoff
pair has been adopted.

### Two-dimensional distribution inspection

Scatter plots of excess discards against scarcity for the same 1,000 seeds,
with density bins of width 3 discards by 1 scarcity unit, show a continuous
diagonal cloud under both policies. There are no visually obvious three
separated clusters. Most density is toward the lower-left, with a thinning
upper-right tail. Pearson correlation between the two measurements is 0.836
under the current policy and 0.842 under placement-first. Placement-first
shifts much of the cloud downward but does not create clearer separation.
This is visual exploration, not a statistical test of cluster count.

An overlay of 31 selected, explicit player assessments shows broad ordering
from Easy toward Hard, with overlap and short-but-scarce Medium examples above
the main Easy region. Four recent blind examples are individually annotated;
the two Easy examples lie to the left of the two Hard ones under both
policies. Ambiguous assessments were omitted rather than forced into labels.
The overlay is a deliberately selected set, not a representative accuracy
sample. The distribution provides no natural justification for equal thirds,
or for a particular fraction of puzzles being Hard; that still requires
interpreting the metrics against player experience.

### Two-term composite with placement-first routes

We swept `score = excessDiscards + a * scarcity` over weights
0, 1, 2, 3, 4, 5, 6, and 8, using the placement-first metrics and recomputing
empirical-third score cutoffs for each weight on the same 1,000 puzzles.
These are the sequential route metrics, averaged over five routes, not the
frozen-round measurements. The zero weight is an effort-only control.

A reasonable initial weight is 4.5: excess discards have interquartile spread
16.85, versus scarcity's 3.757012, giving a spread ratio of approximately
4.485. Rounding to 4.5 balances those spreads without fitting to player
assessments. Its provisional cutoffs are 43.33093631661458 and
64.20257492682308, yielding 333 Easy, 333 Medium, and 334 Hard. Rounded
43.3/64.2 yields 332/334/334; integer 43/64 yields 325/340/335. No cutoffs
or solver policies have been changed in production.

Across weights 4.0 through 5.0 in increments of 0.1, all 57 recorded examples
retain their labels when the thirds are recomputed at each weight. Across
3.5–5.5, 53 of 57 retain their labels. This is weight sensitivity with refitted
cutoffs, not evidence of independent human-rating accuracy.

At weight 4.5, the four recent blind puzzles receive Easy (37.34), Easy
(38.20), Hard (64.67), and Hard (82.56), matching the assessments. `d49bc27a`
and `18530f24` stay Easy; `555dd3ae` becomes Easy. `6ffbd6db` and both
short-but-bottlenecked puzzles are Medium. `02b839f1` and `4e233909` are
Hard. Compared with the 23/7 two-dimensional rule, this also retains Medium
for `dcfeb188`, `3772d85c`, and `830cb2fb` instead of making them Easy.

Known mismatches remain: `1adb6058` is Hard (73.94) despite a low-Medium
assessment; `b73aa28a` remains Medium (53.96) despite Easy assessments;
`fbcf6d77` is Medium (60.95) despite its reported Hard bottleneck;
`f83c8b35` is Easy (42.64) despite a lower-Medium assessment. `8b3e52f6`
remains Hard (80.72) despite smooth progress. The historical assessments
are selected, noisy observations, and should not be treated as a clean
training/test split. This is a promising candidate for further evaluation,
not proof of a superior rating scheme.

### Wider weight sensitivity sweep

We extended the placement-first two-term sweep from weight 0 to 20, checking
every 0.1 step and independently recomputing empirical-third score cutoffs
at every weight. The table compares labels against weight 4.5; differences
are not error rates or accuracy estimates. Cutoffs below are rounded for
presentation; calculations use their full values.

| Weight | Easy cutoff | Hard cutoff | Sample labels changed | Recorded labels changed |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 14.600 | 24.600 | 153/1000 | 11/57 |
| 1 | 20.819 | 33.536 | 102/1000 | 8/57 |
| 2 | 27.522 | 42.246 | 64/1000 | 5/57 |
| 3 | 33.917 | 51.154 | 36/1000 | 2/57 |
| 4 | 40.150 | 59.670 | 14/1000 | 0/57 |
| 4.5 | 43.331 | 64.203 | — | — |
| 5 | 46.630 | 68.593 | 8/1000 | 0/57 |
| 6 | 53.094 | 77.262 | 22/1000 | 2/57 |
| 8 | 65.863 | 94.589 | 40/1000 | 3/57 |
| 10 | 78.531 | 112.360 | 50/1000 | 4/57 |
| 20 | 142.103 | 200.520 | 90/1000 | 9/57 |

At every checked weight from 4 to 5, all 57 recorded labels remain unchanged.
Across weights 3 through 6, 53 of 57 stay fixed: `3772d85c` and `830cb2fb`
are Easy at weight 3 rather than Medium; at weight 6, `35adb143` moves from
Medium to Hard and `449f1018` from Hard to Medium. Rank correlations against
weight 4.5 are 0.9983 at weight 3 and 0.9992 at weight 6.

At weights 0 and 1, both short-but-scarce Medium examples are Easy; they are
Medium at weights 2–10 in the displayed sweep, but Hard at 20. `698db641`
drops from Hard to Medium at weight 8. Thus the middle range preserves some
useful distinctions lost by very effort-heavy or scarcity-heavy choices.
The large correlation between the components also makes overall rankings
insensitive to modest weight changes. Nothing here uniquely identifies 4.5
as optimal; it remains a distribution-scaled starting point.

### Weight-five boundary playtest

The player preferred weight 5 over 4.5 for its simpler integer coefficient;
all 57 previously recorded labels were unchanged, while eight of the 1,000
sample labels changed after recomputing thirds. One of those eight,
`7c6a880e`, was played with its predictions disclosed: weight 4.5 scores
43.4541 against Easy cutoff 43.3309 (Medium), while weight 5 scores 46.0823
against Easy cutoff 46.6303 (Easy). Its placement-first excess discards are
19.8 and scarcity 5.25647.

The result was 1:44, with some reported unlucky choices in direction early
on. The player considered the Easy/Medium cusp defensible and leaned Easy
given that time. This supports the weight-five label for this boundary case,
not a general accuracy advantage over 4.5; the playtest was not blind.

### Selected weight and score histogram

The player selected the integer coefficient 5 for the placement-first
composite: `score = excessDiscards + 5 * scarcity`. Production remains
unchanged while score cutoffs are considered.

Histograms of the same 1,000-seed sample, with both 5-point and 10-point
buckets, show a broad peak around 40–50, a substantial shoulder through 70,
and a thinning right tail. There is no visually obvious gap separating levels.
Scores range from 17.09 to 154.52; quartiles are 41.27, 57.33, and 75.36.
The 90th percentile is 96.44. The empirical thirds remain 46.63029576202951
and 68.59334514384824. These are landmarks, not evidence of natural clusters.

For population context, cutoffs 45/70 yield 305 Easy, 384 Medium, 311 Hard;
45/75 yield 305/441/254; 50/70 yield 389/300/311; 50/75 yield 389/357/254.
These are illustrative alternatives only, not adopted boundaries or evidence
that they match player judgments. Figures were produced with gnuplot from
cached placement-first metrics, without recomputing or changing the solver.

### Played cases at candidate score cutoffs

Comparing weight-five labels under exact thirds (46.6303/68.5933), 45/70,
and 45/75 changes nine of 58 recorded examples, including `7c6a880e`.
The other 49 retain the same label under all three pairs.

| Seed | Score | Thirds | 45/70 | 45/75 | Player evidence |
| --- | ---: | --- | --- | --- | --- |
| `f83c8b35` | 45.62 | easy | medium | medium | Solidly Medium, perhaps lower Medium; 2:37. |
| `7c6a880e` | 46.08 | easy | medium | medium | Easy/Medium cusp, leaning Easy; 1:44. |
| `50e8c8d9` | 68.90 | hard | medium | medium | Long opening, never stuck; lower Hard later considered defensible. |
| `449f1018` | 68.92 | hard | medium | medium | Felt Hard; repeatedly missed an available clue. |
| `698db641` | 68.93 | hard | medium | medium | Very good Hard puzzle; 2:22 on restart. |
| `b91f28c7` | 69.26 | hard | medium | medium | Initially Medium; Hard considered justifiable on replay. |
| `02b839f1` | 70.13 | hard | hard | medium | Clearly Hard, 7:46. |
| `ec29e0c8` | 71.44 | hard | hard | medium | Harder than expected, 4:35; no explicit final label. |
| `dccd2c9b` | 72.82 | hard | hard | medium | Upper Medium / lower Hard, 3:19. |

Moving Easy to 45 improves `f83c8b35` while making the defensible boundary
case `7c6a880e` Medium. Raising Hard to 70 loses the clear Hard assessment
for `698db641` and the Hard impression of `449f1018`. Raising it to 75
additionally loses `02b839f1`, a strong Hard example, while putting the more
ambiguous `dccd2c9b` in Medium. This favors keeping the Hard boundary near
the thirds value more than it supports either rounded higher alternative.
No final score cutoffs have been selected.

### Inspecting the five placement-first routes for `02b839f1`

Tracing the same five route seeds reproduces the experimental averages
exactly: excess discards 24.0, scarcity 9.2255204, composite 70.1276021.
Individual route scores are diagnostic; the puzzle label still uses averages.

| Route | First placement at observation | Excess discards | Scarcity | Weight-five score | Smallest observation count with no placement available |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13 | 22 | 7.515 | 59.58 | 4 |
| 2 | 14 | 26 | 10.796 | 79.98 | 2 |
| 3 | 15 | 25 | 9.313 | 71.56 | 3 |
| 4 | 21 | 30 | 10.214 | 81.07 | 2 |
| 5 | 17 | 17 | 8.290 | 58.45 | 3 |

Route 4 reaches observation 20 with no tiles placed and only two available
observations: A<V removes V from column 2; minus<B removes B from column 2.
Taking the first makes V unavailable in columns 1–2, so the adjacency of
division and V excludes division from column 1. Plus is then the only
operator in column 1; plus–minus–1 determines minus in column 2 and 1 in
column 3. The sole-column inference is included in the automatic row cascade.

Route 2 reaches observation 36 with four tiles placed and two available
observations: 5–D–2 removes 5 from columns 1 and 5, and A-above-equals removes
A from columns 2 and 3. It takes both, then III–A–F removes F from columns
1 and 2, triggering E in column 1 and C in column 2. These are genuine narrow
positions, not inferred solely from the final aggregate score.

None of the five routes has only one available observation while no placement
is possible; each has a one-option state elsewhere, where a placement is
available. Two route scores fall below the provisional Hard cutoff, three
above it. The substantial route variation is a concrete explanation for how
a consistently Hard-feeling playthrough can coexist with a borderline average.
It does not establish that the player followed one of these exact paths, nor
prove that visibility of deductions is unimportant. The observations at the
narrowest positions are individually straightforward once noticed.

### Route variation and recurring troublemakers

We measured 50 placement-first routes for 59 discussed puzzles, using the
same `Math.imul(i + 1, 0x9e3779b9)` route seeds. The first five reproduce all
available cached metrics. Variation is measured in the weight-five composite;
standard deviations use the sample formula (denominator N−1). Route labels
use the unchanged 46.6303/68.5933 thresholds, with full precision internally.
These are solver-route frequencies, not probabilities of human experiences.

Before inspecting variation, we selected ten historical recurring troublesome
cases: `b73aa28a`, `8b3e52f6`, `e36efbeb`, `6ffbd6db`, `be0e8074`,
`02b839f1`, `fbcf6d77`, `1adb6058`, `5be42607`, and `ec29e0c8`.
Thirteen broadly consistent comparison cases were `98079244`, `d7f8091b`,
`c549b7c4`, `dcfeb188`, `e2a689dd`, `644f7f3d`, `82890831`, `67d6cd2b`,
`2068ddf1`, `f8167b9b`, `18530f24`, `34d5b404`, and `82630241`.
These are exploratory groups, not clean correctness labels: some historical
troublemakers now agree with the placement-first composite, and subjective
assessments have sometimes changed on replay.

| Group | Count | Median mean score | Median route SD | Median SD / mean |
| --- | ---: | ---: | ---: | ---: |
| Historical troublemakers | 10 | 69.96 | 11.17 | 16.43% |
| Consistent comparisons | 13 | 36.66 | 7.19 | 15.48% |

The absolute spread is larger in the troublesome group, but it also contains
higher-scoring puzzles. Across all 59, score mean and SD have Pearson
correlation 0.767. Relative spread (SD/mean) is similar between groups; this
simple normalization is not a controlled adjustment for difficulty. There
is no clear separation showing that troublemakers are unusually variable.

| Seed | Mean score | SD | Easy / Medium / Hard routes |
| --- | ---: | ---: | --- |
| `02b839f1` | 74.03 | 11.25 | 0 / 17 / 33 |
| `6ffbd6db` | 59.26 | 15.70 | 8 / 28 / 14 |
| `b73aa28a` | 57.88 | 9.29 | 3 / 39 / 8 |
| `8b3e52f6` | 94.07 | 15.80 | 0 / 2 / 48 |
| `be0e8074` | 86.60 | 11.09 | 0 / 3 / 47 |
| `5be42607` | 75.66 | 8.19 | 0 / 5 / 45 |
| `c549b7c4` | 54.70 | 8.47 | 7 / 40 / 3 |
| `dcfeb188` | 54.87 | 10.46 | 12 / 32 / 6 |
| `e2a689dd` | 135.60 | 16.83 | 0 / 0 / 50 |

This supports route sensitivity for some individual cases, especially
`6ffbd6db`, but not a universal explanation. `8b3e52f6` is almost always
Hard under this solver despite smooth human progress; `b73aa28a` rarely
has an Easy route despite Easy assessments. Conversely, unequivocally Hard
`e2a689dd` has considerable absolute variation without any label variation.

Five-route SD and 50-route SD have rank correlation 0.756 across these 59
puzzles. Estimates can move substantially: `d49bc27a` has SD 4.2 with five
routes versus 11.0 with 50; `e2a689dd` drops from 32.2 to 16.8. Route
variation is useful diagnostic context, especially alongside distance from a
label cutoff, but this experiment does not justify adding a variance penalty
to the difficulty score. Production behavior is unchanged.

### Placement-first: longest stretch versus excess discards

Keeping scarcity's weight at 5, we compared excess discards + 5×scarcity
against longest discard stretch + 5×scarcity on the same 1,000 placement-first
puzzles. Each formula gets its own empirical-third cutoffs: 46.6303/68.5933
for excess discards and 46.4721/67.3863 for longest stretch. Rank correlation
is 0.99016. Labels agree on 911/1000 puzzles; all 89 changes are adjacent.
The effort terms have similar, though not identical, interquartile spreads:
16.85 for excess discards and 14.25 for longest stretch. This holds weight
fixed rather than refitting the relative scaling.

Of 58 played examples, 51 retain the same label. The changes when using
longest stretch are `50e8c8d9` Hard→Medium, `02b839f1` Hard→Medium,
`3772d85c` Medium→Easy, `ec29e0c8` Hard→Medium, `449f1018` Hard→Medium,
`f83c8b35` Easy→Medium, and `7c6a880e` Easy→Medium. The clearest improvement
is `f83c8b35`, but the demotion of consistently Hard `02b839f1` is a notable
regression: its score falls from 70.13 to 62.53, as excess discards 24.0 is
replaced by longest stretch 16.4. The comparison provides no compelling
reason to return to longest stretch. Production remains unchanged.

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

## Adopted placement-first composite

After the experiments above, we selected placement-first routes, weight 5,
and cutoffs 47/70. In the 1,000-seed sample this gives 343 Easy, 346 Medium,
and 311 Hard. The deliberate boundary compromise puts `698db641` in Medium
at 68.93 despite its Hard impression; the player clarified that the early
restart likely saved only 10–20 seconds of its 2:22 run. `02b839f1` stays
Hard at 70.13. No universal accuracy claim is implied by this choice.
