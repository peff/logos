import {
	Logos, assert, makePuzzle, puzzleSignature,
} from "./helpers.js";

Deno.test("puzzle difficulty rates generated puzzles without changing play state", () => {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.startTimer = function() {};
	for (const [seed, level] of [[0x98079244, "easy"],
		[0xc549b7c4, "medium"], [0xe2a689dd, "hard"],
		[0x0e9f4c26, "easy"], [0x4e233909, "hard"],
		[0x0a568040, "easy"], [0xb91f28c7, "medium"]]) {
		puzzle.newGame(seed);
		const before = puzzleSignature(puzzle);
		const rating = Logos.puzzleDifficulty(puzzle);
		assert(rating.level == level);
		assert(puzzleSignature(puzzle) == before);
		// Rating describes the puzzle, not the remaining work on the board.
		const slot = puzzle.rows[0].slots[0];
		slot.choose(slot.value);
		const progressed = puzzleSignature(puzzle);
		assert(JSON.stringify(Logos.puzzleDifficulty(puzzle)) == JSON.stringify(rating));
		assert(puzzleSignature(puzzle) == progressed);
	}
});

Deno.test("placement-first composite uses score boundaries without rounding", () => {
	for (const [excessDiscards, scarcity, score, level] of [
		[0, 0, 0, "easy"], [46.99, 0, 46.99, "easy"],
		[12, 7, 47, "medium"], [0, 10, 50, "medium"],
		[69.99, 0, 69.99, "medium"], [20, 10, 70, "hard"],
		[50, 30, 200, "hard"],
	]) {
		const rating = Logos.difficultyRating({excessDiscards, scarcity});
		assert(rating.score == score && rating.level == level);
	}
});

Deno.test("opportunities include full candidate reductions and placements", () => {
	const opportunities = Logos.difficultyOpportunities;
	const puzzle = makePuzzle(2);
	const clue = new Logos.ColumnClue(puzzle);
	puzzle.clues = [clue];
	const r = puzzle.rows.indexOf(clue.tRow);
	const other = puzzle.rows.indexOf(clue.bRow);
	const a = clue.tRow.slots[clue.col].value;
	const b = clue.bRow.slots[clue.col].value;
	const domains = [Array(6).fill(63), Array(6).fill(63)];
	domains[r][a] = 3;
	let moves = opportunities(puzzle, domains);
	assert(moves.length == 1);
	assert(moves[0].row == other && moves[0].symbol == b);
	assert(moves[0].after == 3 && !moves[0].placement);
	domains[r][a] = 1;
	moves = opportunities(puzzle, domains);
	assert(moves.length == 1 && moves[0].placement);
	assert(moves[0].after == 1);
});

Deno.test("seed reconstruction matches gameplay without changing the active puzzle", () => {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	puzzle.startTimer = function() {};
	for (const seed of [0, 0xffffffff, 0x98079244, 0xe2a689dd]) {
		puzzle.newGame(seed);
		const before = puzzleSignature(puzzle);
		const reconstructed = Logos.puzzleFromSeed(seed);
		const signature = model => {
			const result = JSON.parse(puzzleSignature(model));
			for (const clue of result.clues) delete clue.rendered;
			return JSON.stringify(result);
		};
		assert(signature(puzzle) == signature(reconstructed), "seed reconstruction differs");
		assert(JSON.stringify(Logos.puzzleDifficulty(puzzle)) ==
		       JSON.stringify(Logos.puzzleDifficulty(reconstructed)));
		assert(before == puzzleSignature(puzzle), "reconstruction changed the active board");
	}
});

Deno.test("excess discards accumulate across stretches after each allowance", () => {
	for (const [seed, excess, level] of [
		["e36efbeb", 17.7, "medium"],
		["eeaf9adc", 13.5, "medium"],
		["18530f24", 0.1, "easy"],
		["67d6cd2b", 0, "easy"],
	]) {
		const metrics = Logos.measureDifficulty(Logos.puzzleFromSeed(parseInt(seed, 16)));
		assert(metrics.excessDiscards == excess,
		       "excess discards differ from independently recorded route stretches");
		assert(Logos.difficultyRating(metrics).level == level);
	}
});

Deno.test("difficulty prioritizes placements and row cascades", () => {
	const domains = [[15, 3, 6, 12], [15, 15, 15, 15]];
	const placements = [0, 0];
	const before = JSON.stringify({domains, placements});
	const discard = {row: 1, symbol: 1, after: 7, placement: false};
	const place = {row: 1, symbol: 0, after: 1, placement: true};
	const cascade = {row: 0, symbol: 0, after: 12, placement: false};
	assert(Logos.placementDifficultyChoices(domains, placements, [discard, place])[0] === place);
	assert(Logos.placementDifficultyChoices(domains, placements, [place, cascade])[0] === cascade);
	const otherDiscard = {...discard, symbol: 2};
	assert(Logos.placementDifficultyChoices(domains, placements, [discard, otherDiscard]).length === 2);
	assert(JSON.stringify({domains, placements}) === before, "lookahead mutated the board");
});

Deno.test("full difficulty observations do not truncate candidate reductions to anchored ones", () => {
	const puzzle = {clues: [{constrain(d) { d[0][0] &= d[0][1] === 3 ? 1 : 3; }}]};
	const domains = [[15, 3, 15, 15]];
	assert(Logos.difficultyOpportunities(puzzle, domains)[0].after === 1);
});

Deno.test("full solver distinguishes unique, ambiguous, impossible and unfinished searches", function() {
	const puzzle = Logos.puzzleFromSeed(0);
	assert(Logos.countSolutions(puzzle, puzzle.clues) === 1);
	assert(Logos.countSolutions(puzzle, []) === 2);
	assert(Logos.countSolutions(puzzle, puzzle.clues, 0) === null);
	assert(Logos.countSolutions(puzzle, [{ constrain(domains) {
		domains[0][0] = 0;
		return false;
	} }]) === 0);
});

Deno.test("extreme pruning preserves uniqueness but defeats deduction", function() {
	let found = 0;
	for (let seed = 0; seed < 30; seed++) {
		const puzzle = Logos.puzzleFromSeed(seed);
		assert(Logos.cluesSolve(puzzle, puzzle.clues));
		const indices = Logos.extremeClueIndices(puzzle);
		if (!indices)
			continue;
		found++;
		const clues = indices.map(index => puzzle.clues[index]);
		assert(Logos.countSolutions(puzzle, clues) === 1);
		assert(!Logos.cluesSolve(puzzle, clues));
	}
	assert(found > 0 && found < 30, "exercise both accepted and rejected candidates");
});

Deno.test("extreme skull ratings use weighted branch costs and leave incomplete searches unrated", function() {
	for (const [seed, count] of [[0xd40791eb, 1], [0xac185eca, 1], [0x39c, 1], [0x3c5, 2], [0x59, 6], [0xd505b84e, 12]]) {
		const puzzle = Logos.puzzleFromSeed(seed);
		puzzle.clues = Logos.extremeClueIndices(puzzle).map(index => puzzle.clues[index]);
		const before = puzzleSignature(puzzle);
		const rating = Logos.measureExtremeDifficulty(puzzle, 10000, 10, { twoClueDeductions: false });
		assert(rating.complete && rating.skulls === count);
		if (seed === 0x39c) {
			assert(Math.abs(rating.score - 1271.3197213409258) < 1e-8);
			assert(rating.bottlenecks === 5.4, "rating did not average all ten routes");
			assert(JSON.stringify(Logos.measureExtremeDifficulty(puzzle, 10000, 10, { twoClueDeductions: false })) === JSON.stringify(rating));
		}
		assert(Logos.extremeSkulls(rating).includes(`aria-label="${count} skull${count === 1 ? "" : "s"}"`));
		assert(puzzleSignature(puzzle) === before, "rating mutated the puzzle");
		const incomplete = Logos.measureExtremeDifficulty(puzzle, 0, 10, { twoClueDeductions: false });
		assert(!incomplete.complete && Logos.extremeSkulls(incomplete) === "(?)");
	}
	assert(Logos.extremeSkulls({ complete: true, skulls: 22 }).includes(" × 22"));
	assert(!Logos.measureExtremeDifficulty({ rows: [{ slots: [{}, {}] }], clues: [] }).complete);
});

Deno.test("extreme bottleneck costs measure branch work separately from its assumption", function() {
	const puzzle = Logos.puzzleFromSeed(0xac185eca);
	puzzle.clues = Logos.extremeClueIndices(puzzle).map(index => puzzle.clues[index]);
	const before = puzzleSignature(puzzle);
	const rating = Logos.traceExtremeDifficulty(puzzle, 10000, { twoClueDeductions: false, measureCost: true });
	assert(rating.complete && rating.bottlenecks === 4);
	assert(rating.costs.length === rating.bottlenecks);
	const candidates = domains => domains.flat().reduce((n, bits) =>
		n + Logos.countBits(bits), 0);
	const domains = puzzle.rows.map(() => Array(6).fill(63));
	assert(Logos.cluesAllow(puzzle, puzzle.clues, domains));
	for (const cost of rating.costs) {
		const assumed = domains.map(row => row.slice());
		assumed[cost.row][cost.symbol] = 1 << cost.column;
		const start = candidates(assumed), work = { passes: 0 };
		assert(!Logos.cluesAllow(puzzle, puzzle.clues, assumed, work));
		assert(cost.eliminations === start - candidates(assumed));
		assert(cost.passes === work.passes && cost.passes > 0);
		const remaining = candidates(domains);
		domains[cost.row][cost.symbol] &= ~(1 << cost.column);
		assert(Logos.cluesAllow(puzzle, puzzle.clues, domains));
		assert(cost.progress === remaining - candidates(domains));
	}
	assert(candidates(domains) === 36);
	const options = { twoClueDeductions: false, measureCost: true, route: 3 };
	assert(JSON.stringify(Logos.traceExtremeDifficulty(puzzle, 10000, options)) ===
		JSON.stringify(Logos.traceExtremeDifficulty(puzzle, 10000, options)));
	const incomplete = Logos.traceExtremeDifficulty(puzzle, 0, options);
	assert(!incomplete.complete && incomplete.costs.length === 0);
	assert(puzzleSignature(puzzle) === before);
});

Deno.test("nested fallback rates formerly stalled extremes without changing single-level scores", function() {
	for (const seed of [0x4c3f2a56, 0x78c9d796]) {
		const puzzle = Logos.puzzleFromSeed(seed);
		puzzle.clues = Logos.extremeClueIndices(puzzle).map(index => puzzle.clues[index]);
		const rating = Logos.measureExtremeDifficulty(puzzle, 10000, 10, { depthLimit: 1, twoClueDeductions: false });
		assert(!rating.complete && rating.stalled && rating.skulls === Infinity);
		const nested = Logos.measureExtremeDifficulty(puzzle, 10000, 10, { twoClueDeductions: false });
		assert(nested.complete && nested.maxDepth === 2);
		assert(nested.skulls === (seed === 0x4c3f2a56 ? 20 : 18));
		const expected = seed === 0x4c3f2a56 ? 29498.95744725509 : 26597.65826765664;
		assert(Math.abs(nested.score - expected) < 1e-8);
		const html = Logos.extremeSkulls(rating);
		assert(html.includes('aria-label="Infinite skulls"') && html.includes(' × ∞'));
		assert(html.includes('href="#extreme-skull-icon"'));
		const interrupted = Logos.measureExtremeDifficulty(puzzle, 0, 10, { twoClueDeductions: false });
		assert(!interrupted.complete && !interrupted.stalled);
		assert(Logos.extremeSkulls(interrupted) === "(?)");
	}
});

Deno.test("nested search continues past productive but correct outer guesses", function() {
	// The top four distinct outer boards all reach valid solutions. The
	// scorer must explore lower-ranked boards to prove a failed assumption.
	for (const [seed, skulls, score] of [
		[0xcd7c02f4, 17, 24091.891587492973],
		[0x76d8e094, 16, 23766.532458545822],
	]) {
		const puzzle = Logos.puzzleFromSeed(seed);
		puzzle.clues = Logos.extremeClueIndices(puzzle).map(i => puzzle.clues[i]);
		const rating = Logos.measureExtremeDifficulty(puzzle);
		assert(rating.complete && rating.maxDepth === 2 && rating.skulls === skulls);
		assert(Math.abs(rating.score - score) < 1e-8);
	}
});

Deno.test("nested costs replay as scoped contradictions with additive work", function() {
	const count = d => d.flat().reduce((sum, bits) => sum + Logos.countBits(bits), 0);
	for (const seed of [0x4c3f2a56, 0x78c9d796]) {
		const puzzle = Logos.puzzleFromSeed(seed);
		puzzle.clues = Logos.extremeClueIndices(puzzle).map(i => puzzle.clues[i]);
		function verify(base, cost) {
			const d = base.map(row => row.slice());
			assert(d[cost.row][cost.symbol] & (1 << cost.column));
			d[cost.row][cost.symbol] = 1 << cost.column;
			const before = count(d);
			let valid = Logos.cluesAllow(puzzle, puzzle.clues, d);
			let score = cost.eliminations ** 1.5, depth = 1;
			for (const child of cost.children || []) {
				assert(valid, "child proof continued after a contradiction");
				const checked = verify(d, child);
				score += checked.score;
				depth = Math.max(depth, checked.depth + 1);
				d[child.row][child.symbol] &= ~(1 << child.column);
				valid = Logos.cluesAllow(puzzle, puzzle.clues, d);
			}
			assert(!valid, "certificate did not establish a contradiction");
			assert(cost.eliminations === before - count(d), "outer work included hypothetical inner work");
			assert(Math.abs(score - Logos.contradictionLemmaScore(cost)) < 1e-8);
			if (cost.maxDepth !== undefined)
				assert(cost.maxDepth === depth);
			return { score, depth };
		}
		const run = Logos.traceExtremeDifficulty(puzzle, 10000, { twoClueDeductions: false, measureCost: true });
		assert(run.complete && run.maxDepth === 2);
		const d = Array.from({ length: 6 }, () => Array(6).fill(63));
		assert(Logos.cluesAllow(puzzle, puzzle.clues, d));
		let nested = 0;
		for (const cost of run.costs) {
			const before = JSON.stringify(d);
			const checked = verify(d, cost);
			assert(JSON.stringify(d) === before, "certificate replay changed its parent");
			if (checked.depth > 1) nested++;
			d[cost.row][cost.symbol] &= ~(1 << cost.column);
			assert(Logos.cluesAllow(puzzle, puzzle.clues, d));
		}
		assert(nested === (seed === 0x4c3f2a56 ? 4 : 2));
		assert(count(d) === 36);
	}
});

Deno.test("recursive contradiction search respects depth and a shared work budget", function() {
	// An intentionally weak propagator notices the impossible first-row
	// choice only after both other rows are fixed. It needs three levels.
	const puzzle = { rows: Array.from({ length: 3 }, () => ({ slots: [{}, {}] })),
		clues: [{ constrain(d) {
			if (d[0][0] === 1 && Logos.countBits(d[1][0]) === 1 && Logos.countBits(d[2][0]) === 1) {
				d[0][0] = 0;
				return true;
			}
			return false;
		} }] };
	const base = [[3, 3], [3, 3], [3, 3]], before = JSON.stringify(base);
	assert(!Logos.findContradictionLemma(puzzle, base, puzzle.clues, 2));
	const budget = { remaining: 12 };
	assert(!Logos.findContradictionLemma(puzzle, base, puzzle.clues, 3, budget));
	assert(budget.exhausted && budget.remaining < 0);
	const lemma = Logos.findContradictionLemma(puzzle, base, puzzle.clues, 3);
	assert(lemma && lemma.maxDepth === 3 && lemma.row === 0 && lemma.symbol === 0 && lemma.column === 0);
	assert(JSON.stringify(base) === before);
});

Deno.test("two-clue ratings remove assumptions without changing generated clues", function() {
	for (const [seed, score, deductions] of [
		[0xa56f91ef, 0, 1],
		[0, 4522.642702245086, 2.5],
	]) {
		const puzzle = Logos.puzzleFromSeed(seed);
		puzzle.clues = Logos.extremeClueIndices(puzzle).map(i => puzzle.clues[i]);
		const before = puzzleSignature(puzzle);
		assert(!Logos.cluesSolve(puzzle, puzzle.clues));
		const rating = Logos.measureExtremeDifficulty(puzzle);
		assert(rating.complete && Math.abs(rating.score - score) < 1e-8);
		assert(rating.pairDeductions === deductions);
		assert(puzzleSignature(puzzle) === before);
		if (!score) {
			assert(rating.skulls === 0 && rating.maxDepth === 0 && rating.bottlenecks === 0);
			assert(Logos.measureExtremeDifficulty(puzzle, 0).complete,
				"a deduction-only puzzle should not consume the assumption budget");
			const html = Logos.extremeSkulls(rating);
			assert(html.includes('aria-label="0 skulls"') && html.includes(' × 0'));
			assert(html.includes('href="#extreme-skull-icon"'));
		}
	}
});

Deno.test("two-clue rating costs replay after free pair deductions", function() {
	const puzzle = Logos.puzzleFromSeed(0);
	puzzle.clues = Logos.extremeClueIndices(puzzle).map(i => puzzle.clues[i]);
	const pairs = Logos.compileCluePairs(puzzle);
	const run = Logos.traceExtremeDifficulty(puzzle, 10000, { measureCost: true });
	const domains = Array.from({ length: 6 }, () => Array(6).fill(63));
	const count = d => d.flat().reduce((n, bits) => n + Logos.countBits(bits), 0);
	let deductions = 0;
	function propagate() {
		assert(Logos.cluesAllow(puzzle, puzzle.clues, domains));
		while (Logos.applyCluePairDeduction(pairs, domains)) {
			deductions++;
			assert(Logos.cluesAllow(puzzle, puzzle.clues, domains));
		}
		for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++)
			assert(domains[r][puzzle.rows[r].slots[c].value] & (1 << c));
	}
	propagate();
	for (const cost of run.costs) {
		const assumed = domains.map(row => row.slice()), work = { passes: 0 };
		assumed[cost.row][cost.symbol] = 1 << cost.column;
		const before = count(assumed);
		assert(!Logos.cluesAllow(puzzle, puzzle.clues, assumed, work));
		assert(cost.eliminations === before - count(assumed));
		assert(cost.passes === work.passes);
		domains[cost.row][cost.symbol] &= ~(1 << cost.column);
		propagate();
	}
	assert(count(domains) === 36 && deductions === run.pairDeductions);
});
