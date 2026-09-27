const usage = `Usage: analysis/puzzle SEED_OR_URL [--trace]
       analysis/puzzle --position [--trace] < snapshot.json

By default, seed queries show only the difficulty score and metrics.
--position reads a position snapshot from stdin and lists available deductions.
--trace shows a full hint walkthrough (spoilers), not a difficulty-scoring route.

Paste a snapshot after running --position, then press Ctrl-D to finish input.`;

// Use the same DOM-free generator, scorer, and hint logic as the game. The
// browser script registers one document listener when loaded; no UI is built.
async function loadGame() {
	const source = await Deno.readTextFile(new URL("../logos.js", import.meta.url));
	return new Function("document", source + `\nreturn {
		puzzleGeneratorVersion, parseSeed, formatSeed, defaultSymbols,
		puzzleFromSeed, measureDifficulty, difficultyRating, compositeDifficultyRating,
		difficultyOpportunities, nextHintStep, clueSlots, proofMessageText,
		drainForcedProofSteps
	};`)({ addEventListener() {} });
}

function seedFromInput(game, input) {
	let seed = game.parseSeed(input);
	if (seed === null && typeof input === "string") {
		try {
			seed = game.parseSeed(new URLSearchParams(new URL(input).hash.slice(1)).get("seed"));
		} catch (_) {
			// Report the same error for malformed seeds and puzzle links.
		}
	}
	if (seed === null)
		throw new Error("expected a hexadecimal seed (up to eight digits) or a puzzle URL");
	return seed;
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
	const anchored = available.filter(move => move.tier === 1).length;
	console.log(`\n${available.length} clue observations available: ` +
		`${anchored} anchored, ${available.length - anchored} candidate-based.`);
	console.log("(One observation groups reductions to one symbol from one clue.)");
	for (const [index, clue] of puzzle.clues.entries()) {
		const moves = game.difficultyOpportunities({ ...puzzle, clues: [clue] }, domains);
		if (!moves.length)
			continue;
		console.log(`\nClue ${index + 1}: ${clueText(game, puzzle, clue)}`);
		for (const move of moves) {
			const removed = domains[move.row][move.symbol] & ~move.after;
			console.log(`  Exclude ${game.defaultSymbols[move.row][move.symbol]}` +
				` from columns ${columns(removed)}` +
				` [${move.tier === 1 ? "anchored" : "candidate-based"}]`);
		}
	}
	const step = game.nextHintStep(puzzle, domains, placements);
	console.log("\nNext hint: " + (step ?
		game.proofMessageText(puzzle, step.message) : "No deduction available."));
}

function walkthrough(game, puzzle, domains, placements) {
	console.log("\nHint walkthrough (includes automatic row placements):");
	for (let count = 1; ; count++) {
		const step = game.nextHintStep(puzzle, domains, placements);
		if (!step) {
			if (!placements.every(bits => bits === 63))
				throw new Error("walkthrough stalled before solving the puzzle");
			console.log("Q.E.D.");
			return;
		}
		console.log(`${count}. ${game.proofMessageText(puzzle, step.message)}`);
		domains = step.domains;
		placements = step.placements;
	}
}

async function main(args) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(usage);
		return;
	}
	const position = args.includes("--position");
	const trace = args.includes("--trace");
	const inputs = args.filter(arg => arg !== "--position" && arg !== "--trace");
	if (inputs.some(arg => arg.startsWith("-")) || inputs.length !== (position ? 0 : 1))
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
	}
	const seed = seedFromInput(game, position ? snapshot.seed : inputs[0]);
	const puzzle = game.puzzleFromSeed(seed);
	// The DOM-free generator omits display names, which proof messages use.
	puzzle.rows.forEach((row, index) => row.slots.forEach(slot => {
		slot.symbols = game.defaultSymbols[index];
	}));
	if (position)
		validatePosition(game, puzzle, snapshot);
	const metrics = game.measureDifficulty(puzzle);
	const rating = game.difficultyRating(metrics);
	const composite = game.compositeDifficultyRating(metrics);
	console.log(`Seed ${game.formatSeed(seed)} — ${rating.level}`);
	console.log("Rule: stretch < 13 → Easy; otherwise scarcity < 10 → Medium; otherwise Hard");
	console.log(`Old composite: ${composite.level} (${composite.score.toFixed(2)})`);
	console.log("Five-route averages:");
	console.log(`  Candidate-based observations: ${metrics.supportSteps.toFixed(2)}`);
	console.log(`  Total scarcity:               ${metrics.scarcity.toFixed(2)}`);
	console.log(`  Longest discard stretch:      ${metrics.maxDiscardRun.toFixed(2)}`);
	console.log("Old score = observations + 2.65 × scarcity + 0.87 × longest stretch");
	console.log("Old cutoffs: Easy < 45; Medium < 80; otherwise Hard");
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
