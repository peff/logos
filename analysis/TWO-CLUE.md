# Two-clue deductions

The Extreme rating does not have a list of named two-clue rules. It joins
all legal assignments of two clues, enforcing agreement on shared symbols
and different columns for distinct symbols in the same row. It filters these
assignments against the current candidate board and removes every position
with no surviving assignment. One successful pair can remove candidates from
several symbols at once. All of this work is currently free.

This is an exhaustive description of the implemented deduction mechanism,
not an exhaustive list of human-readable tricks. The same clue types can
produce very different arguments depending on shared symbols, row membership,
and the current candidates. Repeated passes can indirectly combine information
from more than two clues, but each individual pass sees only two clues plus
the candidate board. Unmentioned symbols participate only through earlier
ordinary propagation; the pair does not solve their whole rows.

## Catalogue dimensions

Every deduction can be described along these independent dimensions:

- **Clue types:** given position, same column, ordered pair, adjacent pair,
  consecutive triple (either orientation). There are 15 unordered type pairs,
  including a type paired with itself.
- **Connection:** shared symbols, distinct symbols sharing rows, or both.
  Pairs with disjoint rows are skipped. Sharing a symbol also shares its row.
- **Geometry:** which roles are shared (e.g. triple endpoint versus center),
  and which distinct symbols must avoid one another in a row.
- **Candidate dependence:** a removed position may already be impossible
  with unrestricted domains, or may become impossible only on the current
  narrowed board. A single pass can contain both kinds of removal.
- **Row dependence:** would a removed position still have support if row
  uniqueness were ignored, retaining the clue relations and shared-symbol
  agreement? If so, row uniqueness is essential to that removal.

Candidate dependence is not a difficulty estimate. An inherent restriction
can involve intricate packing; a candidate-dependent restriction can be an
obvious collision once the board is narrowed. Nor does this classification
measure the effort needed to reach that board.

Useful human descriptions include shared-neighbor edge exclusions, overlapping
chains or triples, orientation exclusions, packing disjoint groups into a row,
and candidate-based reservations/collisions. These overlap rather than forming
a fixed menu of disjoint rules.

## Observed type families

A reproducible sample uses the same 1,000 Extreme puzzles as the pair-removal
comparison: xorshift32 seeds starting with state `0x731b9a2d`, skipping seeds
without an Extreme variant. Each puzzle uses ten routes and a 20,000-trial
budget. The catalogue records the passes actually selected by the search,
not every useful pair available at every stall, and not the effort replay.
All 10,000 routes completed. Counts include repeated uses across routes.

| Pair of clue types | Selected passes | Puzzles using it on at least one route |
| --- | ---: | ---: |
| Triple + triple | 13,940 | 725 |
| Triple + same column | 8,206 | 591 |
| Adjacent pair + triple | 6,729 | 479 |
| Triple + order | 6,360 | 497 |
| Adjacent pair + order | 1,446 | 145 |
| Adjacent pair + same column | 903 | 104 |
| Adjacent pair + adjacent pair | 878 | 70 |
| Same column + order | 293 | 46 |
| Order + order | 97 | 18 |
| Same column + same column | 0 | 0 |
| Given position + any of the five types | 0 | 0 |

The zero counts describe this sample, not a proof of impossibility.

Of 38,852 selected passes:

- 23,237 (59.8%) connected through rows without sharing a symbol.
- 30,389 (78.2%) made only candidate-dependent removals.
- 4,626 (11.9%) made only inherent removals.
- 3,837 (9.9%) mixed the two.

Of 96,954 removed candidates, 96,047 (99.1%) needed row uniqueness under the
counterfactual above. Thus these are overwhelmingly row-interaction deductions,
not just composing two spatial relations. Triple-containing pairs account for
90.7% of selected passes.

## Worked catalogue: 28311466

Columns below are numbered 1 through 6. These are the five passes selected on
route zero, in order, with ordinary propagation between passes. Other routes
can pick different pairs; the mean is 4.1 passes. A dash denotes a consecutive
triple in either direction, and die names refer to their face values.

1. **Shared-neighbor edge exclusion.** `3 beside F` and `A beside 3`.
   Because A and F are different letters, they must occupy opposite sides of
   3. Remove columns 1 and 6 for 3. No candidate narrowing is needed.

2. **Overlapping triples with row collisions.** `die-2 — I — III` and
   `I — VI — die-3`. III and VI cannot coincide, nor can die-2 and die-3.
   Compatible orientations put die-2 away from the edges. At this board,
   die-2 narrows from all columns to {2,3,4}, and III loses column 3.
   The edge exclusions are inherent; the additional exclusions depend on
   the current candidates.

3. **Packing separate groups into the shapes row.** `◇ — + — □` and
   `▽ — pentagon — △`, with no shared symbol. The second group occupies
   three consecutive shape positions; the first needs two shape positions
   two columns apart. They cannot overlap. Both centers (+ and pentagon)
   narrow to {2,5}; the four endpoints lose columns 2 and 5. These restrictions
   hold even without narrowed candidates. Triangle also loses column 3
   because of the current board. This pass removes 13 candidates at once.

4. **Two triples sharing an endpoint.** `I — VI — die-3` and
   `die-3 — = — IV`. I, VI, and IV must occupy different Roman-numeral
   positions. The pass leaves I in {2,5}, VI and die-3 in {3,4}, = in {2,5},
   and IV in {1,6}. Some restrictions follow from the two triples alone;
   others need the current domains. There are only two surviving joint
   assignments at this point.

5. **Candidate-based row reservation.** `die-3 < ▽` and `◇ — + — □`.
   The current candidates have ▽ in {4,6} and + in {2,5}. Putting + at 5
   would put diamond and square in columns 4 and 6, leaving no place for ▽.
   Therefore + goes in column 2, and diamond/square occupy {1,3}.
   This deduction depends entirely on the narrowed board, and the clues
   share no symbol. Ordinary propagation then finishes the puzzle.

This supports treating at least some free pair passes differently: the first
is a direct geometric observation, while the third packs five shape symbols
using two separate clues. However, these examples alone do not calibrate a
numerical cost for either pattern.

The player's assessment was that the current two-skull rating is low and the
seven-skull rating without pairs is probably too high. That assessment followed
seeing both predictions; it was not a blind rating experiment.

## Reproducing and inspecting deductions

Run from the repository root:

```
deno run --allow-read=logos.js analysis/two-clue-catalogue.js 28311466 a56f91ef
```

Output is JSONL, one record per seed, containing clues and all ten search
routes. Symbol labels have a one-based row prefix; clue indices are zero-based.
Each pass records the pair, its shared symbols and row links, its input
candidates, its surviving-assignment count, and each changed symbol's before
and after positions. Removal fields are:

- `inherent`: impossible in the full joint tuple table, before filtering by
  the candidate board (can include restrictions from either clue alone).
- `needsCandidates`: supported in that table but unsupported on this board.
- `needsRowUniqueness`: supported on this board if row uniqueness is ignored.

The first two partition the actual removals; the third is an independent
property. It ignores all row-uniqueness checks among the pair's symbols,
including checks within a clue. It does not ignore shared-symbol agreement.

The tool wraps the production pair application function to observe successful
passes; it does not replace the deductions or alter the rating. Its recorded
mean pair counts and bottleneck counts were checked against the uninstrumented
ratings for all 1,000 sample puzzles. No game behavior or rating version changes.
