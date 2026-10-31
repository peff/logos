import { Logos, assert } from "./helpers.js";
const game = Logos;
const clueTuples = Logos.cluePairTuples;
const compilePairs = Logos.compileCluePairs;
const pairPass = Logos.applyCluePairDeduction;

Deno.test('clue tuple enumeration matches existing constraints on every assignment', () => {
	for (let seed = 0; seed < 20; seed++) {
		const puzzle = game.puzzleFromSeed(seed);
		for (const clue of puzzle.clues) {
			const slots = game.clueSlots(clue);
			const vars = [...new Set(slots.map(s => puzzle.rows.indexOf(s.row) * 6 + s.value))];
			const actual = new Set(clueTuples(puzzle, clue).filter(tuple =>
				tuple.every(([v, c]) => tuple.every(([w, d]) => v !== w || c === d)))
				.map(tuple => vars.map(v => tuple.find(([w]) => w === v)[1]).join(',')));
			function check(cols) {
				if (cols.length < vars.length) {
					for (let c = 0; c < 6; c++) check([...cols, c]);
					return;
				}
				const domains = Array.from({length: 6}, () => Array(6).fill(63));
				vars.forEach((v, i) => domains[v / 6 | 0][v % 6] = 1 << cols[i]);
				clue.constrain(domains, 63);
				const allowed = vars.every(v => domains[v / 6 | 0][v % 6]);
				assert(actual.has(cols.join(',')) === allowed, `tuple mismatch: ${seed}, ${clue.constructor.name}`);
			}
			check([]);
		}
	}
});

Deno.test('pair joins match brute force on restricted domains', () => {
	const puzzle = game.puzzleFromSeed(0xa56f91ef);
	puzzle.clues = game.extremeClueIndices(puzzle).map(i => puzzle.clues[i]);
	const pairs = compilePairs(puzzle);
	const domains = puzzle.rows.map(row => {
		const d = Array(6).fill(0);
		row.slots.forEach((s, c) => d[s.value] = (1 << c) | (1 << ((c + 1) % 6)) | (1 << ((c + 3) % 6)));
		return d;
	});
	let index = 0;
	for (let a = 0; a < puzzle.clues.length; a++) for (let b = a + 1; b < puzzle.clues.length; b++) {
		const ca = game.clueSlots(puzzle.clues[a]), cb = game.clueSlots(puzzle.clues[b]);
		if (!ca.some(s => cb.some(t => s.row === t.row))) continue;
		const pair = pairs[index++], expected = pair.variables.map(() => 0);
		function check(cols) {
			if (cols.length < pair.variables.length) {
				const v = pair.variables[cols.length];
				for (let c = 0; c < 6; c++) if (domains[v / 6 | 0][v % 6] & (1 << c)) check([...cols, c]);
				return;
			}
			for (let i = 0; i < cols.length; i++) for (let j = 0; j < i; j++)
				if ((pair.variables[i] / 6 | 0) === (pair.variables[j] / 6 | 0) && cols[i] === cols[j]) return;
			const d = structuredClone(domains);
			pair.variables.forEach((v, i) => d[v / 6 | 0][v % 6] = 1 << cols[i]);
			puzzle.clues[a].constrain(d, 63);
			puzzle.clues[b].constrain(d, 63);
			if (pair.variables.every(v => d[v / 6 | 0][v % 6])) cols.forEach((c, i) => expected[i] |= 1 << c);
		}
		check([]);
		const d = structuredClone(domains);
		pairPass([pair], d);
		assert(pair.variables.every((v, i) => d[v / 6 | 0][v % 6] === expected[i]), 'pair support mismatch');
	}
});
