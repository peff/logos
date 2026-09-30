// Experimental dependency depth: each constraint reads the same frozen state.
// Balance the terms' interquartile ranges in the 20260930 sample, rounded
// to the nearest half unit. See DIFFICULTY.md; this is not a fit to play times.
export const roundScarcityWeight = 5.5;
// Empirical thirds of integer seeds 1–1000, using unrounded scores.
export const roundDifficultyCutoffs = {
	medium: 16.916666666666668,
	hard: 23.914484126984128,
};
export function roundDifficultyLevel(score) {
	return score < roundDifficultyCutoffs.medium ? "easy" :
		score < roundDifficultyCutoffs.hard ? "medium" : "hard";
}
const copyDomains = domains => domains.map(row => row.slice());
const singleton = bits => bits !== 0 && (bits & (bits - 1)) === 0;
const bitCount = bits => {
	let count = 0;
	for (; bits; bits &= bits - 1) count++;
	return count;
};

function evaluateRound(puzzle, before) {
	const full = (1 << before[0].length) - 1;
	const after = copyDomains(before);
	const observations = new Set();
	for (const clue of puzzle.clues) {
		const trial = copyDomains(before);
		clue.constrain(trial, full);
		for (let row = 0; row < after.length; row++)
			for (let symbol = 0; symbol < after[row].length; symbol++) {
				const reduced = before[row][symbol] & trial[row][symbol];
				// Count each distinct target reduction once, even if several
				// clues offer it. Different reductions may overlap.
				if (reduced !== before[row][symbol])
					observations.add(`${row}:${symbol}:${reduced}`);
				after[row][symbol] &= reduced;
			}
	}
	for (let row = 0; row < before.length; row++) {
		// A known symbol excludes its column from all other symbols.
		for (let symbol = 0; symbol < before[row].length; symbol++) {
			const bits = before[row][symbol];
			if (!singleton(bits)) continue;
			for (let other = 0; other < before[row].length; other++)
				if (other !== symbol) after[row][other] &= ~bits;
		}
		// A column with one candidate determines that symbol's position.
		// Do not propagate the new placement until the following round.
		for (let column = 0; column < before[row].length; column++) {
			const bit = 1 << column;
			const candidates = before[row].flatMap((bits, symbol) =>
				bits & bit ? [symbol] : []);
			if (!candidates.length)
				throw new Error("round solver found a column without candidates");
			if (candidates.length === 1)
				after[row][candidates[0]] &= bit;
		}
	}
	if (after.some(row => row.some(bits => !bits)))
		throw new Error("round solver found contradictory deductions");
	return { domains: after, observations: observations.size };
}

export function deductionRound(puzzle, before) {
	return evaluateRound(puzzle, before).domains;
}

export function measureRounds(puzzle, initialDomains) {
	const width = puzzle.rows[0].slots.length;
	const full = (1 << width) - 1;
	let domains;
	if (initialDomains) {
		domains = copyDomains(initialDomains);
	} else {
		domains = puzzle.rows.map(row => row.slots.map(() => full));
		// Givens are part of round zero; their consequences are not.
		for (const clue of puzzle.clues)
			if (clue.applyInitialState) clue.constrain(domains, full);
	}
	const placementRounds = domains.map(row => row.map(bits => singleton(bits) ? 0 : null));
	const rounds = [];
	let gap = 0, maxRoundsWithoutPlacement = 0;
	let roundScarcity = 0, roundsWithoutPlacement = 0, automaticOnlyRounds = 0;
	while (!domains.every(row => row.every(singleton) &&
	       new Set(row).size === width)) {
		const {domains: after, observations} = evaluateRound(puzzle, domains);
		let removed = 0;
		const placements = [];
		const number = rounds.length + 1;
		for (let row = 0; row < domains.length; row++) {
			for (let symbol = 0; symbol < width; symbol++) {
				removed += bitCount(domains[row][symbol] & ~after[row][symbol]);
				if (placementRounds[row][symbol] === null && singleton(after[row][symbol])) {
					placementRounds[row][symbol] = number;
					placements.push({ row, symbol, column: Math.log2(after[row][symbol]) });
				}
			}
		}
		if (!removed)
			throw new Error("round solver stalled before solving the puzzle");
		if (placements.length) gap = 0;
		else {
			maxRoundsWithoutPlacement = Math.max(maxRoundsWithoutPlacement, ++gap);
			roundsWithoutPlacement++;
			if (observations) roundScarcity += 1 / observations;
		}
		if (!observations) automaticOnlyRounds++;
		rounds.push({ number, removed, observations, placements });
		domains = after;
	}
	const score = rounds.length + roundScarcityWeight * roundScarcity;
	return { rounds, placementRounds, maxRoundsWithoutPlacement, roundsWithoutPlacement,
		roundScarcity, automaticOnlyRounds, domains,
		score, level: roundDifficultyLevel(score) };
}
