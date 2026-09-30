// Experimental shortest path in the scorer's observation graph. Row closure
// costs nothing. A budget limits expanded states, including reopened states.
export function searchPuzzle(game, puzzle, {budget = 10000, domains} = {}) {
	if (!Number.isSafeInteger(budget) || budget < 1)
		throw new Error("search budget must be a positive safe integer");
	const started = performance.now();
	const copy = d => d.map(row => row.slice());
	const full = (1 << puzzle.rows[0].slots.length) - 1;
	const initial = domains ? copy(domains) : puzzle.rows.map(row => row.slots.map(() => full));
	if (!domains)
		for (const clue of puzzle.clues)
			if (clue.applyInitialState) clue.constrain(initial, full);
	// Reconstruct placements from candidates so the memo key needs only domains.
	const close = d => game.drainForcedProofSteps(d, d.map(() => 0));
	close(initial);
	const solved = d => d.every(row => row.every(bits => bits && !(bits & (bits - 1))) &&
		new Set(row).size === row.length);
	const next = (d, move) => {
		const after = copy(d);
		after[move.row][move.symbol] = move.after;
		close(after);
		return after;
	};
	const priority = move => 2 * move.tier + (move.placement ? 0 : 1);
	// Establish a completed upper bound even when the graph search is cut off.
	let best;
	for (let route = 0; route < 5; route++) {
		const random = game.seedRandom(Math.imul(route + 1, 0x9e3779b9));
		let d = copy(initial);
		const path = [];
		while (!solved(d)) {
			const moves = game.difficultyOpportunities(puzzle, d);
			if (!moves.length) throw new Error("search route stalled");
			const rank = Math.min(...moves.map(priority));
			const choices = moves.filter(move => priority(move) === rank);
			const move = choices[Math.floor(random() * choices.length)];
			path.push(move);
			d = next(d, move);
		}
		if (!best || path.length < best.length) best = path;
	}
	const baseline = best.length;
	const seen = new Map();
	const path = [];
	let expanded = 0, duplicates = 0, exhausted = false;
	function visit(d) {
		if (solved(d)) {
			if (path.length < best.length) best = path.slice();
			return;
		}
		// Every unfinished board requires at least one more observation.
		if (path.length + 1 >= best.length) return;
		const key = String.fromCharCode(...d.flat());
		const previous = seen.get(key);
		if (previous !== undefined && previous <= path.length) {
			duplicates++;
			return;
		}
		if (expanded >= budget) { exhausted = true; return; }
		seen.set(key, path.length);
		expanded++;
		const moves = game.difficultyOpportunities(puzzle, d).sort((a, b) => priority(a) - priority(b));
		for (const move of moves) {
			path.push(move);
			visit(next(d, move));
			path.pop();
			if (exhausted) return;
		}
	}
	visit(initial);
	return {baseline, steps: best.length, path: best, optimal: !exhausted,
		expanded, states: seen.size, duplicates, budget,
		elapsedMs: performance.now() - started};
}
