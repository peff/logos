// Compare the legacy skull scale with current effort on a reproducible
// sample of extreme puzzles. Run from the repository root:
// deno run --allow-read=logos.js analysis/extreme-comparison.js [sample-size]
const source = await Deno.readTextFile(new URL('../logos.js', import.meta.url));
const game = new Function('document', source + `\nreturn {
	puzzleFromSeed, extremeClueIndices, measureExtremeDifficulty
};`)({ addEventListener() {} });
const count = Number(Deno.args[0] || 150);
if (!Number.isInteger(count) || count < 1) throw new Error('expected a positive sample size');
let state = 0x731b9a2d;
function nextSeed() {
	state ^= state << 13;
	state ^= state >>> 17;
	state ^= state << 5;
	return state >>> 0;
}
const references = [0xac185eca, 0xaac80a9c];
console.log('seed,group,skulls,effort,old_score,scarcity,excess_discards,real_score,supposition_score,status,suppositions');
function measure(seed, group, puzzle) {
	const r = game.measureExtremeDifficulty(puzzle, 20000, 10, { compareLegacy: true });
	const e = r.estimated ? null : r.effort;
	const status = r.stalled ? 'stalled' : e ? 'complete' : 'incomplete';
	console.log([seed.toString(16).padStart(8, '0'), group, r.legacySkulls,
		e?.score, r.legacyScore, e?.scarcity, e?.excessDiscards,
		e?.realScore, e?.hypotheticalScore, status, e?.suppositions].join(','));
}
function extreme(seed) {
	const p = game.puzzleFromSeed(seed);
	const indices = game.extremeClueIndices(p);
	if (!indices) return null;
	p.clues = indices.map(i => p.clues[i]);
	return p;
}
let accepted = 0, attempted = 0;
while (accepted < count) {
	const seed = nextSeed();
	if (references.includes(seed)) continue;
	attempted++;
	const puzzle = extreme(seed);
	if (!puzzle) continue;
	measure(seed, 'sample', puzzle);
	if (++accepted % 10 === 0) console.error(`${accepted}/${count} extreme puzzles rated (${attempted} seeds tried)`);
}
for (const seed of references) measure(seed, 'reference', extreme(seed));
