// Compare the existing extreme rating with deductions from pairs of clues.
// deno run --allow-read=logos.js analysis/two-clue-cost.js [count=1000] [first-seed=0]
// Or: ... --seed a56f91ef
const source = await Deno.readTextFile(new URL('../logos.js', import.meta.url));
// Compare the legacy rating with the integrated two-clue pass.
const game = new Function('document', source + `
return { puzzleFromSeed, extremeClueIndices, clueSlots,
	traceExtremeDifficulty, contradictionLemmaScore,
	clueTuples: cluePairTuples, compilePairs: compileCluePairs,
	pairPass: applyCluePairDeduction };
`)({ addEventListener() {} });
const { clueTuples, compilePairs, pairPass } = game;

function rate(puzzle, pairs) {
	const start = performance.now();
	const routes = [];
	for (let route = 0; route < 10; route++) {
		const run = game.traceExtremeDifficulty(puzzle, 10000, {
			route, measureCost: true, twoClueDeductions: !!pairs, cluePairs: pairs,
		});
		routes.push({ complete: run.complete, stalled: !!run.stalled,
			bottlenecks: run.bottlenecks, maxDepth: run.maxDepth, deductions: run.pairDeductions,
			contradictionScore: run.costs.reduce((sum, cost) => sum + game.contradictionLemmaScore(cost), 0) });
	}
	const complete = routes.every(r => r.complete);
	const mean = key => routes.reduce((sum, r) => sum + r[key], 0) / routes.length;
	return { complete, stalled: routes.some(r => r.stalled),
		ms: performance.now() - start,
		contradictionScore: complete ? mean('contradictionScore') : null,
		deductions: mean('deductions'), bottlenecks: mean('bottlenecks'),
		maxDepth: Math.max(...routes.map(r => r.maxDepth)), routes };
}

export { game, clueTuples, compilePairs, pairPass, rate };

if (import.meta.main) {
	const explicit = Deno.args[0] === '--seed';
	const count = explicit ? 1 : Number(Deno.args[0] ?? 1000);
	let seed = parseInt(explicit ? Deno.args[1] : Deno.args[1] ?? '0', 16);
	if (!Number.isInteger(count) || count < 1 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
		throw new Error('expected a positive count and a hexadecimal seed');
	let found = 0, examined = 0;
	while (found < count && seed <= 0xffffffff) {
		const start = performance.now();
		const puzzle = game.puzzleFromSeed(seed);
		const indices = game.extremeClueIndices(puzzle);
		examined++;
		if (indices) {
			puzzle.clues = indices.map(i => puzzle.clues[i]);
			const baseline = rate(puzzle, null);
			const compileStart = performance.now();
			const pairs = compilePairs(puzzle);
			const compileMs = performance.now() - compileStart;
			const paired = rate(puzzle, pairs);
			console.log(JSON.stringify({ seed: seed.toString(16).padStart(8, '0'),
				baseline, paired, compileMs, totalMs: performance.now() - start }));
			found++;
			if (found % 50 === 0) console.error(`${found}/${count} extreme puzzles (${examined} seeds examined)`);
		} else if (explicit) throw new Error('seed has no extreme variant');
		seed++;
	}
	console.error(`Finished: ${found} extreme puzzles from ${examined} seeds`);
}
