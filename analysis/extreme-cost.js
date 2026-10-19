// Experimental bottleneck measurements, independent of narrated proofs.
// Run with: deno run --allow-read=logos.js analysis/extreme-cost.js SEED...
const source = await Deno.readTextFile(new URL("../logos.js", import.meta.url));
const game = new Function("document", source + `\nreturn {
	parseSeed, puzzleFromSeed, extremeClueIndices, traceExtremeDifficulty
};`)({ addEventListener() {} });

if (!Deno.args.length)
	throw new Error("usage: extreme-cost.js HEX_SEED...");
for (const input of Deno.args) {
	const seed = game.parseSeed(input);
	if (seed === null)
		throw new Error(`invalid seed: ${input}`);
	const puzzle = game.puzzleFromSeed(seed);
	const indices = game.extremeClueIndices(puzzle);
	if (!indices)
		throw new Error(`no extreme variant: ${input}`);
	puzzle.clues = indices.map(i => puzzle.clues[i]);
	const start = performance.now(), routes = [];
	for (let route = 0; route < 10; route++) {
		const rating = game.traceExtremeDifficulty(puzzle, 10000,
			{ route, measureCost: true });
		routes.push({ ...rating,
			eliminations: rating.costs.reduce((sum, c) => sum + c.eliminations, 0),
			score: rating.costs.reduce((sum, c) => sum + c.eliminations ** 1.5, 0),
		});
	}
	const ms = performance.now() - start;
	const mean = key => routes.reduce((sum, r) => sum + r[key], 0) / routes.length;
	// Do not mistake partial routes for low difficulty scores.
	const averages = routes.every(r => r.complete) ? {
		bottlenecks: mean("bottlenecks"), eliminations: mean("eliminations"),
		score: mean("score"),
	} : null;
	console.log(JSON.stringify({ seed: input, ms, averages, routes }));
}
