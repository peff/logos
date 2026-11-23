// Survey wrong placements and removals of correct tiles at
// the start and after ordinary deductions. Emit reproducible failures as
// JSON lines on stdout; progress and totals go to stderr.
// See analysis/README.md for exhaustive and sampled runs.
const source = await Deno.readTextFile(new URL('../logos.js', import.meta.url));
const game = new Function('document', source + `\nreturn {
	puzzleFromSeed, extremeClueIndices, drainForcedProofSteps, nextHintStep,
	applyPencilMark, propagatePencilRow, buildContradictionSteps, countBits,
	positionContradiction, proofStepSupported, applyProofStep
};`)({ addEventListener() {} });
function checkWalkthrough(puzzle, base, basePlacements, steps) {
	let domains = base.map(row => row.slice()), placements = basePlacements.slice();
	const scopes = [];
	for (const step of steps) {
		if (step.lemmaStage === 'start') {
			scopes.push({ domains: domains.map(row => row.slice()), placements: placements.slice(), trial: step.lemmaTrial });
		} else if (step.lemmaStage === 'end') {
			const scope = scopes.pop();
			domains = scope.domains;
			placements = scope.placements;
			domains[scope.trial.row][scope.trial.symbol] &= ~(1 << scope.trial.column);
		} else if (step.contradiction || step.lemmaStage === 'contradiction') {
			if (!game.positionContradiction(puzzle, domains)) throw new Error('Unjustified contradiction');
		} else {
			if (step.lemmaStage !== 'assumption' && !game.proofStepSupported(puzzle, step, domains, placements))
				throw new Error('Unsupported deduction');
			game.applyProofStep(domains, placements, step);
		}
		if (JSON.stringify(domains) !== JSON.stringify(step.domains) ||
		    JSON.stringify(placements) !== JSON.stringify(step.placements))
			throw new Error('Incorrect proof snapshot');
	}
	if (scopes.length || !steps.at(-1).contradiction) throw new Error('Unfinished contradiction proof');
}
// Keep seed generation and move sampling separate from the puzzle RNG so
// changing the sample size does not change which puzzles we examine.
function random(seed) {
	return () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 0x100000000;
	};
}
function shuffle(values, rng) {
	for (let i = values.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[values[i], values[j]] = [values[j], values[i]];
	}
	return values;
}
let extreme = false, sample = null, seedCount = null, maxSteps = 2000;
const seeds = [];
for (let i = 0; i < Deno.args.length; i++) {
	const arg = Deno.args[i];
	if (arg === '--extreme') extreme = true;
	else if (['--sample', '--seeds', '--max-steps'].includes(arg)) {
		const value = Number(Deno.args[++i]);
		if (!Number.isSafeInteger(value) || value < 1) throw new Error('Expected positive integer for ' + arg);
		if (arg === '--sample') sample = value;
		else if (arg === '--seeds') seedCount = value;
		else maxSteps = value;
	} else {
		if (!/^[0-9a-f]{1,8}$/i.test(arg)) throw new Error('Expected hexadecimal seed: ' + arg);
		seeds.push(arg);
	}
}
if (seedCount && seeds.length) throw new Error('Use either --seeds or explicit seeds');
if (!seedCount && !seeds.length)
	seeds.push(...(extreme ? ['4c3f2a56', '78c9d796', 'cd7c02f4', '76d8e094'] : ['0', '12345678', '5be42607', 'd57ecd6c']));
const seedRandom = random(0x53555050);
const total = { seeds: 0, failedSeeds: 0, positions: 0, explained: 0, immediate: 0, lemmas: 0, failures: 0, longest: 0, slowestMs: 0 };
const timings = [];
for (let attempt = 0; seedCount ? total.seeds < seedCount : attempt < seeds.length; attempt++) {
	if (seedCount && attempt >= seedCount * 100) throw new Error('Too few eligible puzzles');
	const hex = seedCount ? Math.floor(seedRandom() * 0x100000000).toString(16) : seeds[attempt];
	const seed = parseInt(hex, 16), puzzle = game.puzzleFromSeed(seed);
	if (extreme) {
		const indices = game.extremeClueIndices(puzzle);
		if (!indices) { console.error(hex + ': no Extreme variant'); continue; }
		puzzle.clues = indices.map(i => puzzle.clues[i]);
	}
	total.seeds++;
	const failuresBefore = total.failures;
	let base = puzzle.rows.map(() => Array(6).fill(63));
	let placements = Array(6).fill(0);
	for (const clue of puzzle.clues)
		if (clue.applyInitialState) clue.constrain(base, 63);
	game.drainForcedProofSteps(base, placements);
	const positions = [{ label: 'opening', domains: base }];
	let step;
	while ((step = game.nextHintStep(puzzle, base, placements))) {
		base = step.domains;
		placements = step.placements;
	}
	if (JSON.stringify(base) !== JSON.stringify(positions[0].domains))
		positions.push({ label: 'deductions', domains: base });
	// Balance opening/deduced boards and placements/removals instead of
	// letting the more numerous wrong placements dominate the sample.
	const groups = [];
	for (const position of positions) {
		const place = [], remove = [];
		for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
			const slot = puzzle.rows[row].slots[column];
			for (let symbol = 0; symbol < 6; symbol++) {
				if (!(position.domains[row][symbol] & (1 << column)) ||
				    position.domains[row][symbol] === (1 << column)) continue;
				const discard = symbol === slot.value;
				(discard ? remove : place).push({ position, row, column, symbol, discard });
			}
		}
		groups.push(place, remove);
	}
	let moves = groups.flat();
	if (sample !== null) {
		const rng = random(seed ^ 0x48494e54);
		groups.forEach(group => shuffle(group, rng));
		moves = [];
		while (moves.length < sample && groups.some(group => group.length))
			for (const group of groups)
				if (group.length && moves.length < sample) moves.push(group.pop());
	}
	for (const { position, row, column, symbol, discard } of moves) {
		const slot = puzzle.rows[row].slots[column];
		const domains = position.domains.map(row => row.slice());
		game.applyPencilMark(domains[row], { slot, value: symbol, discard });
		game.propagatePencilRow(domains[row]);
		const placements = domains.map(row => row.reduce((bits, domain, symbol) =>
			bits | (game.countBits(domain) === 1 ? 1 << symbol : 0), 0));
		const before = JSON.stringify({ domains, placements });
		const started = performance.now();
		const steps = game.buildContradictionSteps(puzzle, domains, placements, { maxSteps });
		const elapsed = performance.now() - started;
		timings.push(elapsed);
		total.slowestMs = Math.max(total.slowestMs, Math.round(elapsed));
		total.positions++;
		if (JSON.stringify({ domains, placements }) !== before) throw new Error('Input mutated');
		if (!steps.length) {
			total.failures++;
			console.log(JSON.stringify({ seed, extreme, maxSteps, position: position.label,
				move: { row, column, symbol, discard }, domains, placements }));
		} else {
			checkWalkthrough(puzzle, domains, placements, steps);
			total.explained++;
			if (steps.length === 1) total.immediate++;
			if (steps.some(step => step.lemmaStage === 'start')) total.lemmas++;
			total.longest = Math.max(total.longest, steps.length);
		}
	}
	if (total.failures > failuresBefore) total.failedSeeds++;
	console.error(hex + ': ' + JSON.stringify(total));
}
timings.sort((a, b) => a - b);
const percentile = p => timings.length ? Math.round(timings[Math.ceil(p * timings.length) - 1]) : null;
console.error('Summary: ' + JSON.stringify({ ...total, maxSteps, sample, medianMs: percentile(0.5), p95Ms: percentile(0.95) }));
