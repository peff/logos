const usage = `Usage: analysis/puzzle SEED_OR_URL... [--extreme] [--trace]
       analysis/puzzle --position [--extreme] [--trace] < snapshot.json

Each seed or URL gets a separate report, in command-line order.
By default, seed queries show only the difficulty score and metrics.
--position reads a position snapshot from stdin and lists available deductions.
--extreme uses extreme mode for all inputs (also detected from URLs and snapshots).
--trace shows a full hint walkthrough (spoilers), not a difficulty-scoring route.

Paste a snapshot after running --position, then press Ctrl-D to finish input.`;

// Use the same DOM-free generator, scorer, and hint logic as the game. The
// browser script registers one document listener when loaded; no UI is built.
async function loadGame() {
	const source = await Deno.readTextFile(new URL("../logos.js", import.meta.url));
	return new Function("document", source + `\nreturn {
		puzzleGeneratorVersion, parseSeed, formatSeed, defaultSymbols,
		puzzleFromSeed, measureDifficulty, difficultyRating,
		difficultyOpportunities, nextHintStep, buildHintSteps, clueSlots, proofMessageText,
		drainForcedProofSteps, extremeClueIndices, measureExtremeDifficulty
	};`)({ addEventListener() {} });
}

function seedFromInput(game, input) {
	let seed = game.parseSeed(input);
	let extreme = false;
	if (seed === null && typeof input === "string") {
		try {
			const params = new URLSearchParams(new URL(input).hash.slice(1));
			seed = game.parseSeed(params.get("seed"));
			extreme = params.has("extreme");
		} catch (_) {
			// Report the same error for malformed seeds and puzzle links.
		}
	}
	if (seed === null)
		throw new Error("expected a hexadecimal seed (up to eight digits) or a puzzle URL");
	return { seed, extreme };
}

function validatePosition(game, puzzle, snapshot) {
	if (snapshot.generatorVersion !== game.puzzleGeneratorVersion)
		throw new Error(`unsupported generator version: ${snapshot.generatorVersion}`);
	const validMask = bits => Number.isInteger(bits) && bits >= 0 && bits <= 63;
	if (!Array.isArray(snapshot.domains) || snapshot.domains.length !== 6 ||
	    !snapshot.domains.every(row => Array.isArray(row) && row.length === 6 &&
		row.every(bits => validMask(bits) && bits !== 0)))
		throw new Error("domains must be six rows of six nonzero six-bit masks");
	if (!Array.isArray(snapshot.placements) || snapshot.placements.length !== 6 ||
	    !snapshot.placements.every(validMask))
		throw new Error("placements must contain six six-bit masks");
	for (const [row, data] of puzzle.rows.entries()) {
		for (const [col, slot] of data.slots.entries()) {
			const bits = snapshot.domains[row][slot.value];
			if (!(bits & (1 << col)))
				throw new Error("snapshot excludes the solution; check its seed and generator version");
			if (!(snapshot.placements[row] & (1 << slot.value)))
				continue;
			if (bits !== (1 << col) || snapshot.domains[row].some((other, symbol) =>
			    symbol !== slot.value && (other & (1 << col))))
				throw new Error("placements and candidate domains disagree");
		}
	}
}

function columns(bits) {
	return [1, 2, 3, 4, 5, 6].filter(col => bits & (1 << (col - 1))).join(", ");
}

function clueText(game, puzzle, clue) {
	const symbols = game.clueSlots(clue).map(slot =>
		game.defaultSymbols[puzzle.rows.indexOf(slot.row)][slot.value]);
	switch (clue.constructor.name) {
	case "OrderClue": return symbols.join(" < ");
	case "ColumnClue": return symbols.join(" above ");
	case "Adjacent2Clue": return symbols.join(" beside ");
	case "Adjacent3Clue": return symbols.join(" — ") + " (either direction)";
	case "ExactClue": return symbols[0] + " is given";
	default: throw new Error("unrecognized clue type: " + clue.constructor.name);
	}
}

function describePosition(game, puzzle, domains, placements) {
	console.log("\nCurrent position:");
	const families = ["Numbers", "Letters", "Roman numerals", "Dice", "Shapes", "Operators"];
	const board = domains.map((values, row) =>
		Array.from({ length: 6 }, (_, col) => {
			const candidates = values.flatMap((bits, symbol) =>
				bits & (1 << col) ? [symbol] : []);
			const placed = candidates.find(symbol => placements[row] & (1 << symbol));
			if (placed !== undefined)
				return ["[" + game.defaultSymbols[row][placed] + "]", ""];
			const names = candidates.map(symbol => game.defaultSymbols[row][symbol]);
			return [names.slice(0, 3).join(" "), names.slice(3).join(" ")];
		}));
	const widths = Array.from({ length: 6 }, (_, col) =>
		Math.max(1, ...board.flatMap(row => row[col].map(line => line.length))));
	const labelWidth = Math.max(...families.map(name => name.length));
	const printRow = (label, cells) => console.log(
		label.padEnd(labelWidth) + " | " +
		cells.map((cell, col) => cell.padEnd(widths[col])).join(" | "));
	printRow("Column", ["1", "2", "3", "4", "5", "6"]);
	const divider = "-".repeat(labelWidth) + "-+-" +
		widths.map(width => "-".repeat(width)).join("-+-");
	for (const [row, cells] of board.entries()) {
		console.log(divider);
		printRow(families[row], cells.map(cell => cell[0]));
		if (cells.some(cell => cell[1]))
			printRow("", cells.map(cell => cell[1]));
	}
	console.log("[Brackets] mark placed tiles; other symbols are candidates for that slot.");
	const available = game.difficultyOpportunities(puzzle, domains);
	console.log(`\n${available.length} clue observations available.`);
	console.log("(One observation groups reductions to one symbol from one clue.)");
	for (const [index, clue] of puzzle.clues.entries()) {
		const moves = game.difficultyOpportunities({ ...puzzle, clues: [clue] }, domains);
		if (!moves.length)
			continue;
		console.log(`\nClue ${index + 1}: ${clueText(game, puzzle, clue)}`);
		for (const move of moves) {
			const removed = domains[move.row][move.symbol] & ~move.after;
			console.log(`  Exclude ${game.defaultSymbols[move.row][move.symbol]}` +
				` from columns ${columns(removed)}`);
		}
	}
	const step = game.nextHintStep(puzzle, domains, placements);
	console.log("\nNext hint: " + (step ?
		game.proofMessageText(puzzle, step.message) : "No deduction available."));
}

function walkthrough(game, puzzle, domains, placements) {
	console.log("\nHint walkthrough (includes automatic row placements):");
	const first = game.nextHintStep(puzzle, domains, placements);
	const steps = game.buildHintSteps(puzzle, first, domains, placements);
	for (const [index, step] of steps.entries()) {
		const number = step.walkthroughNumber || String(index + 1);
		const label = step.lemmaStage === "start" ? " — Lemma" :
			step.lemmaStage === "end" ? " — Lemma proved" : "";
		console.log(`Step ${number}${label}: ${game.proofMessageText(puzzle, step.message)}`);
		domains = step.domains;
		placements = step.placements;
	}
	if (placements.every(bits => bits === 63))
		console.log("Q.E.D.");
	else
		describePosition(game, puzzle, domains, placements);
}

async function main(args) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(usage);
		return;
	}
	const position = args.includes("--position");
	const trace = args.includes("--trace");
	const extreme = args.includes("--extreme");
	const inputs = args.filter(arg => !["--position", "--trace", "--extreme"].includes(arg));
	if (inputs.some(arg => arg.startsWith("-")) || (position ? inputs.length !== 0 : inputs.length === 0))
		throw new Error(usage);
	const game = await loadGame();
	let snapshot;
	if (position) {
		if (Deno.stdin.isTerminal())
			console.error("Paste the snapshot JSON, then press Ctrl-D:");
		try {
			snapshot = JSON.parse(await new Response(Deno.stdin.readable).text());
		} catch (_) {
			throw new Error("stdin must contain one JSON snapshot from Copy position");
		}
		if (!snapshot || typeof snapshot !== "object")
			throw new Error("expected a JSON snapshot object");
		if (snapshot.extreme !== undefined && typeof snapshot.extreme !== "boolean")
			throw new Error("extreme must be a boolean");
	}
	const seeds = (position ? [snapshot.seed] : inputs).map(input => seedFromInput(game, input));
	for (const [index, input] of seeds.entries()) {
		if (index)
			console.log();
		analyzePuzzle(game, input.seed, snapshot, trace,
			extreme || input.extreme || snapshot?.extreme === true);
	}
}

function analyzePuzzle(game, seed, snapshot, trace, extreme) {
	const position = snapshot !== undefined;
	const puzzle = game.puzzleFromSeed(seed);
	const originalClues = puzzle.clues;
	if (extreme) {
		const indices = game.extremeClueIndices(puzzle);
		if (!indices)
			throw new Error(`seed ${game.formatSeed(seed)} has no extreme variant`);
		puzzle.clues = indices.map(index => originalClues[index]);
	}
	// The DOM-free generator omits display names, which proof messages use.
	puzzle.rows.forEach((row, index) => row.slots.forEach(slot => {
		slot.symbols = game.defaultSymbols[index];
	}));
	if (position)
		validatePosition(game, puzzle, snapshot);
	if (extreme) {
		const rating = game.measureExtremeDifficulty(puzzle);
		console.log(`Seed ${game.formatSeed(seed)} — extreme`);
		console.log(rating.stalled ? "Skulls: ∞" : rating.complete ? `Skulls: ${rating.skulls}\nScore: ${rating.score.toFixed(2)}\nMean bottlenecks: ${rating.bottlenecks.toFixed(1)}` :
			"Extreme rating unavailable");
	} else {
		const metrics = game.measureDifficulty(puzzle);
		const rating = game.difficultyRating(metrics);
		console.log(`Seed ${game.formatSeed(seed)} — ${rating.level}`);
		console.log(`Score: ${rating.score.toFixed(2)} = excess discards + 5 × scarcity`);
		console.log("Cutoffs: Easy < 47; Medium < 70; otherwise Hard");
		console.log("Ten-route averages (placement-first):");
		console.log(`  Total scarcity:               ${metrics.scarcity.toFixed(2)}`);
		console.log(`  Excess discards (3 free):     ${metrics.excessDiscards.toFixed(2)}`);
	}
	const revealed = snapshot?.revealedClues ?? [];
	if (!Array.isArray(revealed) || (!extreme && revealed.length) ||
	    revealed.some(index => !Number.isInteger(index) || index < 0 ||
		index >= originalClues.length || puzzle.clues.includes(originalClues[index])) ||
	    new Set(revealed).size !== revealed.length)
		throw new Error("revealedClues must list distinct removed clue indices in an extreme puzzle");
	puzzle.clues.push(...revealed.map(index => originalClues[index]));
	if (!position && !trace)
		return;
	let domains, placements;
	if (position) {
		({ domains, placements } = snapshot);
		if (snapshot.pencilMarks?.length)
			console.log("\nChalk marks are recorded in the snapshot but do not affect deductions.");
		describePosition(game, puzzle, domains, placements);
	} else {
		domains = puzzle.rows.map(row => row.slots.map(() => 63));
		placements = puzzle.rows.map(() => 0);
		for (const clue of puzzle.clues)
			if (clue.applyInitialState)
				clue.constrain(domains, 63);
		game.drainForcedProofSteps(domains, placements);
	}
	if (trace)
		walkthrough(game, puzzle, domains, placements);
}

try {
	await main(Deno.args);
} catch (error) {
	console.error("puzzle: " + error.message);
	Deno.exitCode = 1;
}
