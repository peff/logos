// Recompute both ratings for a run-history export. Preserve exclusion reasons.
// deno run --allow-read=logos.js,analysis/scores analysis/extreme-times.js analysis/scores
const source = await Deno.readTextFile(new URL('../logos.js', import.meta.url));
const game = new Function('document', source + `\nreturn {
	puzzleFromSeed, extremeClueIndices, measureExtremeDifficulty
};`)({ addEventListener() {} });
const runs = JSON.parse(await Deno.readTextFile(Deno.args[0] || 'analysis/scores'));
const extremes = runs.filter(r => r.extreme).sort((a, b) => a.date - b.date || a.id - b.id);
const seenWins = new Set(), prior = new Map();
console.log('id,seed,date,minutes,outcome,included,reason,prior_runs,old_score,effort,skulls,scarcity,excess_discards,suppositions');
for (const r of extremes) {
	const seed = r.seed?.toString(16).padStart(8, '0');
	const previous = prior.get(seed) || 0;
	prior.set(seed, previous + 1);
	let reason = r.multiplayer ? 'multiplayer' : r.outcome !== 'won' ? 'not_won' :
		!Number.isFinite(r.elapsed) || r.elapsed <= 0 ? 'untimed' :
		r.generatorVersion !== 1 || r.rows !== 6 || r.columns !== 6 || !Number.isInteger(r.seed) ? 'unsupported' :
		seenWins.has(seed) ? 'repeat_win' : '';
	let rating;
	if (!reason) {
		seenWins.add(seed);
		const p = game.puzzleFromSeed(r.seed);
		const indices = game.extremeClueIndices(p);
		if (!indices) reason = 'no_extreme_variant';
		else {
			p.clues = indices.map(i => p.clues[i]);
			rating = game.measureExtremeDifficulty(p, 20000, 10, { compareLegacy: true });
			if (!rating.effort || rating.estimated) reason = rating.stalled ? 'rating_stalled' : 'rating_incomplete';
		}
		console.error(`${seed}: ${reason || 'rated'}`);
	}
	console.log([r.id, seed, new Date(r.date).toISOString(),
		Number.isFinite(r.elapsed) ? r.elapsed / 60000 : '', r.outcome,
		reason ? 0 : 1, reason, previous, rating?.legacyScore, rating?.effort?.score,
		rating?.legacySkulls, rating?.effort?.scarcity, rating?.effort?.excessDiscards,
		rating?.effort?.suppositions].join(','));
}
