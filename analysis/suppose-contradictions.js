// Survey every available wrong placement and removal of a correct tile at
// the start and after ordinary deductions. Emit reproducible failures as
// JSON lines on stdout; progress and totals go to stderr.
// deno run --allow-read=logos.js analysis/suppose-contradictions.js [--extreme] [HEX_SEED...]
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
const extreme = Deno.args.includes('--extreme');
const seeds = Deno.args.filter(arg => arg !== '--extreme');
if (!seeds.length) seeds.push(...(extreme ? ['4c3f2a56', '78c9d796', 'cd7c02f4', '76d8e094'] : ['0', '12345678', '5be42607', 'd57ecd6c']));
const total = { positions: 0, explained: 0, immediate: 0, lemmas: 0, failures: 0, longest: 0, slowestMs: 0 };
for (const hex of seeds) {
	if (!/^[0-9a-f]{1,8}$/i.test(hex)) throw new Error('Expected hexadecimal seed: ' + hex);
	const seed = parseInt(hex, 16), puzzle = game.puzzleFromSeed(seed);
	if (extreme) {
		const indices = game.extremeClueIndices(puzzle);
		if (!indices) { console.error(hex + ': no Extreme variant'); continue; }
		puzzle.clues = indices.map(i => puzzle.clues[i]);
	}
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
	for (const position of positions) {
		for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
			const slot = puzzle.rows[row].slots[column];
			for (let symbol = 0; symbol < 6; symbol++) {
				if (!(position.domains[row][symbol] & (1 << column)) ||
				    position.domains[row][symbol] === (1 << column)) continue;
				const discard = symbol === slot.value;
				const domains = position.domains.map(row => row.slice());
				game.applyPencilMark(domains[row], { slot, value: symbol, discard });
				game.propagatePencilRow(domains[row]);
				const placements = domains.map(row => row.reduce((bits, domain, symbol) =>
					bits | (game.countBits(domain) === 1 ? 1 << symbol : 0), 0));
				const before = JSON.stringify({ domains, placements });
				const started = performance.now();
				const steps = game.buildContradictionSteps(puzzle, domains, placements);
				total.slowestMs = Math.max(total.slowestMs, Math.round(performance.now() - started));
				total.positions++;
				if (JSON.stringify({ domains, placements }) !== before) throw new Error('Input mutated');
				if (!steps.length) {
					total.failures++;
					console.log(JSON.stringify({ seed, extreme, position: position.label,
						move: { row, column, symbol, discard }, domains, placements }));
				} else {
					checkWalkthrough(puzzle, domains, placements, steps);
					total.explained++;
					if (steps.length === 1) total.immediate++;
					if (steps.some(step => step.lemmaStage === 'start')) total.lemmas++;
					total.longest = Math.max(total.longest, steps.length);
				}
			}
		}
	}
	console.error(hex + ': ' + JSON.stringify(total));
}
