import {searchPuzzle} from './search.js';
const assert = (ok, message = 'assertion failed') => { if (!ok) throw Error(message); };
const puzzle = {rows: [{slots: Array(6).fill({})}], clues: []};
// A tiny observation graph: the first branch is longer, and both converge.
const graph = {63: [31, 15], 31: [7], 7: [3], 3: [1], 15: [3]};
const game = {
	seedRandom() { return () => 0; },
	drainForcedProofSteps() {},
	difficultyOpportunities(_p, d) {
		return (graph[d[0][0]] || []).map(after =>
			({row: 0, symbol: 0, after, tier: 1, placement: after === 1}));
	},
};
Deno.test('bounded search improves a route and proves a small graph shortest', () => {
	const domains = [[63]];
	const result = searchPuzzle(game, puzzle, {domains, budget: 100});
	assert(result.baseline === 4 && result.steps === 3 && result.optimal);
	assert(JSON.stringify(domains) === '[[63]]');
	assert(result.path.map(m => m.after).join() === '15,3,1');
});
Deno.test('exhausted budget retains a completed path without claiming optimality', () => {
	const result = searchPuzzle(game, puzzle, {domains: [[63]], budget: 1});
	assert(!result.optimal && result.expanded === 1 && result.steps === 4);
	assert(result.path.at(-1).after === 1);
});
Deno.test('search handles solved positions and rejects invalid budgets', () => {
	const result = searchPuzzle(game, puzzle, {domains: [[1]], budget: 1});
	assert(result.optimal && result.steps === 0 && result.expanded === 0);
	for (const budget of [0, -1, 1.5, NaN, Infinity]) {
		let threw = false;
		try {searchPuzzle(game, puzzle, {budget});} catch (_) {threw = true;}
		assert(threw);
	}
});
Deno.test('generated search paths replay to the solution including free row closure', async () => {
	const source = await Deno.readTextFile('logos.js');
	const real = new Function('document', source + '\nreturn {puzzleFromSeed,seedRandom,difficultyOpportunities,drainForcedProofSteps};')({addEventListener(){}});
	for (const seed of [0x67d6cd2b, 0x555dd3ae, 0xec29e0c8]) {
		const p = real.puzzleFromSeed(seed);
		const result = searchPuzzle(real, p, {budget: 100});
		const domains = p.rows.map(row => row.slots.map(() => 63));
		for (const clue of p.clues) if (clue.applyInitialState) clue.constrain(domains, 63);
		const close = () => real.drainForcedProofSteps(domains, domains.map(() => 0));
		close();
		for (const move of result.path) {
			assert(real.difficultyOpportunities(p, domains).some(m =>
				m.row === move.row && m.symbol === move.symbol && m.after === move.after));
			domains[move.row][move.symbol] = move.after;
			close();
		}
		p.rows.forEach((row, r) => row.slots.forEach((slot, col) => assert(domains[r][slot.value] === 1 << col)));
		assert(result.steps <= result.baseline && result.expanded <= 100);
	}
});
Deno.test('a state reached later by a shorter path is reopened', () => {
	const edges = {63: [31, 7], 31: [15], 15: [7], 7: [3], 3: [1]};
	const adapter = {...game, difficultyOpportunities(_p, d) {
		return (edges[d[0][0]] || []).map(after =>
			({row: 0, symbol: 0, after, tier: 1, placement: after === 1}));
	}};
	const result = searchPuzzle(adapter, puzzle, {domains: [[63]], budget: 100});
	assert(result.optimal && result.baseline === 5 && result.steps === 3);
	assert(result.expanded > result.states, 'shorter arrival was not expanded again');
});
