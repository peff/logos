import { deductionRound, measureRounds, roundDifficultyLevel, roundDifficultyCutoffs } from "./rounds.js";

function assert(value, message = "assertion failed") {
	if (!value) throw new Error(message);
}
const puzzle = (rows, width, clues = []) => ({
	rows: Array.from({length: rows}, () => ({slots: Array(width).fill({})})), clues,
});

Deno.test("parallel clues cannot consume each other's changes in the same round", () => {
	const first = {constrain(d) { d[0][0] &= 1; }};
	const second = {constrain(d) { if (d[0][0] === 1) d[1][0] &= 1; }};
	const before = [[3, 3], [3, 3]];
	const expected = [[1, 3], [3, 3]];
	for (const clues of [[first, second], [second, first]]) {
		const p = puzzle(2, 2, clues);
		const after = deductionRound(p, before);
		assert(JSON.stringify(after) === JSON.stringify(expected));
		assert(JSON.stringify(deductionRound(p, after)) === '[[1,2],[1,3]]');
	}
	assert(JSON.stringify(before) === '[[3,3],[3,3]]', "input was mutated");
});

Deno.test("row implications wait for the next frozen round", () => {
	const p = puzzle(1, 3);
	const before = [[3, 6, 6]];
	const after = deductionRound(p, before);
	assert(JSON.stringify(after) === '[[1,6,6]]', "sole column candidate was not placed");
	const four = puzzle(1, 4);
	const first = deductionRound(four, [[1, 3, 14, 14]]);
	assert(JSON.stringify(first) === '[[1,2,14,14]]');
	assert(JSON.stringify(deductionRound(four, first)) === '[[1,2,12,12]]',
	       "row singleton consequences did not wait for the next round");
});

Deno.test("givens are round zero and rounds without placements are counted", () => {
	const given = {applyInitialState: true, constrain(d) { d[0][3] &= 8; }};
	const narrowing = {constrain(d) {
		if (d[0][0] & 4) d[0][0] &= 3;
		else d[0][0] &= 1;
		if (d[0][0] === 1) d[0][1] &= 2;
	}};
	const result = measureRounds(puzzle(1, 4, [given, narrowing]));
	assert(result.placementRounds[0][3] === 0);
	assert(result.maxRoundsWithoutPlacement === 1);
	assert(result.rounds[0].placements.length === 0);
});

Deno.test("a stalled or contradictory position is not reported as solved", () => {
	for (const domains of [[[3, 3]], [[1, 1]]]) {
		let threw = false;
		try { measureRounds(puzzle(1, 2), domains); } catch (_) { threw = true; }
		assert(threw);
	}
	const solved = measureRounds(puzzle(1, 2), [[1, 2]]);
	assert(solved.rounds.length === 0 && solved.maxRoundsWithoutPlacement === 0);
});

Deno.test("generated puzzles solve independently of clue order without changing inputs", async () => {
	const source = await Deno.readTextFile("logos.js");
	const game = new Function("document", source + "\nreturn {puzzleFromSeed,seedRandom};")({addEventListener() {}});
	const random = game.seedRandom(0x20260929);
	const seeds = [0x555dd3ae, 0xb73aa28a, 0xec29e0c8, 0x02b839f1];
	for (let i = 0; i < 100; i++) seeds.push(Math.floor(random() * 0x100000000));
	for (const seed of seeds) {
		const p = game.puzzleFromSeed(seed);
		const result = measureRounds(p);
		const reverse = measureRounds({...p, clues: p.clues.slice().reverse()});
		assert(JSON.stringify(result) === JSON.stringify(reverse), "clue order changed rounds");
		for (let row = 0; row < p.rows.length; row++)
			for (let col = 0; col < p.rows[row].slots.length; col++)
				assert(result.domains[row][p.rows[row].slots[col].value] === 1 << col);
		const before = JSON.stringify(result.domains);
		assert(measureRounds(p, result.domains).rounds.length === 0);
		assert(JSON.stringify(result.domains) === before);
	}
});

Deno.test("round breadth groups target reductions and deduplicates identical clues", () => {
	const clue = {constrain(d) {
		if (d[0][0] === 15) d[0][0] &= 3;
		else if (d[0][0] !== 1) d[0][0] &= 1;
		else if (d[0][1] !== 2) d[0][1] &= 2;
		else d[0][2] &= 4;
	}};
	const single = measureRounds(puzzle(1, 4, [clue]));
	const duplicate = measureRounds(puzzle(1, 4, [clue, clue]));
	assert(JSON.stringify(single) === JSON.stringify(duplicate));
	assert(single.rounds[0].observations === 1);
	assert(single.rounds[0].placements.length === 0);
	assert(single.roundScarcity === 1);
	assert(single.automaticOnlyRounds === 1);
});

Deno.test("distinct overlapping reductions are separate observations on a frozen round", () => {
	const first = {constrain(d) { d[0][0] &= 3; }};
	const second = {constrain(d) { d[0][0] &= 5; }};
	const finish = {constrain(d) { if (d[0][0] === 1) d[0][1] &= 2; }};
	const result = measureRounds(puzzle(1, 3, [first, second, finish]));
	assert(result.rounds[0].observations === 2);
	assert(result.rounds[0].placements.length === 1);
	assert(result.roundScarcity === 0, "placement round contributed to scarcity");
});

Deno.test("automatic-only rounds are counted without contributing to scarcity", () => {
	const result = measureRounds(puzzle(1, 3), [[1, 3, 6]]);
	assert(result.automaticOnlyRounds === result.rounds.length);
	assert(result.roundScarcity === 0);
	assert(result.rounds.every(round => round.observations === 0));
});

Deno.test("provisional round labels use unrounded scores and promote boundary ties", () => {
	const {medium, hard} = roundDifficultyCutoffs;
	assert(roundDifficultyLevel(medium - 1e-10) === "easy");
	assert(roundDifficultyLevel(medium) === "medium");
	assert(roundDifficultyLevel(hard - 1e-10) === "medium");
	assert(roundDifficultyLevel(hard) === "hard");
});
