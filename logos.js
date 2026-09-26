/* Increment when changes to puzzle generation alter the meaning of a seed. */
var puzzleGeneratorVersion = 1;

var defaultSymbols = [
	["1", "2", "3", "4", "5", "6"],
	["A", "B", "C", "D", "E", "F"],
	["I", "II", "III", "IV", "V", "VI"],
	["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"],
	["△", "▽", "□", "◇", "⬠", "○"],
	["+", "‒", "÷", "x", "=", "√"],
];

var clueArrow = '<span aria-hidden="true">↔</span>';

var startMessages = [
	"The ancient puzzle awaits. Let reason be your guide.",
	"The signs are set. The search for truth begins.",
	"The pattern lies hidden. Reveal that which is concealed.",
	"The oracle is silent. Only reason may uncover the truth.",
	"The pieces are before you. Their true order remains veiled.",
	"The mystery is set. Uncover the hidden order.",
	"The veil is drawn. Let the work of deduction begin.",
	"The pattern is broken. Restore the order that lies beneath.",
	"Truth is hidden among the signs. Seek it well.",
];

var falsePlacementMessages = [
	"You have mistaken falsehood for truth. The wisdom of the ancients eludes you.",
	"You have crowned a false answer as truth. The ancients turn away.",
	"You have embraced an illusion as truth. The oracle falls silent.",
	"Your judgment has fixed upon the false. The ancients are unconvinced.",
	"You have chosen the path of error. Wisdom recedes from your grasp.",
	"You have drawn certainty from deceiving signs. The lesson is lost.",
	"Your conclusion does not follow. The philosophers dismiss your proof.",
];

var falseEliminationMessages = [
	"You have cast aside a truth not yet understood. The wisdom of the ancients eludes you.",
	"You have banished a truth from consideration. The ancients turn away.",
	"You have rejected a truth before its hour. The oracle falls silent.",
	"Your judgment has condemned the possible. The ancients are unconvinced.",
	"You have closed a path that led to truth. Wisdom recedes from your grasp.",
	"You have severed a thread that belonged in the pattern. The Fates turn away.",
	"You have excluded what reason still permits. The philosophers dismiss your proof.",
];

function practiceMistakeMessage(discard, clues) {
	if (clues && clues.length)
		return discard ?
			"Removing that possibility contradicts a clue." :
			"That placement contradicts a clue.";
	return discard ?
		"That possibility cannot be discarded." :
		"That placement leads to a contradiction.";
}

var winMessages = [
	"The pattern is revealed. The wisdom of the ancients is yours.",
	"Every sign has found its place. The secrets of the ancients stand revealed.",
	"You have restored the hidden order. The ancients acknowledge your wisdom.",
	"The veil is lifted. What was concealed is now understood.",
	"The final truth falls into place. The oracle speaks your name.",
	"You have mastered the logic of the ancients. The mystery is no more.",
	"The design is complete. Knowledge emerges from the shadows.",
	"All false paths are closed. The one true order remains.",
];

var milestoneMessages = [
	[
		"The first signs align. A hidden order begins to emerge.",
		"The scattered signs begin to speak.",
		"The first seal is broken. The mystery stirs.",
		"The seeds of wisdom take root in hard and stony soil.",
		"The ancients begin to whisper of your deeds.",
		"You have left the shadows, but the light lies still far ahead.",
	],
	[
		"The pattern takes shape. The wisdom of the ancients draws near.",
		"Half of the ancient design stands revealed.",
		"Order rises from uncertainty. The path grows clearer.",
		"The tree of wisdom grows greater.",
		"The whispers of the ancients swell as your journey continues.",
		"Your journey is half done; alea iacta est.",
	],
	[
		"The veil grows thin. Only the final secrets remain.",
		"The final veil trembles. Truth lies close at hand.",
		"Nearly every sign has found its place. The answer awaits.",
		"The branches of the great tree whisper softly in the wind.",
		"The whispers reach a crescendo as you begin the final ascent.",
		"Your journey draws towards its close. Make haste.",
	],
];

var milestoneThresholds = [9, 18, 27];

var puzzleRandom = Math.random;

function randomSeed() {
	if (typeof crypto != "undefined" && crypto.getRandomValues) {
		var value = new Uint32Array(1);
		crypto.getRandomValues(value);
		return value[0];
	}
	return Math.floor(Math.random() * 0x100000000);
}

function seedRandom(seed) {
	var state = seed >>> 0;
	return function() {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function formatSeed(seed) {
	return seed.toString(16).padStart(8, "0");
}

function parseSeed(seed) {
	if (typeof seed == "number")
		return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ?
			seed : null;
	if (typeof seed != "string" || !/^[0-9a-f]{1,8}$/i.test(seed))
		return null;
	return parseInt(seed, 16);
}

function withPuzzleRandom(seed, callback) {
	var oldRandom = puzzleRandom;
	puzzleRandom = seedRandom(seed);
	try {
		return callback();
	} finally {
		puzzleRandom = oldRandom;
	}
}

document.addEventListener('contextmenu', function(ev) {
	if (ev.target && ev.target.closest &&
	    ev.target.closest(".modal, input, textarea, [contenteditable=true]"))
		return;
	ev.preventDefault();
});

function Puzzle(board, hClues, vClues, messages, timer, symbols,
		options, optionsButton, help, helpButton, scores, scoresButton,
		about, logoButton) {
	symbols = symbols || defaultSymbols;

	this.messages = messages;
	this.timer = timer;
	this.timerText = timer.firstElementChild || timer;
	this.hClues = hClues;
	this.vClues = vClues;
	this.options = options;
	this.optionsButton = optionsButton;
	this.newGameButton = document.querySelector("#new-game-button");
	this.invitation = document.querySelector("#game-invitation");
	this.help = help;
	this.helpButton = helpButton;
	this.scores = scores;
	this.scoresButton = scoresButton;
	this.about = about;
	this.logoButton = logoButton;
	this.slotTray = document.querySelector("#slot-tray");
	this.slotTrayOptions = document.querySelector("#slot-tray-options");
	this.slotTrayAction = document.querySelector("#slot-tray-action");
	this.slotTrayActionSample = this.slotTrayAction.querySelector(
		".slot-tray-action-sample");
	this.slotTrayOptions.replaceChildren();
	this.slotTrayTiles = [];
	for (var i = 0; i < symbols[0].length; i++) {
		var tile = document.createElement("button");
		tile.type = "button";
		tile.addEventListener("click", function(puzzle, value) {
			return function() {
				puzzle.applySlotTrayAction(value);
			};
		}(this, i));
		this.slotTrayTiles.push(tile);
		this.slotTrayOptions.appendChild(tile);
	}
	this.boardActions = document.querySelector("#board-actions");
	this.expandedSlot = null;
	this.coarsePointer = typeof matchMedia != "undefined" &&
		matchMedia("(pointer: coarse)").matches;
	this.expandTileChoices = this.coarsePointer &&
		typeof innerWidth != "undefined" &&
		Math.min(innerWidth * 0.0208, innerHeight * 0.0345) < 20;
	this.showActionSelector = this.coarsePointer;
	this.controlHeld = false;
	this.shiftHeld = false;
	this.altHeld = false;
	this.timerTimeout = null;
	this.timerStarted = null;
	this.timerElapsed = 0;
	this.messageTimeout = null;
	this.soundSamples = {
		place: new Audio("sound/place.opus"),
		discard: new Audio("sound/discard.opus"),
		clue: new Audio("sound/clue.opus"),
		mistake: new Audio("sound/mistake.opus"),
		toggle: new Audio("sound/toggle.opus"),
	};
	this.soundVolumes = {
		place: 1,
		discard: 0.55,
		clue: 1,
		mistake: 1,
		toggle: 0.5,
	};
	this.soundVariations = {
		place: 0.045,
		discard: 0.1,
		clue: 0.055,
		mistake: 0,
		toggle: 0.035,
	};
	/* Normalized offsets, scaled by each sound's variation above. */
	this.soundSequence = [0, 0.833, -0.5, 0.333, -1, -0.167, 0.667,
		-0.667, 0.167, 1, -0.333, 0.5, -0.833];
	this.soundSequencePositions = {};
	this.soundBuffers = {};
	this.soundBufferPromises = {};
	this.sampleSource = null;
	for (var name in this.soundSamples) {
		this.soundSamples[name].preload = "auto";
		this.soundSamples[name].preservesPitch = false;
	}
	this.gameOver = true;
	this.practiceMode = false;
	this.practiceModePreference = false;
	this.continueAfterLoss = false;
	this.scoreEligible = true;
	this.practiceMistake = null;
	this.paused = false;
	this.manualPaused = false;
	this.resumeAfterModal = false;
	this.pageHidden = false;
	this.resumeAfterPageHidden = false;
	this.pausedBeforePageHidden = false;
	this.nextMilestone = 0;
	this.helpPage = 0;
	this.helpPages = Array.from(this.help.querySelectorAll(".help-page"));
	this.helpPages.forEach((page, index) => {
		var folio = document.createElement("nav");
		folio.className = "help-folio";
		folio.setAttribute("aria-label", "Help pages");
		var turn = direction => {
			var neighbor = this.helpPages[index + direction];
			if (!neighbor)
				return document.createElement("span");
			var button = document.createElement("button");
			button.type = "button";
			button.className = "help-page-turn " +
				(direction < 0 ? "help-page-previous" : "help-page-next");
			var title = neighbor.querySelector("h3").textContent;
			button.textContent = direction < 0 ? "‹ " + title : title + " ›";
			button.onclick = () => this.turnHelpPage(direction);
			return button;
		};
		var number = document.createElement("span");
		number.className = "help-page-number";
		number.textContent = "Leaf " + romanNumeral(index + 1) +
			" of " + romanNumeral(this.helpPages.length);
		folio.appendChild(turn(-1));
		folio.appendChild(number);
		folio.appendChild(turn(1));
		page.appendChild(folio);
	});
	this.showMilestones = true;
	this.pencilMarks = [];
	this.actionController = null;
	this.effectsSuppressed = false;
	this.proof = null;
	this.pendingProof = null;
	this.clueDrag = null;
	this.explainButton = document.querySelector("#explain-button");
	this.explainButton.disabled = true;
	this.proofControls = document.querySelector("#proof-controls");
	this.hintNotice = document.querySelector("#hint-notice");
	this.hintNotice.hidden = true;
	this.hintAcknowledged = false;
	try {
		this.hintAcknowledged = localStorage.getItem("hintAcknowledged") == "true";
	} catch (e) {
		/* The notice can still be acknowledged for this page. */
	}
	this.rows = [];
	this.clues = [];
	this.hClueSlots = [];
	this.vClueSlots = [];
	for (var i = 0; i < symbols.length; i++)
		this.rows[i] = new Row(this, symbols[i], board.insertRow(), i);
	for (var i = 0; i < 6; i++) {
		var row = hClues.insertRow();
		for (var j = 0; j < 3; j++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.hClueSlots.push(cell);
		}
	}
	{
		var row = vClues.insertRow();
		for (var i = 0; i < 8; i++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.vClueSlots.push(cell);
		}
	}

	this.clear = function() {
		this.clearHint();
		this.clearInvitationTransition();
		this.manualPaused = false;
		this.gameOver = true;
		this.proof = null;
		this.pendingProof = null;
		this.practiceMistake = null;
		this.explainButton.disabled = true;
		this.explainButton.classList.remove("active", "proof-available");
		this.explainButton.setAttribute("aria-pressed", "false");
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		this.nextMilestone = 0;
		this.closeSlotTray();
		this.clearPencilMarks();
		this.hClues.classList.remove("solution");
		this.vClues.classList.remove("solution");
		this.stopTimer();
		this.timer.hidden = true;
		this.timerElapsed = 0;
		this.clearOutcome();
		this.updateTimer(0);
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].clear();
		this.say("");
		this.updateActionControls();
	}

	this.startGame = function() {
		if (this.pendingSeed === undefined)
			return false;
		if (this.invitationAnimation)
			return false;
		var finish = () => {
			this.pendingSeed = undefined;
			var modalOpen = document.querySelectorAll(".modal:not([hidden])").length > 0;
			this.paused = this.pageHidden || modalOpen;
			this.pausedBeforePageHidden = modalOpen;
			this.resumeAfterPageHidden = this.pageHidden && !this.practiceMode;
			this.invitation.classList.remove("revealing");
			this.updateSeedControls();
			this.updateActionControls();
			if (!this.paused && !this.practiceMode)
				this.startTimer();
			this.say(randomChoice(startMessages));
		};
		if (typeof this.invitation.animate != "function" ||
		    typeof matchMedia != "undefined" &&
		    matchMedia("(prefers-reduced-motion: reduce)").matches) {
			finish();
			return true;
		}
		this.invitation.classList.add("revealing");
		var animation = this.invitationAnimation = this.invitation.animate(
			[{ opacity: 1 }, { opacity: 1, offset: 900 / 2400, easing: "cubic-bezier(0.25, 0, 0.75, 0.8)" }, { opacity: 0 }],
			{ duration: 2400, fill: "forwards" });
		animation.finished.then(() => {
			if (this.invitationAnimation !== animation)
				return;
			this.invitationAnimation = null;
			finish();
			animation.cancel();
		}, function() {});
		return true;
	}

	this.clearInvitationTransition = function() {
		if (this.invitationAnimation) {
			this.invitationAnimation.cancel();
			this.invitationAnimation = null;
		}
		this.invitation.classList.remove("revealing");
	}

	this.randomPuzzleSeed = function() {
		if (!this.randomDifficulties.length) {
			this.gameIdentity = {};
			this.seed = this.pendingSeed = undefined;
			this.paused = this.resumeAfterModal = false;
			this.clear();
			this.clues = [];
			for (var slot of [...this.hClueSlots, ...this.vClueSlots])
				slot.replaceChildren();
			this.options.querySelector("#game-seed").value = "";
			this.updateSeedControls();
			this.updateSeedDifficulty();
			this.timer.hidden = false;
			this.timer.classList.add("contemplating");
			this.timer.title = "Contemplation has no time limit";
			this.timer.setAttribute("aria-label", this.timer.title);
			this.messages.classList.add("won");
			this.say("You have chosen the path of contemplation.");
			return null;
		}
		for (;;) {
			var seed = randomSeed();
			if (this.randomDifficulties.length == 3)
				return seed;
			var difficulty = puzzleDifficulty(puzzleFromSeed(seed));
			if (this.randomDifficulties.includes(difficulty.level)) {
				this.seedDifficultyCache = { seed: seed, difficulty: difficulty };
				return seed;
			}
		}
	}

	this.newGame = function(seed, awaitStart = false) {
		this.clearHint();
		seed = arguments.length ? parseSeed(seed) : this.randomPuzzleSeed();
		if (seed === null)
			return false;
		this.clearInvitationTransition();
		this.pendingSeed = awaitStart ? seed : undefined;
		this.gameIdentity = {};
		this.seed = seed;
		this.options.querySelector("#game-seed").value = formatSeed(seed);
		this.updateSeedControls();
		this.gameOver = true;
		this.practiceMode = this.practiceModePreference;
		this.timer.hidden = false;
		this.proof = null;
		this.pendingProof = null;
		this.practiceMistake = null;
		this.scoreEligible = !this.practiceMode;
		this.explainButton.disabled = true;
		this.explainButton.classList.remove("active", "proof-available");
		this.explainButton.setAttribute("aria-pressed", "false");
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		/* A seed may be started from the paused Options modal. */
		this.manualPaused = false;
		this.paused = false;
		this.resumeAfterModal = false;
		this.nextMilestone = 0;
		this.closeSlotTray();
		this.clearPencilMarks();
		this.stopTimer();
		this.timerElapsed = 0;
		this.clearOutcome();
		this.updateTimer(0);
		var puzzle = this;
		withPuzzleRandom(seed, function() {
			for (var i = 0; i < puzzle.rows.length; i++)
				puzzle.rows[i].newGame();
			puzzle.gameOver = false;
			puzzle.generateClues();
		});
		this.explainButton.disabled = false;
		this.paused = awaitStart;
		if (!this.practiceMode && !awaitStart)
			this.startTimer();
		this.say(awaitStart ? "" : randomChoice(startMessages));
		this.updateActionControls();
		return true;
	}

	this.loadURLSeed = function(url) {
		var params = new URLSearchParams(new URL(url).hash.slice(1));
		var seed = parseSeed(params.get("seed"));
		if (seed === null)
			return false;
		this.invitation.querySelector(".invitation-seed").textContent =
			formatSeed(seed);
		return this.newGame(seed, true);
	}

	this.updateSeedControls = function() {
		var value = this.options.querySelector("#game-seed").value.trim();
		var seed = parseSeed(value);
		this.options.querySelector("#start-game-button").value =
			!value ? "Start with random seed" :
			seed === this.seed && this.pendingSeed === undefined ? "Restart" : "Start with seed";
		var copy = this.options.querySelector("#copy-seed-link");
		copy.disabled = seed === null;
		copy.value = "Copy link";
	}

	this.updateSeedDifficulty = function(typing = false) {
		var display = this.options.querySelector("#seed-difficulty");
		display.textContent = "";
		var value = this.options.querySelector("#game-seed").value.trim();
		var seed = parseSeed(value);
		if (this.options.hidden || seed === null || typing && value.length != 8)
			return;
		if (!this.seedDifficultyCache || this.seedDifficultyCache.seed !== seed)
			this.seedDifficultyCache = { seed: seed, difficulty: puzzleDifficulty(puzzleFromSeed(seed)) };
		var level = this.seedDifficultyCache.difficulty.level;
		display.textContent = "Difficulty: " + level[0].toUpperCase() + level.slice(1);
	}

	this.copySeedLink = async function() {
		var input = this.options.querySelector("#game-seed");
		var seed = parseSeed(input.value.trim());
		if (seed === null)
			return;
		var url = new URL(window.location.href);
		url.hash = "seed=" + formatSeed(seed);
		try {
			await navigator.clipboard.writeText(url.href);
			if (parseSeed(input.value.trim()) === seed)
				this.options.querySelector("#copy-seed-link").value = "Copied";
		} catch (e) {
			window.prompt("Copy this puzzle link:", url.href);
		}
	}

	this.playSeed = function() {
		this.updateSeedDifficulty();
		var input = this.options.querySelector("#game-seed");
		var value = input.value.trim();
		if (this.pendingSeed !== undefined && parseSeed(value) === this.pendingSeed) {
			this.startGame();
			input.setCustomValidity("");
			this.toggleOptions();
			return;
		}
		var started = value ? this.newGame(value) : this.newGame();
		if (!started) {
			if (!value) {
				input.setCustomValidity("");
				this.toggleOptions();
				return;
			}
			input.setCustomValidity("Enter up to eight hexadecimal digits.");
			input.reportValidity();
			return;
		}
		input.setCustomValidity("");
		this.toggleOptions();
	}

	this.checkWin = function() {
		if (this.gameOver)
			return;
		this.checkMilestones();
		for (var i = 0; i < this.rows.length; i++)
			if (!this.rows[i].isComplete())
				return;
		this.gameOver = true;
		this.explainButton.disabled = true;
		this.updateActionControls();
		this.playSound("win");
		this.stopTimer();
		this.timer.classList.add("won");
		this.messages.classList.add("won");
		this.say(randomChoice(winMessages));
		if (this.scoreEligible)
			return this.recordOutcome("won");
	}

	this.checkMilestones = function() {
		var complete = 0;
		for (var i = 0; i < this.rows.length; i++)
			for (var j = 0; j < this.rows[i].slots.length; j++)
				if (this.rows[i].slots[j].single)
					complete++;

		while (this.nextMilestone < milestoneThresholds.length &&
		       complete >= milestoneThresholds[this.nextMilestone]) {
			if (this.showMilestones)
				this.say(randomChoice(
					milestoneMessages[this.nextMilestone]));
			this.nextMilestone++;
		}
	}

	this.lose = function(msg, clues, failedSlot, failedValue) {
		if (this.gameOver)
			return;
		var continuingAfterLoss = !this.practiceMode &&
			this.continueAfterLoss;
		if (continuingAfterLoss) {
			this.playSound("mistake");
			this.stopTimer();
			if (this.scoreEligible)
				this.recordOutcome("lost");
			this.scoreEligible = false;
			this.timer.classList.add("lost");
			this.practiceMode = true;
			this.updatePauseControl();
		}
		if (this.practiceMode) {
			this.clearPracticeMistake();
			if (!continuingAfterLoss)
				this.playSound("practice-mistake");
			this.closeSlotTray();
			var clueStates = [];
			if (clues && clues.length) {
				this.hClues.classList.add("solution");
				this.vClues.classList.add("solution");
				for (var i = 0; i < clues.length; i++) {
					clueStates.push({
						clue: clues[i],
						active: clues[i].active,
					});
					clues[i].active = true;
					clues[i].display.classList.remove("clue-hidden");
					clues[i].display.classList.add("contradiction");
				}
			}
			this.practiceMistake = {
				clueStates: clueStates,
				failedSlot: failedSlot,
				failedValue: failedValue,
			};
			if (failedSlot) {
				this.pendingProof = {
					continueGame: true,
					emphasizeButton: !clues || !clues.length,
					failedSlot: failedSlot,
					failedValue: failedValue,
				};
				this.explainButton.disabled = false;
				if (!clues || !clues.length)
					this.explainButton.classList.add("proof-available");
				failedSlot.possibilityElems[failedValue].classList.add(
					"failed-action");
			}
			this.messages.classList.add("lost");
			this.say(msg);
			return;
		}
		this.gameOver = true;
		this.explainButton.disabled = true;
		this.updateActionControls();
		this.playSound("mistake");
		this.stopTimer();
		if (this.scoreEligible)
			this.recordOutcome("lost");
		this.timer.classList.add("lost");
		this.messages.classList.add("lost");
		this.closeSlotTray();
		if (clues && clues.length) {
			this.hClues.classList.add("solution");
			this.vClues.classList.add("solution");
			for (var i = 0; i < clues.length; i++) {
				clues[i].active = true;
				clues[i].display.classList.remove("clue-hidden");
				clues[i].display.classList.add("contradiction");
			}
		}
		this.revealSolution();
		if (failedSlot) {
			this.pendingProof = {
				emphasizeButton: !clues || !clues.length,
				failedSlot: failedSlot,
				failedValue: failedValue,
			};
			this.explainButton.disabled = false;
			if (!clues || !clues.length)
				this.explainButton.classList.add("proof-available");
		}
		if (failedSlot)
			failedSlot.possibilityElems[failedValue].classList.add(
				"failed-action");
		this.say(msg);
	}

	this.renderProofDomains = function(domains, placements, change) {
		for (var row = 0; row < this.rows.length; row++) {
			for (var col = 0; col < this.rows[row].slots.length; col++) {
				var slot = this.rows[row].slots[col];
				if (slot.single)
					continue;
				slot.displayProof(domains[row], col, placements[row],
					change && change.row == row ? change : null);
			}
		}
	}

	/* Preserve the position for analysis before revealing a hint. */
	this.hint = function(stage = 3) {
		if (this.gameOver || this.pendingSeed !== undefined || this.paused) {
			console.log("Start or resume a game before requesting a hint.");
			return;
		}
		if (this.hintRequest) {
			this.showHint(stage);
			return;
		}
		if (!this.practiceMode && !this.hintAcknowledged) {
			this.pendingHint = { stage, gameIdentity: this.gameIdentity };
			this.closeSlotTray();
			this.toggleModal(this.hintNotice, this.explainButton, "Keep solving");
			this.hintNotice.querySelector(".modal-close").focus();
			return;
		}
		var base = domainsFromSlots(this);
		var basePlacements = proofPlacementsFromSlots(this);
		console.log(JSON.stringify({
			seed: formatSeed(this.seed),
			generatorVersion: puzzleGeneratorVersion,
			// Indexed by row, then symbol; bits identify possible columns.
			domains: base,
			placements: basePlacements,
			pencilMarks: this.pencilMarks.map(mark => ({
				row: this.rows.indexOf(mark.slot.row),
				column: mark.slot.row.slots.indexOf(mark.slot),
				symbol: mark.value,
				discard: mark.discard,
			})),
		}));
		var step = nextHintStep(this, base, basePlacements);
		if (!step) {
			console.log("No further deduction is available.");
			return;
		}
		if (this.proof)
			this.closeProof();
		this.clearPracticeMistake();
		this.closeSlotTray();
		this.practiceMode = true;
		this.scoreEligible = false;
		this.stopTimer();
		this.timer.hidden = false;
		this.updatePauseControl();
		this.hintRequest = { base, basePlacements, step, stage: 0 };
		this.say("A little enlightenment. Consider the highlighted clue.");
		this.showHint(stage);
	}

	this.finishHintNotice = function(accept) {
		var request = this.pendingHint;
		if (!request)
			return;
		this.pendingHint = null;
		this.toggleModal(this.hintNotice, this.explainButton, "Keep solving");
		this.explainButton.focus();
		if (!accept || request.gameIdentity !== this.gameIdentity || this.gameOver)
			return;
		this.hintAcknowledged = true;
		try {
			localStorage.setItem("hintAcknowledged", "true");
		} catch (e) {
			/* Keep the acknowledgement for this page if storage is unavailable. */
		}
		this.hint(request.stage);
	}

	this.clearHint = function() {
		if (this.pendingHint)
			this.finishHintNotice(false);
		if (!this.hintRequest)
			return;
		this.hintRequest = null;
		this.proofControls.hidden = true;
		this.proofControls.classList.remove("hint-explanation");
		for (var clue of this.clues)
			if (clue.display)
				clue.display.classList.remove("hint-current");
		this.fadeMessage();
	}

	this.showHint = function(stage) {
		var request = this.hintRequest;
		request.stage = stage;
		var step = request.step;
		if (stage < 3) {
			for (var clue of step.clues)
				clue.display.classList.add("hint-current");
			if (stage == 2) {
				this.proofControls.classList.add("hint-explanation");
				this.proofControls.hidden = false;
				this.proofControls.querySelector(".proof-previous").disabled = true;
				this.proofControls.querySelector(".proof-next").disabled = true;
				this.proofControls.querySelector(".proof-position").textContent = "Hint";
				renderProofMessage(this,
					this.proofControls.querySelector(".proof-deduction"),
					step.message, false);
			}
			return;
		}
		var steps = [step];
		var next = step;
		while ((next = nextHintStep(this, next.domains, next.placements)))
			steps.push(next);
		steps[steps.length - 1].conclusion = true;
		this.clearHint();
		this.proof = {
			hint: true,
			steps: steps,
			base: request.base,
			basePlacements: request.basePlacements,
			position: 1,
			continueGame: true,
		};
		this.openProofDisplay();
	}

	this.startProof = function(failedSlot, failedValue, continueGame,
			   emphasizeButton) {
		var base = domainsFromSlots(this);
		var basePlacements = proofPlacementsFromSlots(this);
		var steps = buildProofSteps(this, base, basePlacements,
			failedSlot, failedValue);
		if (!steps.length)
			return;
		this.proof = {
			steps: steps,
			base: base,
			basePlacements: basePlacements,
			position: 1,
			failedSlot: failedSlot,
			failedValue: failedValue,
			continueGame: !!continueGame,
			emphasizeButton: !!emphasizeButton,
		};
		this.openProofDisplay();
	}

	this.openProofDisplay = function() {
		this.proofControls.hidden = false;
		document.body.classList.add("proof-active");
		this.explainButton.disabled = false;
		this.explainButton.classList.add("active");
		this.explainButton.classList.remove("proof-available");
		this.explainButton.setAttribute("aria-pressed", "true");
		this.showProofPosition();
	}

	this.explainLoss = function() {
		if (this.proof) {
			this.closeProof();
			return;
		}
		if (!this.pendingProof) {
			this.hint(this.hintRequest ? this.hintRequest.stage + 1 : 1);
			return;
		}
		var request = this.pendingProof;
		this.pendingProof = null;
		this.startProof(request.failedSlot, request.failedValue,
			request.continueGame, request.emphasizeButton);
	}

	this.closeProof = function() {
		if (!this.proof)
			return;
		var proof = this.proof;
		for (var i = 0; i < this.clues.length; i++)
			if (this.clues[i].display)
				this.clues[i].display.classList.remove("proof-current");
		this.pendingProof = proof.hint ? null : {
			continueGame: proof.continueGame,
			emphasizeButton: proof.emphasizeButton,
			failedSlot: proof.failedSlot,
			failedValue: proof.failedValue,
		};
		this.proof = null;
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		this.explainButton.classList.remove("active", "proof-available");
		this.explainButton.setAttribute("aria-pressed", "false");
		if (proof.continueGame)
			this.restorePlayDisplay();
		else
			this.revealSolution();
		if (proof.hint)
			this.explainButton.disabled = false;
		else
			proof.failedSlot.possibilityElems[proof.failedValue].classList.add(
				"failed-action");
	}

	this.restorePlayDisplay = function() {
		for (var i = 0; i < this.rows.length; i++) {
			for (var j = 0; j < this.rows[i].slots.length; j++) {
				var slot = this.rows[i].slots[j];
				if (slot.single)
					slot.displaySingle();
				else
					slot.displayPossible();
			}
			this.renderPencilMarks(this.rows[i]);
		}
	}

	this.clearPracticeMistake = function() {
		if (!this.practiceMistake)
			return;
		for (var i = 0; i < this.practiceMistake.clueStates.length; i++) {
			var state = this.practiceMistake.clueStates[i];
			state.clue.active = state.active;
			state.clue.display.classList.remove("contradiction",
				"proof-current");
			checkClueDisplay(state.clue);
		}
		this.hClues.classList.remove("solution");
		this.vClues.classList.remove("solution");
		for (var row = 0; row < this.rows.length; row++)
			for (var col = 0; col < this.rows[row].slots.length; col++) {
				var slot = this.rows[row].slots[col];
				slot.singleElem.classList.remove("failed-action");
				for (var value = 0; value < slot.possibilityElems.length;
				     value++)
					slot.possibilityElems[value].classList.remove(
						"failed-action");
			}
		this.pendingProof = null;
		this.practiceMistake = null;
		this.explainButton.disabled = this.gameOver;
		this.explainButton.classList.remove("proof-available");
		this.messages.classList.remove("lost");
		this.say("");
	}

	this.showProofPosition = function() {
		if (!this.proof)
			return;
		for (var i = 0; i < this.clues.length; i++)
			if (this.clues[i].display)
				this.clues[i].display.classList.remove("proof-current");

		var position = this.proof.position;
		var positionElem = this.proofControls.querySelector(
			".proof-position");
		var deductionElem = this.proofControls.querySelector(
			".proof-deduction");
		if (position == 0) {
			this.renderProofDomains(this.proof.base,
				this.proof.basePlacements);
			positionElem.textContent = "Before the proof";
			deductionElem.textContent = this.proof.hint ?
				"The board as it stood." :
				"The board as it stood before the mistake.";
		} else {
			var step = this.proof.steps[position - 1];
			this.renderProofDomains(step.domains, step.placements, step);
			if (step.conclusion) {
				positionElem.textContent = "Conclusion";
			} else {
				positionElem.textContent = "Step " + position + " of " +
					this.proof.steps.length;
			}
			renderProofMessage(this, deductionElem, step.message,
				step.conclusion, step.contradicts);
			for (var i = 0; i < step.clues.length; i++)
				step.clues[i].display.classList.add("proof-current");
		}
		this.proofControls.querySelector(".proof-previous").disabled =
			position == 0;
		this.proofControls.querySelector(".proof-next").disabled =
			position == this.proof.steps.length;
	}

	this.moveProof = function(direction) {
		if (!this.proof)
			return;
		var position = this.proof.position + direction;
		if (position < 0 || position > this.proof.steps.length)
			return;
		this.proof.position = position;
		this.playSound("clue");
		this.showProofPosition();
	}

	this.clearPencilMarks = function() {
		this.pencilMarks = [];
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].clearPencilDisplay();
	}

	this.openSlotTray = function(slot) {
		if (this.gameOver || this.paused || this.proof || slot.single)
			return;
		this.closeSlotTray();
		this.expandedSlot = slot;
		this.animateSlotTray = true;
		slot.elem.classList.add("expanded");
		this.slotTray.hidden = false;
		this.renderSlotTray();
	}

	this.closeSlotTray = function() {
		if (this.expandedSlot)
			this.expandedSlot.elem.classList.remove("expanded");
		this.expandedSlot = null;
		this.slotTray.hidden = true;
		this.slotTray.querySelector(".slot-tray-panel").classList.remove(
			"opening");
	}

	this.positionSlotTray = function() {
		var animate = this.animateSlotTray;
		this.animateSlotTray = false;
		if (!this.expandedSlot || typeof innerWidth == "undefined")
			return;
		var target = this.expandedSlot.elem;
		var panel = this.slotTray.querySelector(".slot-tray-panel");
		if (!target.getBoundingClientRect || !panel.getBoundingClientRect)
			return;
		var targetRect = target.getBoundingClientRect();
		var panelRect = panel.getBoundingClientRect();
		var margin = 8;
		var left = targetRect.left + targetRect.width / 2 -
			panelRect.width / 2;
		var top = targetRect.top + targetRect.height / 2 -
			panelRect.height / 2;
		left = Math.max(margin,
			Math.min(left, innerWidth - panelRect.width - margin));
		top = Math.max(margin,
			Math.min(top, innerHeight - panelRect.height - margin));
		panel.style.position = "fixed";
		panel.style.left = left + "px";
		panel.style.top = top + "px";
		if (animate && panel.style.setProperty) {
			panel.style.setProperty("--tray-start-x",
				(targetRect.left - left) + "px");
			panel.style.setProperty("--tray-start-y",
				(targetRect.top - top) + "px");
			panel.style.setProperty("--tray-start-scale-x",
				targetRect.width / panelRect.width);
			panel.style.setProperty("--tray-start-scale-y",
				targetRect.height / panelRect.height);
			panel.classList.add("opening");
		}
	}

	this.setActionController = function(controller) {
		this.actionController = controller;
	}

	/*
	 * Keep requests made by a player separate from actions which have
	 * already been accepted. A multiplayer controller can send the former
	 * to its host and call applyTileAction() when the host commits them.
	 */
	this.requestTileAction = function(slot, value, action) {
		if (this.actionController)
			return this.actionController.requestTileAction(
				slot, value, action);
		return this.applyTileAction(slot, value, action);
	}

	this.withEffectsSuppressed = function(callback) {
		var old = this.effectsSuppressed;
		this.effectsSuppressed = true;
		try {
			return callback();
		} finally {
			this.effectsSuppressed = old;
		}
	}

	this.applyTileAction = function(slot, value, action, options) {
		options = options || {};
		var playerAction = options.playerAction !== false;
		if (action == "place")
			slot.choose(value, playerAction);
		else if (action == "remove")
			slot.discard(value, playerAction);
		else
			slot.pencil(value, action == "pencil-remove");
		if ((action == "place" || action == "remove") &&
		    !options.deferClueDismissal)
			this.dismissExhaustedClues();
	}

	this.applySlotTrayAction = function(value) {
		var slot = this.expandedSlot;
		if (!slot || !slot.possible[value])
			return;
		var action = this.getTileAction();
		this.closeSlotTray();
		this.requestTileAction(slot, value, action);
	}

	this.tileActionForPointer = function(ev, contextMenu) {
		var action = this.showActionSelector ? this.getTileAction() : "place";
		var discard = contextMenu || action == "remove" ||
			action == "pencil-remove";
		var chalk = ev.altKey || ev.shiftKey || action.indexOf("pencil-") == 0;
		if (chalk)
			return discard ? "pencil-remove" : "pencil-select";
		return discard ? "remove" : "place";
	}

	this.pressTile = function(cell, ev, slot, value) {
		if (this.coarsePointer || (this.expandTileChoices && ev.button == 0) ||
		    (ev.button != 0 && ev.button != 2))
			return;
		this.suppressTileClick = null;
		this.suppressTileContextMenu = null;
		var contextMenu = ev.button == 2 ||
			(ev.button == 0 && ev.ctrlKey);
		this.requestTileAction(slot, value, this.tileActionForPointer(ev, contextMenu));
		if (ev.button == 0)
			this.suppressTileClick = cell;
		if (contextMenu)
			this.suppressTileContextMenu = cell;
	}

	this.getTileAction = function() {
		var operation = this.boardActions.querySelector(
			"input[name=tile-operation]:checked").value;
		var mark = this.boardActions.querySelector(
			"input[name=tile-mark]:checked").value;
		if (mark == "inscribe")
			return operation;
		return operation == "place" ? "pencil-select" : "pencil-remove";
	}

	this.updateActionCursor = function() {
		var action = this.tileActionForPointer({
			shiftKey: this.shiftHeld,
			altKey: this.altHeld,
		}, this.controlHeld);
		if (action == "remove" || action == "pencil-remove")
			document.body.dataset.discardCursor = "true";
		else
			delete document.body.dataset.discardCursor;
		if (action.indexOf("pencil-") == 0)
			document.body.dataset.chalkCursor = "true";
		else
			delete document.body.dataset.chalkCursor;
	}

	this.toggleTileAction = function(ev) {
		ev.preventDefault();
		var inputs = ev.currentTarget.children;
		var radios = [];
		var checked = 0;
		for (var i = 0; i < inputs.length; i++)
			if (inputs[i].type == "radio") {
				if (inputs[i].checked)
					checked = radios.length;
				radios.push(inputs[i]);
			}
		var next = (checked + 1) % radios.length;
		for (var i = 0; i < radios.length; i++)
			radios[i].checked = i == next;
		this.updateActionCursor();
		this.playSound("toggle");
	}

	this.renderSlotTray = function() {
		var slot = this.expandedSlot;
		if (!slot)
			return;
		var action = this.getTileAction();
		this.slotTrayAction.className = "slot-tray-action-" + action +
			" " + slot.row.familyClass;
		this.slotTrayActionSample.className = "slot-tray-action-sample";
		if (action == "pencil-select")
			this.slotTrayActionSample.className +=
				" pencil-selected pencil-explicit";
		else if (action == "pencil-remove")
			this.slotTrayActionSample.className +=
				" pencil-removed pencil-explicit";
		this.slotTray.querySelector(".slot-tray-panel").classList.remove(
			"pencil-conflict");
		if (slot.row.elem.classList.contains("pencil-conflict"))
			this.slotTray.querySelector(".slot-tray-panel").classList.add(
				"pencil-conflict");

		for (var value = 0; value < this.slotTrayTiles.length; value++) {
			var tile = this.slotTrayTiles[value];
			tile.className = "slot-tray-symbol " + slot.row.familyClass;
			if (!slot.possible[value]) {
				tile.className += " eliminated";
				tile.disabled = true;
				tile.textContent = "";
				tile.setAttribute("aria-label", "");
				continue;
			}
			tile.disabled = false;

			var boardClasses = slot.possibilityElems[value].className.split(" ");
			for (var i = 0; i < boardClasses.length; i++)
				if (boardClasses[i].indexOf("pencil-") == 0)
					tile.className += " " + boardClasses[i];
			tile.textContent = slot.symbols[value];
			var label;
			if (action == "place")
				label = "Choose ";
			else if (action == "remove")
				label = "Discard ";
			else if (action == "pencil-select")
				label = "Mark as chosen: ";
			else
				label = "Mark as discarded: ";
			tile.setAttribute("aria-label", label + slot.symbols[value]);
		}
		this.positionSlotTray();
	}

	this.togglePencilMark = function(slot, value, discard) {
		if (this.gameOver || this.paused || this.proof || slot.single ||
		    !slot.possible[value])
			return;
		var found = false;
		for (var i = this.pencilMarks.length - 1; i >= 0; i--) {
			var mark = this.pencilMarks[i];
			if (mark.slot != slot || mark.value != value)
				continue;
			if (mark.discard == discard)
				found = true;
			this.pencilMarks.splice(i, 1);
		}
		if (!found)
			this.pencilMarks.push({
				slot: slot,
				value: value,
				discard: discard,
			});
		this.renderPencilMarks(slot.row);
	}

	this.reconcilePencilMarks = function(row) {
		if (!this.pencilMarks.length)
			return;
		this.pencilMarks = this.pencilMarks.filter(function(mark) {
			return !mark.slot.single && mark.slot.possible[mark.value];
		});
		this.renderPencilMarks(row);
	}

	this.dismissExhaustedClues = function() {
		if (!this.autoDismissClues)
			return;
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (!clue.display || !clue.active)
				continue;
			if (!isClueExhausted(clue))
				continue;
			clue.active = false;
			checkClueDisplay(clue);
		}
	}

	this.renderPencilMarks = function(row) {
		/* Rebuild tentative domains without changing committed slot state. */
		var domains = domainsFromRow(row);
		var marks = [];
		for (var i = 0; i < this.pencilMarks.length; i++) {
			var mark = this.pencilMarks[i];
			if (mark.slot.row != row)
				continue;
			marks.push(mark);
			applyPencilMark(domains, mark);
		}
		var conflict = propagatePencilRow(domains);
		row.displayPencil(domains, marks, conflict);
		if (this.expandedSlot && this.expandedSlot.row == row)
			this.renderSlotTray();
	}

	this.findContradictingClues = function(slot, value, discard) {
		var domains = domainsFromSlots(this);
		applyMove(domains, slot, value, discard, this.rows);

		if (!cluesAllow(this, [], domains))
			return [];
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (clue.display && !cluesAllow(this, [clue],
						       copyDomains(domains)))
				return [clue];
		}
		return [];
	}

	this.revealSolution = function() {
		for (var i = 0; i < this.rows.length; i++)
			for (var j = 0; j < this.rows[i].slots.length; j++)
				this.rows[i].slots[j].reveal();
	}

	this.say = function(msg) {
		if (this.effectsSuppressed)
			return;
		if (this.messageTimeout !== null) {
			clearTimeout(this.messageTimeout);
			this.messageTimeout = null;
		}
		this.messages.classList.remove("fading");
		this.messages.innerHTML = msg;
		if (msg) {
			this.messages.classList.add("appearing");
			this.messages.offsetWidth;
			this.messages.classList.remove("appearing");
		}
		if (msg && this.timerTimeout !== null) {
			var puzzle = this;
			this.messageTimeout = setTimeout(function() {
				puzzle.fadeMessage();
			}, 9000);
		}
	}

	this.fadeMessage = function() {
		if (this.effectsSuppressed)
			return;
		if (this.messageTimeout !== null)
			clearTimeout(this.messageTimeout);
		this.messages.classList.add("fading");
		this.messageTimeout = setTimeout(() => {
			this.messages.innerHTML = "";
			this.messages.classList.remove("fading");
			this.messageTimeout = null;
		}, 1000);
	}

	this.restartMessage = function() {
		if (!this.messages.innerHTML)
			return;
		this.messages.classList.add("marquee-restarting");
		this.messages.offsetWidth;
		this.messages.classList.remove("marquee-restarting");
	}

	this.updateTimer = function(elapsed) {
		var untimed = this.practiceMode && !this.timer.classList.contains("lost");
		this.timer.classList[untimed ? "add" : "remove"]("zen");
		this.timerText.textContent = this.manualPaused ? "Paused" : formatTime(elapsed);
	}

	this.updatePauseControl = function() {
		var paused = this.manualPaused;
		document.body.classList[paused ? "add" : "remove"]("game-paused");
		for (var element of [board, this.hClues, this.vClues, this.boardActions, this.proofControls])
			element.inert = paused || this.pendingSeed !== undefined;
		this.timer.disabled = this.gameOver || this.practiceMode || this.pendingSeed !== undefined;
		this.timer.title = this.practiceMode ?
			(this.timer.classList.contains("lost") ? "Zen mode: time at loss" :
			 "Zen mode: no time limit") : paused ? "Resume game" : "Pause game";
		this.timer.setAttribute("aria-label", this.timer.title);
		this.updateTimer(this.timerTimeout === null ? this.timerElapsed : Date.now() - this.timerStarted);
	}

	this.togglePause = function() {
		if (this.gameOver || this.practiceMode || this.pageHidden ||
		    this.paused && !this.manualPaused)
			return;
		this.manualPaused = !this.manualPaused;
		this.paused = this.manualPaused;
		if (this.manualPaused) {
			this.closeSlotTray();
			this.stopTimer();
		} else {
			this.startTimer();
		}
		this.updatePauseControl();
	}

	this.loadHistory = async function(run, level = "all") {
		var request = this.pantheonRequest = {};
		var gameIdentity = this.gameIdentity;
		var current = () => this.pantheonRequest === request &&
			this.gameIdentity === gameIdentity;
		var history = await accessRunHistory(run, false, level);
		if (history && run)
			this.gameStats = history.gameStats;
		if (history && level != "all") {
			for (var candidate of history.unratedRuns || []) {
				var last = history.highScores[9];
				if (last && (candidate.elapsed > last.elapsed ||
				    candidate.elapsed == last.elapsed && candidate.id > last.id))
					break;
				await new Promise(resolve => setTimeout(resolve, 0));
				if (!current())
					return !!history;
				try {
					candidate.difficulty = puzzleDifficulty(puzzleFromSeed(candidate.seed));
					await saveRunDifficulty(candidate.id, candidate.difficulty);
					if (candidate.difficulty.level == level) {
						history.highScores.push(candidate);
						history.highScores.sort((a, b) => a.elapsed - b.elapsed || a.id - b.id);
						history.highScores = history.highScores.slice(0, 10);
					}
				} catch (e) {
					/* An unrateable legacy run cannot enter a specific ranking. */
				}
			}
		}
		if (!current())
			return !!history;
		this.pantheonLevel = level;
		this.pantheonLoading = false;
		this.historyError = history ? "" : run ?
			"Your result could not be saved." : "The Chronicle could not be loaded.";
		if (history) {
			this.highScores = history.highScores;
			this.gameStats = history.gameStats;
			var highlighted = this.highlightedScore;
			this.highlightedScore = highlighted ?
				this.highScores.find(function(score) {
					return score.id === highlighted.id;
				}) || null : null;
		}
		return !!history;
	}

	this.recordOutcome = async function(outcome) {
		var gameIdentity = this.gameIdentity;
		/* Capture the finished game before the asynchronous save.
		 * date is the finish time in Unix milliseconds; elapsed is
		 * active play time in milliseconds, excluding pauses.
		 */
		var run = {
			date: Date.now(),
			seed: this.seed,
			elapsed: this.timerElapsed,
			outcome: outcome,
			rows: this.rows.length,
			columns: this.rows[0].slots.length,
			generatorVersion: puzzleGeneratorVersion,
		};
		if (canRateRun(run))
			run.difficulty = puzzleDifficulty(this);
		var saving = this.loadHistory(run,
			outcome == "won" && run.difficulty ? run.difficulty.level : "all");
		var request = this.pantheonRequest;
		var saved = await saving;
		if (this.pantheonRequest !== request)
			return saved;
		var highScore = this.highScores.find(function(score) {
			return run.id !== undefined && score.id === run.id;
		});
		/* A completed save must not interrupt a newer game. */
		if (highScore && this.gameIdentity === gameIdentity) {
			this.showPantheon();
			this.highlightedScore = highScore;
			if (this.scores.hidden)
				this.toggleModal(this.scores, this.scoresButton,
					"Rejoin the mortal realm");
		}
		if (!saved && this.gameIdentity === gameIdentity)
			this.say("Your result could not be saved.");
		if (!this.scores.hidden)
			this.renderHighScores();
		return saved;
	}

	this.renderHighScores = function() {
		var status = this.scores.querySelector(".scores-status");
		this.scores.querySelector(".pantheon-tablet").setAttribute(
			"aria-busy", String(!!this.pantheonLoading));
		for (var level of ["all", "easy", "medium", "hard"])
			this.scores.querySelector(".pantheon-" + level).setAttribute(
				"aria-pressed", String(level == this.pantheonLevel));
		/* Keep the current tablet in place until its replacement is ready. */
		if (this.pantheonLoading)
			return;
		status.hidden = !this.historyError;
		status.textContent = this.historyError || "";
		var list = this.scores.querySelector("ol");
		var empty = this.scores.querySelector(".scores-empty");
		this.scores.querySelector(".game-stats").hidden = !!this.historyError;
		list.hidden = !!this.historyError;
		if (this.historyError) {
			empty.hidden = true;
			return;
		}
		var gamesSought = this.gameStats.won + this.gameStats.lost;
		this.scores.querySelector(".games-sought").textContent = gamesSought;
		this.scores.querySelector(".games-sought-unit").textContent =
			gamesSought == 1 ? "time" : "times";
		this.scores.querySelector(".games-won").textContent =
			this.gameStats.won;
		list.innerHTML = "";
		empty.hidden = this.highScores.length != 0;
		empty.textContent = this.pantheonLevel == "all" ?
			"No victors have been enshrined." :
			"No " + this.pantheonLevel + " victories have been enshrined.";
		for (var i = 0; i < this.highScores.length; i++) {
			var item = document.createElement("li");
			if (this.highScores[i] == this.highlightedScore) {
				item.className = "score-new";
				item.setAttribute("aria-current", "true");
			}
			var entry = document.createElement("button");
			entry.className = "score-entry";
			entry.type = "button";
			entry.addEventListener("click", function(id) {
				return function() { return puzzle.showRunHistory(id); };
			}(this.highScores[i].id));
			var date = document.createElement("span");
			date.className = "score-date";
			var modern = document.createElement("span");
			modern.className = "score-modern-date";
			modern.textContent = formatScoreDate(this.highScores[i].date);
			date.appendChild(modern);
			if (this.highScores[i].date !== null) {
				var attic = document.createElement("span");
				attic.className = "score-attic-date";
				attic.textContent = greekNumeralDay(
					this.highScores[i].date) + " " +
					atticMonth(this.highScores[i].date) + " · " +
					formatOlympiad(this.highScores[i].date);
				date.appendChild(attic);
			}
			entry.appendChild(date);
			var time = document.createElement("span");
			time.className = "score-time";
			time.textContent = formatTime(this.highScores[i].elapsed);
			entry.appendChild(time);
			item.appendChild(entry);
			list.appendChild(item);
		}
	}

	this.clearPantheonTransition = function() {
		var transition = this.pantheonTransition;
		if (!transition)
			return;
		for (var animation of transition.animations)
			animation.cancel();
		transition.old.remove();
		transition.tablet.inert = false;
		this.pantheonTransition = null;
	}

	this.selectPantheon = async function(level) {
		var levels = ["all", "easy", "medium", "hard"];
		if (!levels.includes(level) || level == this.pantheonLevel && !this.historyError)
			return;
		var direction = levels.indexOf(level) > levels.indexOf(this.pantheonLevel) ? 1 : -1;
		this.clearPantheonTransition();
		this.pantheonLevel = level;
		this.pantheonLoading = true;
		this.historyError = "";
		this.renderHighScores();
		var gameIdentity = this.gameIdentity;
		var loading = this.loadHistory(undefined, level);
		var request = this.pantheonRequest;
		await loading;
		if (this.pantheonRequest !== request || this.gameIdentity !== gameIdentity ||
		    this.scores.hidden || this.scores.querySelector(".pantheon-view").hidden)
			return;
		var stage = this.scores.querySelector(".pantheon-tablets");
		var tablet = this.scores.querySelector(".pantheon-tablet");
		var animate = typeof tablet.animate == "function" &&
			!matchMedia("(prefers-reduced-motion: reduce)").matches;
		var old = animate ? tablet.cloneNode(true) : null;
		/* Retain room for the fullest tablet visited, including empty rankings.
		 * Using em keeps the reserved height in step with responsive font sizes.
		 */
		if (stage.getBoundingClientRect)
			stage.style.minHeight = stage.getBoundingClientRect().height /
				parseFloat(getComputedStyle(stage).fontSize) + "em";
		this.renderHighScores();
		if (!animate)
			return;
		old.classList.add("pantheon-tablet-old");
		old.setAttribute("aria-hidden", "true");
		old.inert = true;
		tablet.inert = true;
		stage.appendChild(old);
		var timing = { duration: 260, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" };
		var transition = this.pantheonTransition = { old: old, tablet: tablet, animations: [
			old.animate([
				{ transform: "translateX(0)", opacity: 1 },
				{ transform: "translateX(" + (-direction * 100) + "%)", opacity: 0.2 },
			], timing),
			tablet.animate([
				{ transform: "translateX(" + (direction * 100) + "%)", opacity: 0.2 },
				{ transform: "translateX(0)", opacity: 1 },
			], timing),
		] };
		await Promise.all(transition.animations.map(animation => animation.finished.catch(() => {})));
		if (this.pantheonTransition === transition)
			this.clearPantheonTransition();
	}

	this.showPantheon = function() {
		this.scores.querySelector(".pantheon-view").hidden = false;
		this.scores.querySelector(".history-view").hidden = true;
		this.scores.querySelector("#scores-title").textContent = "The Pantheon of the Wise";
		var close = this.scores.querySelector(".modal-close");
		close.classList.remove("help-page-turn");
		close.classList.add("modal-done");
		close.value = this.resumeAfterModal ? "Resume game" : "Rejoin the mortal realm";
		close.title = close.value;
		close.setAttribute("aria-label", close.value);
		this.scores.querySelector(".scores-actions").appendChild(close);
		this.scores.querySelector(".history-open").focus();
	}

	this.showRunHistory = async function(id) {
		this.clearPantheonTransition();
		this.pantheonRequest = {};
		var gameIdentity = this.gameIdentity;
		var history = await accessRunHistory(null, true);
		if (this.scores.hidden || this.gameIdentity !== gameIdentity)
			return;
		this.runHistory = history ? history.runs : null;
		this.historyDifficultyFailures = new WeakSet();
		this.selectedRun = id;
		this.historySort = "newest";
		this.scores.querySelector(".history-wins").checked = true;
		this.scores.querySelector(".history-losses").checked = true;
		for (var level of ["easy", "medium", "hard"])
			this.scores.querySelector(".history-" + level).checked = true;
		this.scores.querySelector(".pantheon-view").hidden = true;
		this.scores.querySelector(".history-view").hidden = false;
		this.scores.querySelector("#scores-title").textContent = "Chronicle of Trials";
		var close = this.scores.querySelector(".modal-close");
		close.classList.remove("modal-done");
		close.classList.add("help-page-turn");
		close.value = "Exitus";
		close.title = "Close the Chronicle";
		close.setAttribute("aria-label", "Close the Chronicle");
		this.scores.querySelector(".history-folio").appendChild(close);
		this.renderRunHistory();
		var selected = this.scores.querySelector(".history-selected");
		if (id !== undefined && selected) {
			selected.focus({ preventScroll: true });
		} else {
			this.scores.querySelector(".modal-close").focus();
		}
	}

	this.sortRunHistory = function(column) {
		if (column == "date")
			this.historySort = this.historySort == "newest" ? "oldest" : "newest";
		else
			this.historySort = this.historySort == "fastest" ? "slowest" : "fastest";
		this.renderRunHistory();
	}

	this.renderRunHistory = function(page) {
		var request = this.historyDifficultyRequest = {};
		var wins = this.scores.querySelector(".history-wins").checked;
		var losses = this.scores.querySelector(".history-losses").checked;
		var levels = ["easy", "medium", "hard"].filter(level =>
			this.scores.querySelector(".history-" + level).checked);
		var filteringDifficulty = levels.length > 0 && levels.length < 3;
		var pendingDifficulty = [];
		var sort = this.historySort;
		this.scores.querySelector(".history-date-sort").setAttribute("aria-sort",
			sort == "newest" ? "descending" : sort == "oldest" ? "ascending" : "none");
		this.scores.querySelector(".history-time-sort").setAttribute("aria-sort",
			sort == "fastest" ? "ascending" : sort == "slowest" ? "descending" : "none");
		var runs = (this.runHistory || []).filter(function(run) {
			return (wins && run.outcome == "won") || (losses && run.outcome == "lost");
		}).filter(run => {
			if (filteringDifficulty && !hasRunDifficulty(run) && canRateRun(run) &&
			    !this.historyDifficultyFailures.has(run))
				pendingDifficulty.push({ run: run });
			/* Unknown difficulties remain visible when all levels are selected. */
			return levels.length == 3 || hasRunDifficulty(run) &&
				levels.includes(run.difficulty.level);
		}).sort(function(a, b) {
			if (sort == "fastest" || sort == "slowest")
				return (sort == "fastest" ? a.elapsed - b.elapsed : b.elapsed - a.elapsed) || a.id - b.id;
			/* Imported runs with unknown dates always go last. */
			if (a.date === null || b.date === null)
				return (a.date === null) - (b.date === null) || a.id - b.id;
			return (sort == "oldest" ? a.date - b.date : b.date - a.date) || a.id - b.id;
		});
		var status = this.scores.querySelector(".history-status");
		status.hidden = this.runHistory !== null && runs.length > 0;
		status.textContent = this.runHistory === null ? "The Chronicle could not be loaded." :
			this.runHistory.length ? "No runs match this filter." : "No runs recorded yet.";
		if (pendingDifficulty.length) {
			status.hidden = false;
			status.textContent = "Checking difficulty…";
		}
		this.scores.querySelector(".history-table").hidden = !runs.length;
		var body = this.scores.querySelector(".history-table tbody");
		body.replaceChildren();
		var selectedRun = this.selectedRun;
		var difficultyEntries = [];
		function makeRow(run) {
			var row = document.createElement("tr");
			if (run.id === selectedRun) {
				row.className = "history-selected";
				row.tabIndex = -1;
				row.setAttribute("aria-current", "true");
			}
			var values = [formatScoreDate(run.date, true),
				run.outcome == "won" ? "Win" : "Loss", formatTime(run.elapsed),
				run.seed === undefined ? "—" : formatSeed(run.seed)];
			for (var value of values) {
				var cell = document.createElement("td");
				cell.textContent = value;
				row.appendChild(cell);
			}
			if (run.seed !== undefined) {
				var link = document.createElement("a");
				link.textContent = formatSeed(run.seed);
				link.href = "#seed=" + formatSeed(run.seed);
				link.target = "_blank";
				link.rel = "noopener";
				link.title = "Open this puzzle in a new tab";
				row.children[3].replaceChildren(link);
			}
			var difficulty = document.createElement("td");
			difficulty.className = "history-difficulty";
			showRunDifficulty(difficulty, run);
			row.appendChild(difficulty);
			difficultyEntries.push({ run: run, element: difficulty });
			if (run.date !== null)
				row.children[0].title = new Date(run.date).toLocaleString(undefined, {
					dateStyle: "full", timeStyle: "long", hourCycle: "h23",
				});
			return row;
		}
		/* Measure one row to fit a leaf to the available panel height. */
		var pageSize = 8;
		if (runs.length) {
			var sample = makeRow(runs[0]);
			body.appendChild(sample);
			var available = this.scores.querySelector(".history-page-content").clientHeight;
			var heading = this.scores.querySelector(".history-table thead").offsetHeight;
			if (sample.offsetHeight)
				pageSize = Math.max(1, Math.floor((available - heading - 1) / sample.offsetHeight));
			body.replaceChildren();
		}
		difficultyEntries = [];
		var pages = Math.max(1, Math.ceil(runs.length / pageSize));
		/* Explicit page turns take precedence; otherwise follow the highlight. */
		if (page === undefined) {
			var index = runs.findIndex(function(run) { return run.id === selectedRun; });
			page = index < 0 ? 0 : Math.floor(index / pageSize);
		}
		this.historyPage = Math.max(0, Math.min(page, pages - 1));
		var start = this.historyPage * pageSize;
		for (var run of runs.slice(start, start + pageSize))
			body.appendChild(makeRow(run));
		this.scores.querySelector(".history-folio .help-page-number").textContent =
			"Leaf " + romanNumeral(this.historyPage + 1) + " of " + romanNumeral(pages);
		this.scores.querySelector(".history-folio .help-page-previous").disabled = this.historyPage == 0;
		this.scores.querySelector(".history-folio .help-page-next").disabled = this.historyPage == pages - 1;
		this.historyDifficultyTask = this.fillRunDifficulties(
			filteringDifficulty ? pendingDifficulty : difficultyEntries, request,
			filteringDifficulty ? { page: page } : null);
	}

	this.fillRunDifficulties = async function(entries, request, refresh) {
		for (var entry of entries) {
			var run = entry.run;
			if (hasRunDifficulty(run) || !canRateRun(run))
				continue;
			/* Let the page paint and handle input between expensive ratings. */
			await new Promise(resolve => setTimeout(resolve, 0));
			if (this.historyDifficultyRequest !== request || this.scores.hidden ||
			    this.scores.querySelector(".history-view").hidden)
				return;
			try {
				run.difficulty = puzzleDifficulty(puzzleFromSeed(run.seed));
				if (entry.element)
					showRunDifficulty(entry.element, run);
				await saveRunDifficulty(run.id, run.difficulty);
			} catch (e) {
				this.historyDifficultyFailures.add(run);
				if (entry.element) {
					entry.element.textContent = "—";
					entry.element.title = "Difficulty unavailable";
					entry.element.setAttribute("aria-label", entry.element.title);
				}
			}
		}
		if (entries.length && refresh &&
		    this.historyDifficultyRequest === request && !this.scores.hidden &&
		    !this.scores.querySelector(".history-view").hidden)
			this.renderRunHistory(refresh.page);
	}

	this.clearOutcome = function() {
		this.timer.classList.remove("won", "lost", "contemplating");
		this.messages.classList.remove("won", "lost");
	}

	this.startTimer = function() {
		this.timerStarted = Date.now() - this.timerElapsed;
		this.scheduleTimerUpdate();
	}

	this.scheduleTimerUpdate = function() {
		var puzzle = this;
		var elapsed = Date.now() - this.timerStarted;
		var delay = 1000 - elapsed % 1000;
		this.timerTimeout = setTimeout(function() {
			puzzle.updateTimer(Date.now() - puzzle.timerStarted);
			puzzle.scheduleTimerUpdate();
		}, delay);
	}

	this.stopTimer = function() {
		if (this.timerTimeout === null)
			return;
		this.timerElapsed = Date.now() - this.timerStarted;
		this.updateTimer(this.timerElapsed);
		clearTimeout(this.timerTimeout);
		this.timerTimeout = null;
		this.timerStarted = null;
	}

	this.generateClues = function() {
		this.hClues.classList.remove("solution");
		this.vClues.classList.remove("solution");
		generatePuzzleClues(this, this.hClueSlots.length, this.vClueSlots.length);

		for (var i = 0; i < this.hClueSlots.length; i++) {
			this.hClueSlots[i].innerHTML = "";
			this.hClueSlots[i].className = "clue";
			this.hClueSlots[i].onclick = null;
			this.hClueSlots[i].oncontextmenu = null;
			this.hClueSlots[i].onpointerdown = null;
			this.hClueSlots[i].onpointerup = null;
			this.hClueSlots[i].onpointercancel = null;
			this.hClueSlots[i].onpointermove = null;
		}
		for (var i = 0; i < this.vClueSlots.length; i++) {
			this.vClueSlots[i].innerHTML = "";
			this.vClueSlots[i].className = "clue";
			this.vClueSlots[i].onclick = null;
			this.vClueSlots[i].oncontextmenu = null;
			this.vClueSlots[i].onpointerdown = null;
			this.vClueSlots[i].onpointerup = null;
			this.vClueSlots[i].onpointercancel = null;
			this.vClueSlots[i].onpointermove = null;
		}

		this.numHClues = 0;
		this.numVClues = 0;
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (clue.applyInitialState) {
				clue.applyInitialState();
				continue;
			} else if (clue.displayType == "horizontal")
				clue.display = this.getHClueSlot();
			else if (clue.displayType == "vertical")
				clue.display = this.getVClueSlot();
			checkClueDisplay(clue);
		}
	}

	this.sufficientClues = function() {
		return cluesSolve(this, this.clues);
	}

	this.getHClueSlot = function() { return this.hClueSlots[this.numHClues++]; }
	this.getVClueSlot = function() { return this.vClueSlots[this.numVClues++]; }

	this.clueSlotsForType = function(type) {
		return type == "horizontal" ? this.hClueSlots : this.vClueSlots;
	}

	this.clearClueDropMarker = function() {
		if (!this.clueDrag || !this.clueDrag.target)
			return;
		this.clueDrag.target.classList.remove("clue-drop-target");
		this.clueDrag.target = null;
	}

	this.beginClueDrag = function(clue, slot, ev) {
		if (ev.shiftKey || (ev.button !== undefined && ev.button != 0) ||
		    this.gameOver || this.paused || this.proof)
			return;
		this.clueDrag = {
			clue: clue,
			slot: slot,
			pointerId: ev.pointerId,
			startX: ev.clientX,
			startY: ev.clientY,
			active: false,
			target: null,
		};
		if (slot.setPointerCapture)
			slot.setPointerCapture(ev.pointerId);
	}

	this.updateClueDrag = function(ev) {
		var drag = this.clueDrag;
		if (!drag || drag.pointerId != ev.pointerId)
			return;
		var dx = ev.clientX - drag.startX;
		var dy = ev.clientY - drag.startY;
		if (!drag.active) {
			if (dx * dx + dy * dy < 64)
				return;
			drag.active = true;
			drag.clue.suppressClick = true;
			drag.slot.classList.add("clue-dragging");
			clearClueHighlights(this);
		}
		ev.preventDefault();
		this.clearClueDropMarker();
		if (!document.elementFromPoint)
			return;
		var elem = document.elementFromPoint(ev.clientX, ev.clientY);
		var slots = this.clueSlotsForType(drag.clue.displayType);
		var target = null;
		for (var i = 0; i < slots.length; i++) {
			if (slots[i] == elem ||
			    (slots[i].contains && slots[i].contains(elem))) {
				target = slots[i];
				break;
			}
		}
		if (!target)
			return;
		drag.target = target;
		target.classList.add("clue-drop-target");
	}

	this.endClueDrag = function(ev, cancel) {
		var drag = this.clueDrag;
		if (!drag || drag.pointerId != ev.pointerId)
			return;
		if (!cancel && drag.active)
			this.updateClueDrag(ev);
		var target = drag.target;
		this.clearClueDropMarker();
		drag.slot.classList.remove("clue-dragging");
		this.clueDrag = null;
		if (!cancel && drag.active && target)
			this.moveClueToSlot(drag.clue, target);
		if (drag.active) {
			this.suppressClueClick = drag.slot;
			var puzzle = this;
			setTimeout(function() {
				drag.clue.suppressClick = false;
				puzzle.suppressClueClick = null;
			}, 0);
		}
	}

	this.moveClueToSlot = function(clue, target) {
		var slots = this.clueSlotsForType(clue.displayType);
		var ordered = this.clues.filter(function(item) {
			return item.displayType == clue.displayType && item.display;
		}).sort(function(a, b) {
			return slots.indexOf(a.display) - slots.indexOf(b.display);
		});
		var from = ordered.indexOf(clue);
		var to = slots.indexOf(target);
		ordered.splice(from, 1);
		if (from < to)
			to--;
		to = Math.max(0, Math.min(to, ordered.length));
		ordered.splice(to, 0, clue);
		for (var i = 0; i < slots.length; i++) {
			slots[i].innerHTML = "";
			slots[i].className = "clue";
			slots[i].onclick = null;
			slots[i].oncontextmenu = null;
			slots[i].onpointerdown = null;
			slots[i].onpointerup = null;
			slots[i].onpointercancel = null;
			slots[i].onpointermove = null;
		}
		for (var i = 0; i < ordered.length; i++) {
			ordered[i].display = slots[i];
			ordered[i].render();
			checkClueDisplay(ordered[i]);
		}
	}

	this.toggleModal = function(modal, button, closeText) {
		if (modal.hidden) {
			this.resumeAfterModal = !this.gameOver &&
				this.timerTimeout !== null;
			var done = modal.querySelector(".modal-close");
			if (done)
				done.value = this.resumeAfterModal ?
					"Resume game" : closeText;
			this.paused = true;
			if (this.resumeAfterModal)
				this.stopTimer();
			modal.hidden = false;
		} else {
			if (modal === this.scores)
				this.clearPantheonTransition();
			if (modal === this.scores && this.pantheonLoading) {
				this.pantheonRequest = {};
				this.pantheonLoading = false;
			}
			modal.hidden = true;
			this.paused = this.manualPaused || this.pageHidden || this.pendingSeed !== undefined;
			if (!this.gameOver && !this.practiceMode && !this.paused &&
			    this.timerTimeout === null)
				this.startTimer();
			this.resumeAfterModal = false;
		}
		button.setAttribute("aria-expanded", !modal.hidden);
	}

	this.toggleOptions = function() {
		if (this.options.hidden && this.seed !== undefined)
			this.options.querySelector("#game-seed").value =
				formatSeed(this.seed);
		this.updateSeedControls();
		this.toggleModal(this.options, this.optionsButton, "Close");
		this.updateSeedDifficulty();
	}

	this.toggleHelp = function() {
		if (this.help.hidden)
			this.showHelpPage(0);
		this.toggleModal(this.help, this.helpButton, "Close");
	}

	this.showHelpPage = function(page) {
		this.helpPage = Math.max(0,
			Math.min(this.helpPages.length - 1, page));
		for (var i = 0; i < this.helpPages.length; i++)
			this.helpPages[i].hidden = this.helpPage != i;
	}

	this.turnHelpPage = function(direction) {
		this.showHelpPage(this.helpPage + direction);
		var selector = direction > 0 ?
			".help-page-previous" : ".help-page-next";
		this.helpPages[this.helpPage].querySelector(selector).focus();
	}

	this.toggleScores = async function() {
		if (!this.scores.hidden) {
			this.pantheonRequest = {};
			this.toggleModal(this.scores, this.scoresButton,
				"Rejoin the mortal realm");
			this.highlightedScore = null;
			return;
		}
		this.scores.querySelector(".pantheon-tablets").style.minHeight = "";
		var gameIdentity = this.gameIdentity;
		await this.loadHistory();
		if (this.gameIdentity !== gameIdentity)
			return;
		this.renderHighScores();
		if (this.scores.hidden)
			this.toggleModal(this.scores, this.scoresButton,
				"Rejoin the mortal realm");
		this.showPantheon();
	}

	this.toggleAbout = function() {
		this.toggleModal(this.about, this.logoButton, "Close");
	}

	this.dismissTransientUi = function() {
		if (!this.slotTray.hidden) {
			this.closeSlotTray();
			return true;
		}
		var modals = document.querySelectorAll(".modal:not([hidden])");
		if (!modals.length)
			return false;
		var close = modals[modals.length - 1].querySelector(".modal-close");
		if (!close)
			return false;
		close.click();
		return true;
	}

	this.setPageHidden = function(hidden) {
		if (hidden == this.pageHidden)
			return;
		this.pageHidden = hidden;
		if (hidden) {
			this.resumeAfterPageHidden = !this.gameOver &&
				this.timerTimeout !== null;
			this.pausedBeforePageHidden = this.paused;
			if (this.resumeAfterPageHidden)
				this.stopTimer();
			this.paused = true;
			this.closeSlotTray();
			this.stopSampleSounds();
		} else {
			this.paused = this.pausedBeforePageHidden;
			if (this.resumeAfterPageHidden && !this.gameOver &&
			    !this.paused && this.timerTimeout === null)
				this.startTimer();
			this.resumeAfterPageHidden = false;
			this.pausedBeforePageHidden = false;
		}
	}

	var puzzle = this;
	this.options.querySelector("#game-seed").addEventListener("paste", function(ev) {
		if (!ev.clipboardData)
			return;
		ev.preventDefault();
		this.value = ev.clipboardData.getData("text/plain").trim();
		puzzle.updateSeedControls();
		puzzle.updateSeedDifficulty();
	});
	this.options.querySelector("#game-seed").addEventListener("input", function() {
		puzzle.updateSeedControls();
		puzzle.updateSeedDifficulty(true);
	});
	this.options.querySelector("#game-seed").addEventListener("blur", function() {
		puzzle.updateSeedDifficulty();
	});
	this.options.addEventListener("click", function(ev) {
		if (ev.target == puzzle.options)
			puzzle.toggleOptions();
	});
	this.hintNotice.addEventListener("click", function(ev) {
		if (ev.target == puzzle.hintNotice)
			puzzle.finishHintNotice(false);
	});
	this.help.addEventListener("click", function(ev) {
		if (ev.target == puzzle.help)
			puzzle.toggleHelp();
	});
	this.scores.addEventListener("click", function(ev) {
		if (ev.target == puzzle.scores)
			puzzle.toggleScores();
	});
	this.about.addEventListener("click", function(ev) {
		if (ev.target == puzzle.about)
			puzzle.toggleAbout();
	});
	this.slotTray.addEventListener("click", function(ev) {
		if (ev.target == puzzle.slotTray)
			puzzle.closeSlotTray();
	});
	document.addEventListener("fullscreenchange", function() {
		puzzle.updateFullscreenButton();
	});
	document.addEventListener("keydown", function(ev) {
		if (ev.key == "Control" || ev.key == "Shift" || ev.key == "Alt") {
			if (ev.key == "Control")
				puzzle.controlHeld = true;
			else if (ev.key == "Shift")
				puzzle.shiftHeld = true;
			else
				puzzle.altHeld = true;
			puzzle.updateActionCursor();
		}
		if (ev.key == "Escape" && !ev.altKey && !ev.ctrlKey &&
		    !ev.metaKey && !ev.shiftKey && puzzle.dismissTransientUi()) {
			ev.preventDefault();
			return;
		}
		if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey)
			return;
		var direction;
		if (ev.key == "ArrowLeft")
			direction = -1;
		else if (ev.key == "ArrowRight")
			direction = 1;
		else
			return;
		var modals = document.querySelectorAll(".modal:not([hidden])");
		if (modals.length) {
			var target = ev.target;
			if (target && (target.isContentEditable ||
			    target.tagName == "SELECT" || target.tagName == "TEXTAREA" ||
			    (target.tagName == "INPUT" &&
			     !["button", "submit", "reset", "checkbox"].includes(target.type))))
				return;
			var modal = modals[modals.length - 1];
			if (modal == puzzle.help) {
				ev.preventDefault();
				var page = puzzle.helpPage + direction;
				if (page >= 0 && page < puzzle.helpPages.length)
					puzzle.turnHelpPage(direction);
			} else if (modal == puzzle.scores &&
			           !puzzle.scores.querySelector(".history-view").hidden) {
				ev.preventDefault();
				puzzle.renderRunHistory(puzzle.historyPage + direction);
			}
			return;
		}
		if (!puzzle.proof || puzzle.paused)
			return;
		ev.preventDefault();
		puzzle.moveProof(direction);
	});
	document.addEventListener("keyup", function(ev) {
		if (ev.key == "Control" || ev.key == "Shift" || ev.key == "Alt") {
			if (ev.key == "Control")
				puzzle.controlHeld = false;
			else if (ev.key == "Shift")
				puzzle.shiftHeld = false;
			else
				puzzle.altHeld = false;
			puzzle.updateActionCursor();
		}
	});
	document.addEventListener("visibilitychange", function() {
		puzzle.setPageHidden(document.hidden);
	});
	if (typeof window != "undefined") {
		window.addEventListener("resize", function() {
			puzzle.positionSlotTray();
			if (!puzzle.scores.hidden && !puzzle.scores.querySelector(".history-view").hidden)
				puzzle.renderRunHistory(puzzle.historyPage);
		});
		window.addEventListener("blur", function() {
			puzzle.controlHeld = false;
			puzzle.shiftHeld = false;
			puzzle.altHeld = false;
			puzzle.updateActionCursor();
		});
	}

	this.setCustomCursor = function(enabled) {
		document.body.dataset.customCursor = enabled;
		this.options.querySelector("#custom-cursor").checked = enabled;
		try {
			if (!this.loadingOptions)
				localStorage.setItem("customCursor", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}


	this.setMilestones = function(show) {
		this.showMilestones = show;
		this.options.querySelector("#show-milestones").checked = show;
		try {
			if (!this.loadingOptions)
				localStorage.setItem("showMilestones", show);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setAutoDismissClues = function(enabled) {
		this.autoDismissClues = enabled;
		this.options.querySelector("#auto-dismiss-clues").checked = enabled;
		if (enabled)
			this.dismissExhaustedClues();
		try {
			if (!this.loadingOptions)
				localStorage.setItem("autoDismissClues", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setRandomDifficulties = function(levels) {
		this.randomDifficulties = ["easy", "medium", "hard"].filter(level => levels.includes(level));
		for (var level of ["easy", "medium", "hard"])
			this.options.querySelector("#random-" + level).checked = this.randomDifficulties.includes(level);
		try {
			if (!this.loadingOptions)
				localStorage.setItem("randomDifficulties", JSON.stringify(this.randomDifficulties));
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.changeRandomDifficulties = function() {
		this.setRandomDifficulties(["easy", "medium", "hard"].filter(level =>
			this.options.querySelector("#random-" + level).checked));
	}

	this.setPracticeMode = function(enabled) {
		this.practiceModePreference = enabled;
		this.options.querySelector("#practice-mode").checked = enabled;
		try {
			if (!this.loadingOptions)
				localStorage.setItem("practiceMode", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
		if (!enabled && this.practiceMode && !this.gameOver) {
			this.say("Accepting enlightenment is a one-way door. " +
				"Your next journey will not be so calm.");
			return false;
		}
		this.practiceMode = enabled;
		if (enabled) {
			this.manualPaused = false;
			if (!this.gameOver)
				this.scoreEligible = false;
			this.stopTimer();
		} else if (!this.gameOver && !this.paused &&
			   this.timerTimeout === null) {
			this.startTimer();
		}
		this.timer.hidden = this.seed === undefined;
		this.updatePauseControl();
		return true;
	}

	this.setContinueAfterLoss = function(enabled) {
		this.continueAfterLoss = enabled;
		this.options.querySelector("#continue-after-loss").checked = enabled;
		try {
			if (!this.loadingOptions)
				localStorage.setItem("continueAfterLoss", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setSoundEffects = function(enabled) {
		this.soundEffects = enabled;
		this.options.querySelector("#sound-effects").checked = enabled;
		this.options.querySelector("#sound-volume").disabled = !enabled;
		if (this.soundGain)
			this.soundGain.gain.value = enabled ? this.soundVolume : 0;
		for (var name in this.soundSamples)
			this.soundSamples[name].muted = !enabled;
		try {
			if (!this.loadingOptions)
				localStorage.setItem("soundEffects", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setSoundVolume = function(volume) {
		this.soundVolume = Number.isFinite(volume) ?
			Math.max(0, Math.min(1, volume)) : 1;
		var input = this.options.querySelector("#sound-volume");
		input.value = Math.round(this.soundVolume * 100);
		input.setAttribute("aria-valuetext", input.value + "%");
		input.title = "Volume: " + input.value + "%";
		if (this.soundGain)
			this.soundGain.gain.value = this.soundEffects ? this.soundVolume : 0;
		for (var name in this.soundSamples)
			this.soundSamples[name].volume = this.soundVolumes[name] * this.soundVolume;
		try {
			if (!this.loadingOptions)
				localStorage.setItem("soundVolume", this.soundVolume);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setExpandTileChoices = function(enabled) {
		this.expandTileChoices = enabled;
		this.options.querySelector("#expand-tile-choices").checked = enabled;
		if (!enabled)
			this.closeSlotTray();
		try {
			if (!this.loadingOptions)
				localStorage.setItem("expandTileChoices", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setShowActionSelector = function(enabled) {
		this.showActionSelector = enabled;
		this.options.querySelector("#show-action-selector").checked = enabled;
		this.updateActionCursor();
		this.updateActionControls();
		try {
			if (!this.loadingOptions)
				localStorage.setItem("showActionSelector", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.updateActionControls = function() {
		this.updatePauseControl();
		var show = this.showActionSelector && !this.gameOver;
		if (this.seed === undefined)
			document.body.classList.remove("game-started");
		else
			document.body.classList.add("game-started");
		this.boardActions.hidden = !show;
		this.invitation.hidden = this.pendingSeed === undefined;
		this.logoButton.hidden = show;
	}

	this.updateFullscreenButton = function() {
		var button = this.options.querySelector("#fullscreen-button");
		button.hidden = !document.fullscreenEnabled;
		button.value = document.fullscreenElement ?
			"Exit full screen" : "Enter full screen";
	}

	this.toggleFullscreen = function() {
		var action = document.fullscreenElement ?
			document.exitFullscreen() :
			document.documentElement.requestFullscreen({
				navigationUI: "hide",
			});
		action.catch(function() {
			/* The browser may decline a fullscreen request. */
		});
	}

	this.getAudioContext = function() {
		if (this.audioContext)
			return this.audioContext;
		if (typeof window == "undefined")
			return null;
		var AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext)
			return null;
		try {
			this.audioContext = new AudioContext();
		} catch (e) {
			return null;
		}
		return this.audioContext;
	}

	this.getSoundOutput = function(context) {
		if (!this.soundGain) {
			this.soundGain = context.createGain();
			this.soundGain.gain.value = this.soundEffects ? this.soundVolume : 0;
			this.soundGain.connect(context.destination);
		}
		return this.soundGain;
	}

	this.loadSampleSound = function(name) {
		var context = this.getAudioContext();
		if (!context ||
		    this.soundBuffers[name] || this.soundBufferPromises[name])
			return;
		var puzzle = this;
		if (typeof fetch == "undefined")
			return;
		this.soundBufferPromises[name] = fetch(this.soundSamples[name].src)
			.then(function(response) {
				return response.arrayBuffer();
			})
			.then(function(data) {
				return context.decodeAudioData(data);
			})
			.then(function(buffer) {
				puzzle.soundBuffers[name] = buffer;
			})
			.catch(function(error) {
				if (typeof console != "undefined")
					console.warn("falling back to media playback for " +
						name + " sound", error);
				/* The media element remains available as a fallback. */
			});
	}

	this.stopSampleSounds = function() {
		for (var name in this.soundSamples) {
			this.soundSamples[name].pause();
			this.soundSamples[name].currentTime = 0;
		}
		if (this.sampleSource) {
			try {
				this.sampleSource.stop();
			} catch (e) {
				/* It may already have stopped naturally. */
			}
			this.sampleSource = null;
		}
	}

	this.playMediaSampleSound = function(name, rate) {
		var audio = this.soundSamples[name];
		audio.volume = this.soundVolumes[name] * this.soundVolume;
		audio.playbackRate = rate;
		var playback = audio.play();
		if (playback)
			playback.catch(function() {});
	}

	this.playSampleSound = function(name) {
		var audio = this.soundSamples[name];
		if (!audio)
			return;
		var variation = this.soundVariations[name];
		var position = this.soundSequencePositions[name] || 0;
		var rate = 1 + variation * this.soundSequence[position];
		this.soundSequencePositions[name] =
			(position + 1) % this.soundSequence.length;

		this.stopSampleSounds();
		var context = this.getAudioContext();
		var buffer = this.soundBuffers[name];
		if (!context || !buffer) {
			this.loadSampleSound(name);
			this.playMediaSampleSound(name, rate);
			return;
		}
		if (context.state == "suspended")
			context.resume();
		var source = context.createBufferSource();
		var gain = context.createGain();
		source.buffer = buffer;
		source.playbackRate.value = rate;
		gain.gain.value = this.soundVolumes[name];
		source.connect(gain).connect(this.getSoundOutput(context));
		this.sampleSource = source;
		var puzzle = this;
		source.onended = function() {
			if (puzzle.sampleSource == source)
				puzzle.sampleSource = null;
		};
		source.start();
	}

	this.playSound = function(type) {
		if (this.effectsSuppressed || !this.soundEffects)
			return;
		if (this.soundSamples[type]) {
			this.playSampleSound(type);
			return;
		}
		var context = this.getAudioContext();
		if (!context)
			return;
		if (context.state == "suspended")
			context.resume();
		var output = this.getSoundOutput(context);
		var variation = 0.94 + Math.random() * 0.12;
		if (type == "win") {
			var notes = [587.33, 783.99, 659.25, 880,
				     783.99, 1046.5, 880, 1174.66,
				     1046.5, 1318.51, 1174.66, 1567.98];
			var delays = [0, 0.09, 0.17, 0.26, 0.34, 0.43,
				      0.52, 0.62, 0.73, 0.85, 0.98, 1.12];
			for (var i = 0; i < notes.length; i++)
				playChime(context, notes[i] * variation, delays[i],
					i == notes.length - 1 ? 0.07 : 0.05, output);
		} else if (type == "practice-mistake") {
			playChime(context, 523.25 * variation, 0, 0.018, output);
			playChime(context, 440 * variation, 0.13, 0.014, output);
		}
	}

	for (var name in this.soundSamples)
		this.loadSampleSound(name);

	var customCursor = true;
	var showMilestones = true;
	var autoDismissClues = true;
	var practiceMode = false;
	var randomDifficulties = ["easy", "medium", "hard"];
	try {
		var storedDifficulties = JSON.parse(localStorage.getItem("randomDifficulties"));
		if (Array.isArray(storedDifficulties) &&
		    storedDifficulties.every(level => randomDifficulties.includes(level)))
			randomDifficulties = storedDifficulties;
	} catch (e) {
		/* Missing or invalid preferences use all difficulties. */
	}
	var continueAfterLoss = false;
	var soundEffects = true;
	var soundVolume = 1;
	var expandTileChoices = this.expandTileChoices;
	var showActionSelector = this.showActionSelector;
	try {
		var storedCustomCursor = localStorage.getItem("customCursor");
		var storedMilestones = localStorage.getItem("showMilestones");
		var storedAutoDismissClues = localStorage.getItem(
			"autoDismissClues");
		var storedPracticeMode = localStorage.getItem("practiceMode");
		var storedContinueAfterLoss = localStorage.getItem(
			"continueAfterLoss");
		var storedSoundEffects = localStorage.getItem("soundEffects");
		var storedSoundVolume = localStorage.getItem("soundVolume");
		var storedExpandTileChoices = localStorage.getItem(
			"expandTileChoices");
		var storedShowActionSelector = localStorage.getItem(
			"showActionSelector");
		var oldSelectionActionMenu = localStorage.getItem(
			"selectionActionMenu");
		if (storedCustomCursor !== null)
			customCursor = storedCustomCursor == "true";
		if (storedMilestones !== null)
			showMilestones = storedMilestones == "true";
		if (storedAutoDismissClues !== null)
			autoDismissClues = storedAutoDismissClues == "true";
		if (storedPracticeMode !== null)
			practiceMode = storedPracticeMode == "true";
		if (storedContinueAfterLoss !== null)
			continueAfterLoss = storedContinueAfterLoss == "true";
		if (storedSoundEffects !== null)
			soundEffects = storedSoundEffects == "true";
		if (storedSoundVolume !== null)
			soundVolume = Number(storedSoundVolume);
		if (storedExpandTileChoices !== null)
			expandTileChoices = storedExpandTileChoices == "true";
		else if (oldSelectionActionMenu !== null)
			expandTileChoices = oldSelectionActionMenu == "true";
		if (storedShowActionSelector !== null)
			showActionSelector = storedShowActionSelector == "true";
	} catch (e) {
		/* Storage may be unavailable for local files. */
	}
	this.highScores = [];
	this.pantheonLevel = "all";
	this.pantheonLoading = false;
	this.gameStats = { won: 0, lost: 0 };
	/* Applying saved preferences must not write a stale snapshot back. */
	this.loadingOptions = true;
	this.setRandomDifficulties(randomDifficulties);
	this.setCustomCursor(customCursor);
	this.setMilestones(showMilestones);
	this.setAutoDismissClues(autoDismissClues);
	this.setPracticeMode(practiceMode);
	this.setContinueAfterLoss(continueAfterLoss);
	this.setSoundEffects(soundEffects);
	this.setSoundVolume(soundVolume);
	this.setExpandTileChoices(expandTileChoices);
	this.setShowActionSelector(showActionSelector);
	this.loadingOptions = false;
	this.updateFullscreenButton();

	this.clear();
}

function formatTime(elapsed) {
	var totalSeconds = Math.floor(elapsed / 1000);
	var minutes = Math.floor(totalSeconds / 60);
	var seconds = totalSeconds % 60;
	return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

function romanNumeral(number) {
	var result = "";
	for (var [value, symbol] of [
		[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
		[100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
		[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
	]) {
		while (number >= value) {
			result += symbol;
			number -= value;
		}
	}
	return result;
}

function formatScoreDate(timestamp, compact) {
	if (timestamp === null)
		return "Earlier";
	var date = new Date(timestamp);
	var month = date.toLocaleDateString(undefined, { month: compact ? "short" : "long" });
	return date.getDate() + " " + month + " " +
		date.getFullYear() + (compact ? "" : " CE");
}

function atticMonth(timestamp) {
	/* Decorative correspondence only; the Attic calendar was lunar. */
	var months = [
		"Gamelion", "Anthesterion", "Elaphebolion", "Mounichion",
		"Thargelion", "Skirophorion", "Hekatombaion", "Metageitnion",
		"Boedromion", "Pyanopsion", "Maimakterion", "Poseideon",
	];
	return months[new Date(timestamp).getMonth()];
}

function greekNumeralDay(timestamp) {
	var day = new Date(timestamp).getDate();
	var tens = ["", "ι", "κ", "λ"];
	var units = ["", "α", "β", "γ", "δ", "ε", "ϛ", "ζ", "η", "θ"];
	return tens[Math.floor(day / 10)] + units[day % 10] + "\u0374";
}

function formatOlympiad(timestamp) {
	var date = new Date(timestamp);
	var olympiadYear = date.getFullYear();
	/* Use July 1 as a decorative approximation of the summer boundary. */
	if (date.getMonth() < 6)
		olympiadYear--;
	var yearsSinceFirst = olympiadYear + 775;
	var olympiad = Math.floor(yearsSinceFirst / 4) + 1;
	var year = yearsSinceFirst % 4 + 1;
	return "Olympiad " + olympiad + "." + year;
}

/* Import legacy scores and optionally append a run, then return a committed
 * Pantheon summary. Record keys are exposed as id, but remain out-of-line.
 */
function accessRunHistory(run, includeRuns, level = "all") {
	return new Promise(function(resolve) {
		if (typeof indexedDB == "undefined") {
			resolve(null);
			return;
		}
		var request = indexedDB.open("logos", 2);
		request.onupgradeneeded = function(event) {
			var store = event.oldVersion < 1 ?
				request.result.createObjectStore("runs", { autoIncrement: true }) :
				request.transaction.objectStore("runs");
			if (event.oldVersion < 2)
				store.createIndex("outcomeElapsed", ["outcome", "elapsed"]);
		};
		request.onerror = function() { resolve(null); };
		request.onsuccess = function() {
			var db = request.result;
			db.onversionchange = function() { db.close(); };
			var legacy = null;
			try {
				legacy = localStorage.getItem("highScores");
			} catch (e) {
				/* IndexedDB may still be usable when localStorage is not. */
			}
			try {
				var scores = parseLegacyScores(legacy);
				var transaction = db.transaction("runs",
					run || legacy !== null ? "readwrite" : "readonly");
				var store = transaction.objectStore("runs");
				var summary = { highScores: [], gameStats: { won: 0, lost: 0 } };
				if (level != "all")
					summary.unratedRuns = [];
				var added = [];
				transaction.oncomplete = function() {
					db.close();
					for (var i = 0; i < added.length; i++)
						added[i].entry.id = added[i].id;
					/* Leave legacy data intact until its import commits. */
					try {
						if (legacy !== null)
							localStorage.removeItem("highScores");
						localStorage.removeItem("gameStats");
					} catch (e) {
						/* A later access can retry the cleanup. */
					}
					resolve(summary);
				};
				transaction.onabort = function() {
					db.close();
					resolve(null);
				};
				function add(entry) {
					store.add(entry).onsuccess = function(event) {
						added.push({ entry: entry, id: event.target.result });
					};
				}
				function readSummary() {
					if (run)
						add(run);
					if (includeRuns) {
						summary.runs = [];
						store.openCursor().onsuccess = function(event) {
							var cursor = event.target.result;
							if (!cursor)
								return;
							summary.runs.push(Object.assign({}, cursor.value,
								{ id: cursor.primaryKey }));
							cursor.continue();
						};
					}
					var index = store.index("outcomeElapsed");
					var wins = IDBKeyRange.bound(["won", 0], ["won", Number.MAX_VALUE]);
					var losses = IDBKeyRange.bound(["lost", 0], ["lost", Number.MAX_VALUE]);
					index.count(wins).onsuccess = function(event) {
						summary.gameStats.won = event.target.result;
					};
					index.count(losses).onsuccess = function(event) {
						summary.gameStats.lost = event.target.result;
					};
					index.openCursor(wins).onsuccess = function(event) {
						var cursor = event.target.result;
						if (!cursor)
							return;
						var entry = Object.assign({}, cursor.value, { id: cursor.primaryKey });
						if (level == "all" || hasRunDifficulty(entry) &&
						    entry.difficulty.level == level)
							summary.highScores.push(entry);
						else if (!hasRunDifficulty(entry) && canRateRun(entry))
							summary.unratedRuns.push(entry);
						if (summary.highScores.length < 10)
							cursor.continue();
					};
				}
				if (!scores.length) {
					readSummary();
				} else {
					/* Only legacy import needs to inspect the full history. */
					store.getAll().onsuccess = function(event) {
						var known = new Set(event.target.result.filter(function(entry) {
							return entry.outcome == "won";
						}).map(legacyScoreKey));
						for (var i = 0; i < scores.length; i++) {
							var key = legacyScoreKey(scores[i]);
							if (known.has(key))
								continue;
							known.add(key);
							add(Object.assign({}, scores[i], {
								outcome: "won", generatorVersion: 1,
								rows: 6, columns: 6,
							}));
						}
						readSummary();
					};
				}
			} catch (e) {
				db.close();
				resolve(null);
			}
		};
	}).catch(function() {
		/* Storage failures must not prevent finishing the game. */
		return null;
	});
}

/* Patch only difficulty, preserving the stored run and its out-of-line key.
 * A failed cache write is harmless: a future visit can calculate it again.
 */
function saveRunDifficulty(id, difficulty) {
	return new Promise(function(resolve) {
		if (typeof indexedDB == "undefined" || id === undefined) {
			resolve(false);
			return;
		}
		var request = indexedDB.open("logos", 2);
		request.onerror = function() { resolve(false); };
		request.onsuccess = function() {
			var db = request.result;
			db.onversionchange = function() { db.close(); };
			try {
				var transaction = db.transaction("runs", "readwrite");
				transaction.oncomplete = function() { db.close(); resolve(true); };
				transaction.onabort = function() { db.close(); resolve(false); };
				var store = transaction.objectStore("runs");
				store.get(id).onsuccess = function(event) {
					var run = event.target.result;
					if (run) {
						run.difficulty = difficulty;
						store.put(run, id);
					}
				};
			} catch (e) {
				db.close();
				resolve(false);
			}
		};
	}).catch(function() { return false; });
}

function legacyScoreKey(score) {
	return JSON.stringify([score.date, score.seed, score.elapsed]);
}

function parseLegacyScores(raw) {
	var scores = JSON.parse(raw || "[]");
	if (!Array.isArray(scores))
		throw new Error("Invalid legacy high scores");
	return scores.map(function(score) {
		/* Early versions stored only elapsed times, then added dates and seeds. */
		if (Number.isFinite(score) && score >= 0)
			return { elapsed: score, date: null };
		if (!score || !Number.isFinite(score.elapsed) || score.elapsed < 0)
			throw new Error("Invalid legacy high score");
		var entry = { elapsed: score.elapsed, date: null };
		if (Number.isFinite(score.date) && score.date >= 0)
			entry.date = score.date;
		if (Number.isInteger(score.seed) && score.seed >= 0 && score.seed <= 0xffffffff)
			entry.seed = score.seed;
		return entry;
	});
}

function playChime(context, frequency, delay, volume, output) {
	var partials = [1, 2.76, 5.4, 8.93];
	var strengths = [0.7, 1, 0.32, 0.12];
	var durations = [1.5, 1.15, 0.65, 0.38];
	var start = context.currentTime + delay;
	for (var i = 0; i < partials.length; i++) {
		var oscillator = context.createOscillator();
		var gain = context.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = frequency * partials[i];
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume * strengths[i],
			start + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001,
			start + durations[i]);
		oscillator.connect(gain).connect(output);
		oscillator.start(start);
		oscillator.stop(start + durations[i]);
	}
}

/* Shared by gameplay and reconstruction of stored version-1 seeds. */
function generatePuzzleClues(puzzle, horizontalLimit, verticalLimit) {
	puzzle.clues = [];
	var types = [ExactClue, OrderClue, Adjacent2Clue,
		     Adjacent3Clue, ColumnClue];
	do {
		while (!cluesSolve(puzzle, puzzle.clues)) {
			var type = weightedChoice(types);
			var clue = new type(puzzle);
			puzzle.clues.push(clue);
			if (clue.displayType)
				clue.active = true;
		}

		for (var i = puzzle.clues.length - 1; i >= 0; i--) {
			var without = puzzle.clues.slice();
			without.splice(i, 1);
			if (cluesSolve(puzzle, without))
				puzzle.clues = without;
		}

		puzzle.clues = limitDisplayedClues(puzzle.clues,
			"horizontal", horizontalLimit);
		puzzle.clues = limitDisplayedClues(puzzle.clues,
			"vertical", verticalLimit);
	} while (!cluesSolve(puzzle, puzzle.clues));
}

function puzzleFromSeed(seed) {
	return withPuzzleRandom(seed, function() {
		var puzzle = { rows: [], clues: [] };
		for (var r = 0; r < 6; r++) {
			var row = { puzzle: puzzle, slots: [] };
			var values = shuffle([0, 1, 2, 3, 4, 5]);
			for (var value of values)
				row.slots.push({ row: row, value: value });
			puzzle.rows.push(row);
		}
		generatePuzzleClues(puzzle, 18, 8);
		return puzzle;
	});
}

function canRateRun(run) {
	return Number.isInteger(run.seed) && run.seed >= 0 && run.seed <= 0xffffffff &&
		run.generatorVersion == puzzleGeneratorVersion &&
		run.rows == 6 && run.columns == 6;
}

function hasRunDifficulty(run) {
	return run.difficulty && Number.isFinite(run.difficulty.score) &&
		run.difficulty.score >= 0 &&
		["easy", "medium", "hard"].includes(run.difficulty.level);
}

function showRunDifficulty(element, run) {
	if (hasRunDifficulty(run)) {
		var level = run.difficulty.level;
		element.textContent = level[0].toUpperCase() + level.slice(1);
		element.title = "Difficulty: " + element.textContent;
	} else {
		element.textContent = canRateRun(run) ? "…" : "—";
		element.title = "Difficulty unavailable";
	}
	element.setAttribute("aria-label", element.title);
}

function limitDisplayedClues(clues, displayType, limit) {
	var count = 0;
	return clues.filter(function(clue) {
		if (clue.displayType != displayType)
			return true;
		return count++ < limit;
	});
}

// Generate a random integer in the interval [lo, hi).
function randInt(lo, hi) {
	return lo + Math.floor(puzzleRandom() * (hi - lo));
}

function randomChoice(choices) {
	return choices[randInt(0, choices.length)];
}

function weightedChoice(choices) {
	var total = 0;
	for (var i = 0; i < choices.length; i++)
		total += choices[i].weight;

	var value = puzzleRandom() * total;
	for (var i = 0; i < choices.length; i++) {
		value -= choices[i].weight;
		if (value < 0)
			return choices[i];
	}
}

function shuffle(array) {
	for (var i = array.length - 1; i >= 0; i--) {
		var r = Math.floor(puzzleRandom() * (i+1));
		var tmp = array[i];
		array[i] = array[r];
		array[r] = tmp;
	}
	return array;
}

function copyDomains(domains) {
	return domains.map(function(row) { return row.slice(); });
}

function domainsFromSlots(puzzle) {
	var domains = [];
	for (var row = 0; row < puzzle.rows.length; row++)
		domains[row] = domainsFromRow(puzzle.rows[row]);
	return domains;
}

function proofPlacementsFromSlots(puzzle) {
	var placements = Array(puzzle.rows.length).fill(0);
	for (var row = 0; row < puzzle.rows.length; row++)
		for (var col = 0; col < puzzle.rows[row].slots.length; col++) {
			var slot = puzzle.rows[row].slots[col];
			if (slot.single)
				placements[row] |= 1 << slot.value;
		}
	return placements;
}

function domainsFromRow(row) {
	var rowSize = row.slots.length;
	var domains = Array(rowSize).fill(0);
	for (var col = 0; col < rowSize; col++) {
		var slot = row.slots[col];
		var bit = 1 << col;
		if (slot.single)
			domains[slot.value] |= bit;
		else
			for (var symbol = 0; symbol < rowSize; symbol++)
				if (slot.possible[symbol])
					domains[symbol] |= bit;
	}
	return domains;
}

function applyMove(domains, slot, value, discard, rows) {
	var row = rows.indexOf(slot.row);
	var col = slot.row.slots.indexOf(slot);
	var bit = 1 << col;
	if (discard) {
		domains[row][value] &= ~bit;
	} else {
		for (var symbol = 0; symbol < domains[row].length; symbol++)
			domains[row][symbol] &= ~bit;
		domains[row][value] = bit;
	}
}

function applyPencilMark(domains, mark) {
	var col = mark.slot.row.slots.indexOf(mark.slot);
	var bit = 1 << col;
	if (mark.discard) {
		domains[mark.value] &= ~bit;
	} else {
		domains[mark.value] &= bit;
		for (var symbol = 0; symbol < domains.length; symbol++)
			if (symbol != mark.value)
				domains[symbol] &= ~bit;
	}
}

function propagatePencilRow(domains) {
	var changed;
	do {
		changed = false;
		var singles = 0;
		for (var symbol = 0; symbol < domains.length; symbol++) {
			var domain = domains[symbol];
			if (domain && (domain & (domain - 1)) == 0)
				singles |= domain;
		}
		for (var symbol = 0; symbol < domains.length; symbol++) {
			var domain = domains[symbol];
			if (domain && (domain & (domain - 1)) != 0) {
				var reduced = domain & ~singles;
				if (reduced != domain) {
					domains[symbol] = reduced;
					changed = true;
				}
			}
		}

		for (var col = 0; col < domains.length; col++) {
			var bit = 1 << col;
			var candidate = -1;
			for (var symbol = 0; symbol < domains.length; symbol++) {
				if (domains[symbol] & bit) {
					if (candidate >= 0) {
						candidate = -2;
						break;
					}
					candidate = symbol;
				}
			}
			if (candidate >= 0 && domains[candidate] != bit) {
				domains[candidate] = bit;
				changed = true;
			}
		}
	} while (changed);

	var singles = 0;
	for (var symbol = 0; symbol < domains.length; symbol++) {
		var domain = domains[symbol];
		if (!domain)
			return true;
		if ((domain & (domain - 1)) == 0) {
			if (singles & domain)
				return true;
			singles |= domain;
		}
	}
	for (var col = 0; col < domains.length; col++) {
		var bit = 1 << col;
		var found = false;
		for (var symbol = 0; symbol < domains.length; symbol++)
			if (domains[symbol] & bit)
				found = true;
		if (!found)
			return true;
	}
	return false;
}

function cluesAllow(puzzle, clues, domains) {
	var numRows = puzzle.rows.length;
	var rowSize = puzzle.rows[0].slots.length;
	var fullDomain = (1 << rowSize) - 1;

	var changed;
	do {
		changed = false;

		/* Each column contains exactly one symbol from each row. */
		for (var row = 0; row < numRows; row++) {
			var singles = 0;
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if (!domain)
					return false;
				if ((domain & (domain - 1)) == 0) {
					if (singles & domain)
						return false;
					singles |= domain;
				}
			}
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if ((domain & (domain - 1)) != 0) {
					var reduced = domain & ~singles;
					if (reduced != domain) {
						domains[row][symbol] = reduced;
						changed = true;
					}
				}
			}

			/* A column which has only one candidate fixes that symbol. */
			for (var col = 0; col < rowSize; col++) {
				var bit = 1 << col;
				var candidate = -1;
				for (var symbol = 0; symbol < rowSize; symbol++) {
					if (domains[row][symbol] & bit) {
						if (candidate >= 0) {
							candidate = -2;
							break;
						}
						candidate = symbol;
					}
				}
				if (candidate == -1)
					return false;
				if (candidate >= 0 && domains[row][candidate] != bit) {
					domains[row][candidate] = bit;
					changed = true;
				}
			}
		}

		for (var i = 0; i < clues.length; i++) {
			if (clues[i].constrain(domains, fullDomain))
				changed = true;
		}
	} while (changed);
	return true;
}

function countBits(bits) {
	var count = 0;
	for (; bits; bits &= bits - 1)
		count++;
	return count;
}

function proofSymbolReference(puzzle, row, symbol) {
	return "\ue000" + row + ":" + symbol + "\ue001";
}

function proofMessageText(puzzle, message) {
	return message.replace(/\ue000(\d+):(\d+)\ue001/g,
		function(match, row, symbol) {
			return puzzle.rows[row].slots[0].symbols[symbol];
		});
}

function renderProofMessage(puzzle, elem, message, qed, contradicts) {
	if (contradicts) {
		var placement = /^(\ue000\d+:\d+\ue001)( must be\b)/;
		if (!placement.test(message))
			throw new Error("contradicting proof is not a placement");
		message = message.replace(placement,
			"$1, not " + contradicts + ",$2");
	}
	var suffix = qed ? " Q.E.D." : "";
	elem.textContent = proofMessageText(puzzle, message) + suffix;
	var wrapper = document.createElement("span");
	wrapper.className = "proof-message";
	var pattern = /\ue000(\d+):(\d+)\ue001/g;
	var offset = 0;
	var match;
	while ((match = pattern.exec(message))) {
		wrapper.appendChild(document.createTextNode(
			message.slice(offset, match.index)));
		var row = Number(match[1]);
		var symbol = Number(match[2]);
		var tile = document.createElement("span");
		tile.className = "proof-tile " + puzzle.rows[row].familyClass;
		tile.textContent = puzzle.rows[row].slots[0].symbols[symbol];
		wrapper.appendChild(tile);
		offset = pattern.lastIndex;
	}
	wrapper.appendChild(document.createTextNode(message.slice(offset) + suffix));
	elem.replaceChildren(wrapper);
}

/*
 * Keep deduction identifiers stable when changing their messages. Besides
 * making the proof logic easier to discuss, they let related presentation
 * steps be recognized without comparing their rendered text.
 */
var proofDeductionCatalog = [
	{ id: "adjacent2.not-adjacent",
	  message: "{subject} cannot be in {positions} because {other} is not adjacent." },
	{ id: "adjacent3.middle.outer-not-adjacent",
	  message: "{subject} cannot be in {positions} because {outer} must be adjacent." },
	{ id: "adjacent3.middle.placement-between",
	  message: "{subject} must be in the {position} column because it must be between {left} and {right}." },
	{ id: "adjacent3.middle.placement",
	  message: "{subject} must be in the {position} column because that is the only place where {left} and {right} can fit on opposite sides of it." },
	{ id: "adjacent3.middle.no-neighbor",
	  message: "{subject} cannot be in the {position} column because neither {left} nor {right} can be in the {neighbor} column." },
	{ id: "adjacent3.middle.remove-edges",
	  message: "{subject} cannot be on either edge because it is between two symbols." },
	{ id: "adjacent3.placement.inward-from-edge",
	  message: "{subject} must be in the {position} column because the sequence containing {outer} can only extend toward the center." },
	{ id: "adjacent3.outer.middle-not-adjacent",
	  message: "{subject} cannot be in {positions} because {middle} must be adjacent." },
	{ id: "adjacent3.outer.placement",
	  message: "{subject} must be in the {position} column to complete the sequence with {middle} and {other}." },
	{ id: "adjacent3.outer.only-position",
	  message: "{subject} must be in the {position} column because that is the only place where {middle} can be between it and {other}." },
	{ id: "adjacent3.outer.no-orientation",
	  message: "{subject} cannot be in the {position} column because {middle} and {other} cannot fit beside it in either orientation." },
	{ id: "adjacent3.outer.other-not-two-away",
	  message: "{subject} cannot be in {positions} because {other} must be two positions away." },
	{ id: "clue.placement",
	  message: "{subject} must be in the {position} column." },
	{ id: "column.placement",
	  message: "{subject} must be in the {position} column with {other}." },
	{ id: "column.other-not-position",
	  message: "{subject} cannot be in {positions} because {other} is not." },
	{ id: "conclusion.placement",
	  message: "{subject} must be in the {position} column because it is the only remaining option." },
	{ id: "conclusion.remove-position",
	  message: "{subject} cannot be in the {position} column." },
	{ id: "order.other-not-beyond",
	  message: "{subject} cannot be in {positions} because {other} must be to its {otherDirection}." },
	{ id: "row.only-candidate",
	  message: "{subject} must be in the {position} column because it is the only remaining option." },
	{ id: "row.only-position",
	  message: "{subject} must be in the {position} column because it has been eliminated everywhere else." },
];

var proofDeductionIds = proofDeductionCatalog.map(function(entry) {
	return entry.id;
});
if (new Set(proofDeductionIds).size != proofDeductionIds.length)
	throw new Error("duplicate proof deduction identifier");

function identifiedDeduction(step, id, values) {
	var entry = proofDeductionCatalog.find(function(candidate) {
		return candidate.id == id;
	});
	if (!entry)
		throw new Error("missing proof deduction: " + id);
	step.deduction = id;
	step.deductionValues = values;
	return entry.message.replace(/\{([A-Za-z]+)\}/g,
		function(match, name) {
			if (!Object.hasOwn(values, name))
				throw new Error("missing value " + name + " for " + id);
			return values[name];
		});
}

function deductionMessage(puzzle, step, before, after) {
	var row = step.row;
	var symbol = step.symbol;
	var name = proofSymbolReference(puzzle, row, symbol);
	var removed = before & ~after;
	var rowSize = puzzle.rows[row].slots.length;
	var fullDomain = (1 << rowSize) - 1;
	if (step.placement && countBits(after) == 1) {
		var col = 0;
		while (!(after & (1 << col)))
			col++;
		return identifiedDeduction(step, "clue.placement", {
			subject: name,
			position: ordinalName(col),
		});
	}
	if (removed == ((1 << 0) | (1 << (rowSize - 1))))
		return identifiedDeduction(step, "clue.remove-edges", {
			subject: name,
		});
	if (countBits(removed) == 1) {
		var col = 0;
		while (!(removed & (1 << col)))
			col++;
		return identifiedDeduction(step, "clue.remove-position", {
			subject: name,
			position: ordinalName(col),
		});
	}
	if (after != fullDomain)
		return identifiedDeduction(step, "clue.narrow-positions", {
			subject: name,
		});
	return identifiedDeduction(step, "clue.fewer-positions", {
		subject: name,
	});
}

function adjacent3InwardPosition(outerDomain, rowSize, distance) {
	if (countBits(outerDomain) != 1)
		return 0;
	var col = 0;
	while (!(outerDomain & (1 << col)))
		col++;
	if (col < 2)
		return 1 << (col + distance);
	if (col >= rowSize - 2)
		return 1 << (col - distance);
	return 0;
}

function adjacent3DeductionMessage(puzzle, step, before, after, domains) {
	var clue = step.clue;
	var row = step.row;
	var symbol = step.symbol;
	var removed = before & ~after;
	var rowSize = domains[row].length;
	var middleRow = puzzle.rows.indexOf(clue.mRow);
	var middleSymbol = clue.mRow.slots[clue.mCol].value;
	var leftRow = puzzle.rows.indexOf(clue.lRow);
	var leftSymbol = clue.lRow.slots[clue.lCol].value;
	var rightRow = puzzle.rows.indexOf(clue.rRow);
	var rightSymbol = clue.rRow.slots[clue.rCol].value;
	var name = proofSymbolReference(puzzle, row, symbol);
	var middleName = proofSymbolReference(puzzle, middleRow, middleSymbol);
	var leftName = proofSymbolReference(puzzle, leftRow, leftSymbol);
	var rightName = proofSymbolReference(puzzle, rightRow, rightSymbol);
	var edges = 1 | (1 << (rowSize - 1));
	if (row == middleRow && symbol == middleSymbol) {
		if (step.placement && countBits(after) == 1) {
			var col = 0;
			while (!(after & (1 << col)))
				col++;
			if (countBits(domains[leftRow][leftSymbol]) == 1 &&
			    countBits(domains[rightRow][rightSymbol]) == 1)
				return identifiedDeduction(step,
					"adjacent3.middle.placement-between", {
						subject: name,
						position: ordinalName(col),
						left: leftName,
						right: rightName,
					});
			if (adjacent3InwardPosition(
			    domains[leftRow][leftSymbol], rowSize, 1) == after)
				return identifiedDeduction(step,
					"adjacent3.placement.inward-from-edge", {
						subject: name,
						position: ordinalName(col),
						outer: leftName,
					});
			if (adjacent3InwardPosition(
			    domains[rightRow][rightSymbol], rowSize, 1) == after)
				return identifiedDeduction(step,
					"adjacent3.placement.inward-from-edge", {
						subject: name,
						position: ordinalName(col),
						outer: rightName,
					});
			return identifiedDeduction(step,
				"adjacent3.middle.placement", {
					subject: name,
					position: ordinalName(col),
					left: leftName,
					right: rightName,
				});
		}
		if (removed == edges)
			return identifiedDeduction(step,
				"adjacent3.middle.remove-edges", { subject: name });
		if (countBits(removed) == 1) {
			var col = 0;
			while (!(removed & (1 << col)))
				col++;
			if (col == 0 || col == rowSize - 1)
				return identifiedDeduction(step,
					"adjacent3.middle.remove-edges", {
						subject: name,
					});
			var low = col > 0 ? 1 << (col - 1) : 0;
			var high = col + 1 < rowSize ? 1 << (col + 1) : 0;
			var leftDomain = domains[leftRow][leftSymbol];
			var rightDomain = domains[rightRow][rightSymbol];
			var adjacent = low | high;
			if (!(leftDomain & adjacent))
				return identifiedDeduction(step,
					"adjacent3.middle.outer-not-adjacent", {
						subject: name,
						positions: positionList(removed),
						outer: leftName,
					});
			if (!(rightDomain & adjacent))
				return identifiedDeduction(step,
					"adjacent3.middle.outer-not-adjacent", {
						subject: name,
						positions: positionList(removed),
						outer: rightName,
					});
			if (!(leftDomain & low) && !(rightDomain & low))
				return identifiedDeduction(step,
					"adjacent3.middle.no-neighbor", {
						subject: name,
						position: ordinalName(col),
						left: leftName,
						right: rightName,
						neighbor: ordinalName(col - 1),
					});
			if (!(leftDomain & high) && !(rightDomain & high))
				return identifiedDeduction(step,
					"adjacent3.middle.no-neighbor", {
						subject: name,
						position: ordinalName(col),
						left: leftName,
						right: rightName,
						neighbor: ordinalName(col + 1),
					});
			return identifiedDeduction(step,
				"adjacent3.middle.opposite-sides", {
					subject: name,
					position: ordinalName(col),
					left: leftName,
					right: rightName,
				});
		}
		var leftDomain = domains[leftRow][leftSymbol];
		var rightDomain = domains[rightRow][rightSymbol];
		if (positionsLackAdjacent(removed, leftDomain, rowSize))
			return identifiedDeduction(step,
				"adjacent3.middle.outer-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					outer: leftName,
				});
		if (positionsLackAdjacent(removed, rightDomain, rowSize))
			return identifiedDeduction(step,
				"adjacent3.middle.outer-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					outer: rightName,
				});
		return deductionMessage(puzzle, step, before, after);
	}

	var otherRow = row == leftRow && symbol == leftSymbol ?
		rightRow : leftRow;
	var otherSymbol = row == leftRow && symbol == leftSymbol ?
		rightSymbol : leftSymbol;
	var otherName = proofSymbolReference(puzzle, otherRow, otherSymbol);
	if (step.placement && countBits(after) == 1 &&
	    adjacent3InwardPosition(domains[otherRow][otherSymbol],
		rowSize, 2) == after) {
		var col = 0;
		while (!(after & (1 << col)))
			col++;
		return identifiedDeduction(step,
			"adjacent3.placement.inward-from-edge", {
				subject: name,
				position: ordinalName(col),
				outer: otherName,
			});
	}
	if (step.placement && countBits(after) == 1 &&
	    countBits(domains[middleRow][middleSymbol]) == 1 &&
	    countBits(domains[otherRow][otherSymbol]) == 1) {
		var col = 0;
		while (!(after & (1 << col)))
			col++;
		return identifiedDeduction(step, "adjacent3.outer.placement", {
			subject: name,
			position: ordinalName(col),
			middle: middleName,
			other: otherName,
		});
	}
	if (step.placement && countBits(after) == 1) {
		var col = 0;
		while (!(after & (1 << col)))
			col++;
		return identifiedDeduction(step, "adjacent3.outer.only-position", {
			subject: name,
			position: ordinalName(col),
			middle: middleName,
			other: otherName,
		});
	}
	if (countBits(removed) > 1) {
		var middleCannotFit = true;
		var otherCannotFit = true;
		for (var col = 0; col < rowSize; col++) {
			if (!(removed & (1 << col)))
				continue;
			var adjacent = 0;
			var twoAway = 0;
			if (col > 0)
				adjacent |= 1 << (col - 1);
			if (col + 1 < rowSize)
				adjacent |= 1 << (col + 1);
			if (col > 1)
				twoAway |= 1 << (col - 2);
			if (col + 2 < rowSize)
				twoAway |= 1 << (col + 2);
			if (domains[middleRow][middleSymbol] & adjacent)
				middleCannotFit = false;
			if (domains[otherRow][otherSymbol] & twoAway)
				otherCannotFit = false;
		}
		if (otherCannotFit)
			return identifiedDeduction(step,
				"adjacent3.outer.other-not-two-away", {
					subject: name,
					positions: positionList(removed),
					other: otherName,
				});
		if (middleCannotFit)
			return identifiedDeduction(step,
				"adjacent3.outer.middle-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					middle: middleName,
				});
	}

	if (countBits(removed) == 1) {
		var col = 0;
		while (!(removed & (1 << col)))
			col++;
		var adjacent = 0;
		var twoAway = 0;
		if (col > 0)
			adjacent |= 1 << (col - 1);
		if (col + 1 < rowSize)
			adjacent |= 1 << (col + 1);
		if (col > 1)
			twoAway |= 1 << (col - 2);
		if (col + 2 < rowSize)
			twoAway |= 1 << (col + 2);
		if (!(domains[middleRow][middleSymbol] & adjacent))
			return identifiedDeduction(step,
				"adjacent3.outer.middle-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					middle: middleName,
				});
		if (!(domains[otherRow][otherSymbol] & twoAway))
			return identifiedDeduction(step,
				"adjacent3.outer.other-not-two-away", {
					subject: name,
					positions: positionList(removed),
					other: otherName,
				});
		return identifiedDeduction(step,
			"adjacent3.outer.no-orientation", {
				subject: name,
				position: ordinalName(col),
				middle: middleName,
				other: otherName,
			});
	}
	return deductionMessage(puzzle, step, before, after);
}

function adjacent2DeductionMessage(puzzle, step, before, after) {
	var clue = step.clue;
	var removed = before & ~after;
	if (step.placement && countBits(after) == 1)
		return deductionMessage(puzzle, step, before, after);
	var leftRow = puzzle.rows.indexOf(clue.lRow);
	var leftSymbol = clue.lRow.slots[clue.lCol].value;
	var rightRow = puzzle.rows.indexOf(clue.rRow);
	var rightSymbol = clue.rRow.slots[clue.rCol].value;
	var otherRow = step.row == leftRow && step.symbol == leftSymbol ?
		rightRow : leftRow;
	var otherSymbol = step.row == leftRow && step.symbol == leftSymbol ?
		rightSymbol : leftSymbol;
	return identifiedDeduction(step, "adjacent2.not-adjacent", {
		subject: proofSymbolReference(puzzle, step.row, step.symbol),
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
	});
}

function orderDeductionMessage(puzzle, step, before, after) {
	var removed = before & ~after;
	if (step.placement && countBits(after) == 1)
		return deductionMessage(puzzle, step, before, after);
	var leftRow = puzzle.rows.indexOf(step.clue.lRow);
	var leftSymbol = step.clue.lRow.slots[step.clue.lCol].value;
	var isLeft = step.row == leftRow && step.symbol == leftSymbol;
	var subject = proofSymbolReference(puzzle, step.row, step.symbol);
	var otherRow = isLeft ? puzzle.rows.indexOf(step.clue.rRow) : leftRow;
	var otherSymbol = isLeft ? step.clue.rRow.slots[step.clue.rCol].value :
		leftSymbol;
	return identifiedDeduction(step, "order.other-not-beyond", {
		subject: subject,
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
		otherDirection: isLeft ? "right" : "left",
	});
}

function columnDeductionMessage(puzzle, step, before, after) {
	var removed = before & ~after;
	var clue = step.clue;
	var topRow = puzzle.rows.indexOf(clue.tRow);
	var topSymbol = clue.tRow.slots[clue.col].value;
	var otherRow = step.row == topRow && step.symbol == topSymbol ?
		puzzle.rows.indexOf(clue.bRow) : topRow;
	var otherSymbol = step.row == topRow && step.symbol == topSymbol ?
		clue.bRow.slots[clue.col].value : topSymbol;
	if (step.placement && countBits(after) == 1) {
		var col = 0;
		while (!(after & (1 << col)))
			col++;
		return identifiedDeduction(step, "column.placement", {
			subject: proofSymbolReference(puzzle, step.row, step.symbol),
			position: ordinalName(col),
			other: proofSymbolReference(puzzle, otherRow, otherSymbol),
		});
	}
	return identifiedDeduction(step, "column.other-not-position", {
		subject: proofSymbolReference(puzzle, step.row, step.symbol),
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
	});
}

function proofDeductionMessage(puzzle, step, before, after, domains) {
	if (step.clue && step.clue.mRow)
		return adjacent3DeductionMessage(puzzle, step, before, after,
			domains);
	if (step.clue && step.clue.constructor == Adjacent2Clue)
		return adjacent2DeductionMessage(puzzle, step, before, after);
	if (step.clue && step.clue.constructor == OrderClue)
		return orderDeductionMessage(puzzle, step, before, after);
	if (step.clue && step.clue.constructor == ColumnClue)
		return columnDeductionMessage(puzzle, step, before, after);
	return deductionMessage(puzzle, step, before, after);
}

function forcedProofMessage(puzzle, step) {
	var name = proofSymbolReference(puzzle, step.row, step.symbol);
	if (step.rule == "only-position")
		return identifiedDeduction(step, "row.only-position", {
			subject: name,
			position: ordinalName(step.column),
		});
	return identifiedDeduction(step, "row.only-candidate", {
		subject: name,
		position: ordinalName(step.column),
	});
}

function ordinalName(col) {
	var names = ["first", "second", "third", "fourth", "fifth", "sixth"];
	return names[col] || String(col + 1);
}

function positionsLackAdjacent(positions, domain, rowSize) {
	for (var col = 0; col < rowSize; col++) {
		if (!(positions & (1 << col)))
			continue;
		var adjacent = 0;
		if (col > 0)
			adjacent |= 1 << (col - 1);
		if (col + 1 < rowSize)
			adjacent |= 1 << (col + 1);
		if (domain & adjacent)
			return false;
	}
	return true;
}

function positionList(bits) {
	var positions = [];
	for (var col = 0; bits; col++, bits >>= 1)
		if (bits & 1)
			positions.push(ordinalName(col));
	if (positions.length == 1)
		return "the " + positions[0] + " column";
	if (positions.length == 2)
		return "the " + positions[0] + " and " + positions[1] +
			" columns";
	return "the " + positions.slice(0, -1).join(", ") + ", and " +
		positions[positions.length - 1] + " columns";
}

function adjacent3OuterHasCommonCause(puzzle, step, removed, domains) {
	var clue = step.clue;
	var middleRow = puzzle.rows.indexOf(clue.mRow);
	var middleSymbol = clue.mRow.slots[clue.mCol].value;
	if (step.row == middleRow && step.symbol == middleSymbol)
		return false;
	var leftRow = puzzle.rows.indexOf(clue.lRow);
	var leftSymbol = clue.lRow.slots[clue.lCol].value;
	var rightRow = puzzle.rows.indexOf(clue.rRow);
	var rightSymbol = clue.rRow.slots[clue.rCol].value;
	var otherRow = step.row == leftRow && step.symbol == leftSymbol ?
		rightRow : leftRow;
	var otherSymbol = step.row == leftRow && step.symbol == leftSymbol ?
		rightSymbol : leftSymbol;
	var middleCannotFit = true;
	var otherCannotFit = true;
	for (var col = 0; col < domains[step.row].length; col++) {
		if (!(removed & (1 << col)))
			continue;
		var adjacent = 0;
		var twoAway = 0;
		if (col > 0)
			adjacent |= 1 << (col - 1);
		if (col + 1 < domains[step.row].length)
			adjacent |= 1 << (col + 1);
		if (col > 1)
			twoAway |= 1 << (col - 2);
		if (col + 2 < domains[step.row].length)
			twoAway |= 1 << (col + 2);
		if (domains[middleRow][middleSymbol] & adjacent)
			middleCannotFit = false;
		if (domains[otherRow][otherSymbol] & twoAway)
			otherCannotFit = false;
	}
	return middleCannotFit || otherCannotFit;
}

function adjacent3OuterCommonCauseGroup(puzzle, step, removed, domains) {
	var group = 0;
	for (var bits = removed; bits; bits &= bits - 1) {
		var bit = bits & -bits;
		if (!group || adjacent3OuterHasCommonCause(puzzle, step,
		    group | bit, domains))
			group |= bit;
	}
	return group;
}

function proofConcluded(puzzle, domains, failedSlot, failedValue) {
	var row = puzzle.rows.indexOf(failedSlot.row);
	var col = failedSlot.row.slots.indexOf(failedSlot);
	var bit = 1 << col;
	if (failedSlot.value == failedValue) {
		if (!(domains[row][failedValue] & bit))
			return false;
		for (var symbol = 0; symbol < domains[row].length; symbol++)
			if (symbol != failedValue && domains[row][symbol] & bit)
				return false;
		return true;
	}
	return !(domains[row][failedValue] & bit);
}

function proofConclusionPresented(puzzle, domains, placements,
				  failedSlot, failedValue) {
	if (!proofConcluded(puzzle, domains, failedSlot, failedValue))
		return false;
	if (failedSlot.value != failedValue)
		return true;
	var row = puzzle.rows.indexOf(failedSlot.row);
	return !!(placements[row] & (1 << failedValue));
}

function proofStepDomain(before, after, rowSize, groupEdges) {
	var removed = before & ~after;
	var edges = 1 | (1 << (rowSize - 1));
	if (countBits(after) == 1 || groupEdges && removed == edges ||
	    countBits(removed) <= 1)
		return after;
	return before & ~(removed & -removed);
}

function nextForcedProofStep(domains, placements) {
	for (var row = 0; row < domains.length; row++) {
		for (var symbol = 0; symbol < domains[row].length; symbol++) {
			var domain = domains[row][symbol];
			if (domain && !(domain & (domain - 1)) &&
			    !(placements[row] & (1 << symbol))) {
				var col = 0;
				while (!(domain & (1 << col)))
					col++;
				return {
					clues: [],
					rule: "only-position",
					placement: true,
					column: col,
					row: row,
					symbol: symbol,
					removed: 0,
				};
			}
		}

		for (var col = 0; col < domains[row].length; col++) {
			var bit = 1 << col;
			var candidate = -1;
			for (var symbol = 0; symbol < domains[row].length; symbol++) {
				if (!(domains[row][symbol] & bit))
					continue;
				if (candidate >= 0) {
					candidate = -2;
					break;
				}
				candidate = symbol;
			}
			if (candidate >= 0 &&
			    !(placements[row] & (1 << candidate))) {
				var removed = domains[row][candidate] & ~bit;
				return {
					clues: [],
					rule: "only-candidate",
					placement: true,
					column: col,
					row: row,
					symbol: candidate,
					removed: removed,
				};
			}
		}
	}
	return null;
}

function clueDirectlyPlaces(clue, domains, row, symbol, fullDomain) {
	/* Adjacent-three placements describe the whole sequence constraint. */
	if (clue.constructor == Adjacent3Clue)
		return true;
	var expanded = copyDomains(domains);
	expanded[row][symbol] = fullDomain;
	clue.constrain(expanded, fullDomain);
	return countBits(expanded[row][symbol]) == 1;
}

function clueProofStep(puzzle, clue, domains) {
	var fullDomain = (1 << domains[0].length) - 1;
	var trial = copyDomains(domains);
	clue.constrain(trial, fullDomain);
	var variables = [];
	if (clue.mRow) {
		variables.push({
			row: puzzle.rows.indexOf(clue.mRow),
			symbol: clue.mRow.slots[clue.mCol].value,
		});
	}
	var slots = clueSlots(clue);
	for (var i = 0; i < slots.length; i++) {
		var variable = {
			row: puzzle.rows.indexOf(slots[i].row),
			symbol: slots[i].value,
		};
		if (!variables.some(function(existing) {
			return existing.row == variable.row &&
				existing.symbol == variable.symbol;
		}))
			variables.push(variable);
	}
	for (var i = 0; i < variables.length; i++) {
		var row = variables[i].row;
		var symbol = variables[i].symbol;
		var before = domains[row][symbol];
		var after = before & trial[row][symbol];
		if (after == domains[row][symbol])
			continue;
		var middleRow = clue.mRow ? puzzle.rows.indexOf(clue.mRow) : -1;
		var middleSymbol = clue.mRow ?
			clue.mRow.slots[clue.mCol].value : -1;
		var edges = 1 | (1 << (domains[row].length - 1));
		var removedEdges = domains[row][symbol] & ~after & edges;
		if (row == middleRow && symbol == middleSymbol &&
		    removedEdges == edges)
			after = domains[row][symbol] & ~removedEdges;
		else
			after = proofStepDomain(before, after,
				domains[row].length);
		return {
			clues: clue.display ? [clue] : [],
			clue: clue,
			rule: "clue",
			placement: countBits(after) == 1 &&
				clueDirectlyPlaces(clue, domains, row, symbol,
					fullDomain),
			row: row,
			symbol: symbol,
			removed: domains[row][symbol] & ~after,
		};
	}
	return null;
}

/* Prefer a forced placement, then an anchored clue, then a candidate deduction.
 * Explain one step only; applying it remains the player's choice.
 */
function nextHintStep(puzzle, base, basePlacements) {
	var step = nextForcedProofStep(base, basePlacements);
	if (!step) {
		var full = (1 << base[0].length) - 1;
		var anchored = base.map(row => row.map(bits =>
			countBits(bits) == 1 ? bits : full));
		var choices = [];
		for (var clue of puzzle.clues) {
			if (clue.applyInitialState)
				continue;
			var candidate = clueProofStep(puzzle, clue, base);
			if (!candidate)
				continue;
			var simple = copyDomains(anchored);
			clue.constrain(simple, full);
			var anchoredStep = !(candidate.removed &
				simple[candidate.row][candidate.symbol]);
			choices.push({ step: candidate,
				priority: (anchoredStep ? 0 : 2) +
					(candidate.placement ? 0 : 1) });
		}
		choices.sort((a, b) => a.priority - b.priority);
		if (!choices.length)
			return null;
		step = choices[0].step;
	}
	var domains = copyDomains(base);
	var placements = basePlacements.slice();
	var before = domains[step.row][step.symbol];
	applyProofStep(domains, placements, step);
	step.domain = domains[step.row][step.symbol];
	step.domains = domains;
	step.placements = placements;
	step.message = step.rule == "clue" ?
		proofDeductionMessage(puzzle, step, before, step.domain, domains) :
		forcedProofMessage(puzzle, step);
	return step;
}

function nextClueProofStep(puzzle, clues, domains) {
	for (var i = 0; i < clues.length; i++) {
		var step = clueProofStep(puzzle, clues[i], domains);
		if (step)
			return step;
	}
	return null;
}

function proofStepSupported(puzzle, step, domains, placements) {
	var row = step.row;
	var symbol = step.symbol;
	if (step.rule == "only-position") {
		var bit = 1 << step.column;
		return !(placements[row] & (1 << symbol)) &&
			domains[row][symbol] == bit;
	}
	if (step.rule == "only-candidate") {
		var bit = 1 << step.column;
		if (placements[row] & (1 << symbol) ||
		    !(domains[row][symbol] & bit))
			return false;
		for (var other = 0; other < domains[row].length; other++)
			if (other != symbol && domains[row][other] & bit)
				return false;
		return true;
	}
	var fullDomain = (1 << domains[row].length) - 1;
	var trial = copyDomains(domains);
	step.clue.constrain(trial, fullDomain);
	if (step.clue.mRow) {
		var middleRow = puzzle.rows.indexOf(step.clue.mRow);
		var middleSymbol = step.clue.mRow.slots[step.clue.mCol].value;
		if (step.placement &&
		    (row != middleRow || symbol != middleSymbol) &&
		    trial[middleRow][middleSymbol] !=
		    domains[middleRow][middleSymbol]) {
			if (step.clue.constructor != Adjacent3Clue)
				return false;
			var leftRow = puzzle.rows.indexOf(step.clue.lRow);
			var leftSymbol = step.clue.lRow.slots[step.clue.lCol].value;
			var otherRow = row == leftRow && symbol == leftSymbol ?
				puzzle.rows.indexOf(step.clue.rRow) : leftRow;
			var otherSymbol = row == leftRow && symbol == leftSymbol ?
				step.clue.rRow.slots[step.clue.rCol].value : leftSymbol;
			var after = domains[row][symbol] & trial[row][symbol];
			if (adjacent3InwardPosition(domains[otherRow][otherSymbol],
				domains[row].length, 2) != after)
				return false;
		}
	}
	return trial[row][symbol] != domains[row][symbol];
}

function refreshProofStep(puzzle, step, domains) {
	if (!step.clue)
		return step;
	var fullDomain = (1 << domains[step.row].length) - 1;
	var trial = copyDomains(domains);
	step.clue.constrain(trial, fullDomain);
	var before = domains[step.row][step.symbol];
	var after = before & trial[step.row][step.symbol];
	if (after == before)
		return null;
	var directlyPlaced = countBits(after) == 1 &&
		clueDirectlyPlaces(step.clue, domains, step.row, step.symbol,
			fullDomain);
	var anchored = before & ~after & step.removed;
	if (step.clue.constructor == Adjacent3Clue && countBits(anchored) > 1) {
		var edges = 1 | (1 << (domains[step.row].length - 1));
		if (anchored != edges && !adjacent3OuterHasCommonCause(puzzle,
			    step, anchored, domains))
			anchored &= -anchored;
	}
	if (!directlyPlaced && anchored)
		after = before & ~anchored;
	else {
		var middleRow = step.clue && step.clue.mRow ?
			puzzle.rows.indexOf(step.clue.mRow) : -1;
		var middleSymbol = step.clue && step.clue.mRow ?
			step.clue.mRow.slots[step.clue.mCol].value : -1;
		var groupEdges = step.row == middleRow &&
			step.symbol == middleSymbol;
		after = proofStepDomain(before, after,
			domains[step.row].length, groupEdges);
	}
	var refreshed = Object.assign({}, step);
	refreshed.removed = before & ~after;
	refreshed.placement = countBits(after) == 1 && directlyPlaced;
	return refreshed;
}

function applyProofStep(domains, placements, step) {
	var row = step.row;
	var symbol = step.symbol;
	domains[row][symbol] &= ~step.removed;
	if (!step.placement)
		return;
	var placed = domains[row][symbol];
	placements[row] |= 1 << symbol;
	for (var other = 0; other < domains[row].length; other++)
		if (other != symbol)
			domains[row][other] &= ~placed;
}

function drainForcedProofSteps(domains, placements, output, stop) {
	var step;
	while ((!stop || !stop()) &&
	       (step = nextForcedProofStep(domains, placements))) {
		var before = domains[step.row][step.symbol];
		applyProofStep(domains, placements, step);
		if (output)
			output(step, before);
	}
}

function replayProofSteps(puzzle, base, basePlacements, steps,
			  failedSlot, failedValue) {
	var current = copyDomains(base);
	var placements = basePlacements.slice();
	for (var i = 0; i < steps.length; i++) {
		var step = refreshProofStep(puzzle, steps[i], current);
		/* A forced step may already have made this deduction redundant. */
		if (!step)
			continue;
		if (!proofStepSupported(puzzle, step, current, placements))
			return null;
		applyProofStep(current, placements, step);
		drainForcedProofSteps(current, placements);
	}
	return proofConcluded(puzzle, current, failedSlot, failedValue) ?
		current : null;
}

function pruneProofSteps(puzzle, base, basePlacements, steps,
			 failedSlot, failedValue) {
	var orders = [steps.slice(), steps.slice().reverse()];
	var best = steps;
	for (var pass = 0; pass < orders.length; pass++) {
		var kept = steps.slice();
		for (var i = 0; i < orders[pass].length; i++) {
			var candidate = orders[pass][i];
			var trial = kept.filter(function(step) {
				return step != candidate;
			});
			if (replayProofSteps(puzzle, base, basePlacements, trial,
					     failedSlot, failedValue))
				kept = trial;
		}
		if (kept.length < best.length)
			best = kept;
	}

	/*
	 * Removing one step at a time can leave an unused chain at a local
	 * minimum: each later step is anchored to the domain left by the earlier
	 * one, even though the whole chain is irrelevant. Try each subject's
	 * deductions as a group, and let replayProofSteps verify that removing the
	 * group preserves both the proof and its conclusion.
	 */
	var changed = true;
	while (changed) {
		changed = false;
		var subjects = [];
		for (var i = 0; i < best.length; i++) {
			var subject = best[i].row + ":" + best[i].symbol;
			if (subjects.indexOf(subject) < 0)
				subjects.push(subject);
		}
		for (var i = 0; i < subjects.length; i++) {
			var subject = subjects[i];
			var trial = best.filter(function(step) {
				return step.row + ":" + step.symbol != subject;
			});
			if (replayProofSteps(puzzle, base, basePlacements, trial,
					     failedSlot, failedValue)) {
				best = trial;
				changed = true;
				break;
			}
		}
	}
	return best;
}

function proofStepSubjects(puzzle, step) {
	var subjects = [step.row + ":" + step.symbol];
	if (!step.clue)
		return subjects;
	var slots = clueSlots(step.clue);
	for (var i = 0; i < slots.length; i++) {
		var subject = puzzle.rows.indexOf(slots[i].row) + ":" +
			slots[i].value;
		if (subjects.indexOf(subject) < 0)
			subjects.push(subject);
	}
	return subjects;
}

function orderProofSteps(puzzle, base, basePlacements, steps,
			 failedSlot, failedValue) {
	var current = copyDomains(base);
	var placements = basePlacements.slice();
	var remaining = steps.slice();
	var ordered = [];
	var previousSubjects = [];
	while (remaining.length) {
		var best = null;
		var bestStep = null;
		var bestScore = -1;
		/* Drop deductions superseded by the forced steps drained below. */
		for (var i = remaining.length - 1; i >= 0; i--) {
			var step = refreshProofStep(puzzle, remaining[i], current);
			if (!step)
				remaining.splice(i, 1);
		}
		for (var i = 0; i < remaining.length; i++) {
			var step = refreshProofStep(puzzle, remaining[i], current);
			if (!proofStepSupported(puzzle, step, current, placements))
				continue;
			var subjects = proofStepSubjects(puzzle, step);
			var score = 0;
			for (var j = 0; j < subjects.length; j++)
				if (previousSubjects.indexOf(subjects[j]) >= 0)
					score++;
			if (ordered.length && step.row == ordered[ordered.length - 1].row &&
			    step.symbol == ordered[ordered.length - 1].symbol)
				score += 10;
			if (score > bestScore) {
				best = i;
				bestStep = step;
				bestScore = score;
			}
		}
		if (!remaining.length)
			break;
		if (best === null)
			return steps;
		remaining.splice(best, 1);
		var step = bestStep;
		applyProofStep(current, placements, step);
		drainForcedProofSteps(current, placements);
		ordered.push(step);
		previousSubjects = proofStepSubjects(puzzle, step);
	}
	return proofConcluded(puzzle, current, failedSlot, failedValue) ?
		ordered : steps;
}

function proofConclusionMessage(puzzle, failedSlot, failedValue) {
	var row = puzzle.rows.indexOf(failedSlot.row);
	var col = failedSlot.row.slots.indexOf(failedSlot);
	var name = proofSymbolReference(puzzle, row, failedValue);
	if (failedSlot.value == failedValue)
		return name + " must be in the " + ordinalName(col) +
			" column.";
	return name + " cannot be in the " + ordinalName(col) +
		" column.";
}

function directFailedProofStep(puzzle, domains, failedSlot, failedValue) {
	var row = puzzle.rows.indexOf(failedSlot.row);
	var col = failedSlot.row.slots.indexOf(failedSlot);
	var bit = 1 << col;
	if (!(domains[row][failedValue] & bit))
		return null;
	var fullDomain = (1 << domains[row].length) - 1;
	for (var i = 0; i < puzzle.clues.length; i++) {
		var clue = puzzle.clues[i];
		var trial = copyDomains(domains);
		clue.constrain(trial, fullDomain);
		if (trial[row][failedValue] & bit)
			continue;
		return {
			clues: clue.display ? [clue] : [],
			clue: clue,
			rule: "clue",
			placement: false,
			row: row,
			symbol: failedValue,
			removed: bit,
		};
	}
	return null;
}

function combineRelatedProofSteps(puzzle, steps) {
	var causeFields = {
		"adjacent3.middle.outer-not-adjacent": "outer",
		"adjacent3.outer.middle-not-adjacent": "middle",
		"adjacent3.outer.other-not-two-away": "other",
	};
	var combined = [];
	for (var i = 0; i < steps.length; i++) {
		var step = steps[i];
		var previous = combined[combined.length - 1];
		var causeField = causeFields[step.deduction];
		var sameCause = previous && causeField &&
			previous.deductionValues &&
			step.deductionValues &&
			previous.deductionValues[causeField] ==
				step.deductionValues[causeField];
		if (!previous || !causeField ||
		    step.deduction != previous.deduction ||
		    step.clue != previous.clue || step.row != previous.row ||
		    step.symbol != previous.symbol || !sameCause) {
			combined.push(step);
			continue;
		}

		var before = previous.domain | previous.removed;
		previous.removed |= step.removed;
		previous.domain = step.domain;
		previous.domains = step.domains;
		previous.placements = step.placements;
		previous.placement = step.placement;
		previous.conclusion = previous.conclusion || step.conclusion;
		previous.message = proofDeductionMessage(puzzle, previous, before,
			previous.domain, previous.domains);
	}
	return combined;
}

function buildProofSteps(puzzle, base, basePlacements,
			 failedSlot, failedValue) {
	var direct = directFailedProofStep(puzzle, base, failedSlot,
		failedValue);
	if (direct) {
		var directDomains = copyDomains(base);
		var directPlacements = basePlacements.slice();
		var before = directDomains[direct.row][direct.symbol];
		applyProofStep(directDomains, directPlacements, direct);
		if (proofConcluded(puzzle, directDomains, failedSlot, failedValue)) {
			direct.domain = directDomains[direct.row][direct.symbol];
			direct.domains = copyDomains(directDomains);
			direct.placements = directPlacements;
			direct.message = proofDeductionMessage(puzzle, direct, before,
				direct.domain, directDomains);
			direct.conclusion = true;
			return [direct];
		}
	}
	var current = copyDomains(base);
	var placements = basePlacements.slice();
	var steps = [];
	while (true) {
		var step = nextForcedProofStep(current, placements);
		if (!step && proofConcluded(puzzle, current,
					    failedSlot, failedValue))
			break;
		if (!step)
			step = nextClueProofStep(puzzle, puzzle.clues, current);
		if (!step || steps.length > 500)
			return [];
		applyProofStep(current, placements, step);
		steps.push(step);
	}

	steps = steps.filter(function(step) { return step.rule == "clue"; });
	steps = pruneProofSteps(puzzle, base, basePlacements, steps,
		failedSlot, failedValue);
	steps = orderProofSteps(puzzle, base, basePlacements, steps,
		failedSlot, failedValue);
	current = copyDomains(base);
	placements = basePlacements.slice();
	var replay = [];
	for (var i = 0; i < steps.length; i++) {
		var step = refreshProofStep(puzzle, steps[i], current);
		/* Ordering may expose another deduction as redundant. */
		if (!step)
			continue;
		var before = current[step.row][step.symbol];
		var middleRow = step.clue && step.clue.mRow ?
			puzzle.rows.indexOf(step.clue.mRow) : -1;
		var middleSymbol = step.clue && step.clue.mRow ?
			step.clue.mRow.slots[step.clue.mCol].value : -1;
		var fullDomain = (1 << current[step.row].length) - 1;
		if (step.placement && step.clue.constructor == Adjacent3Clue &&
		    (step.row != middleRow || step.symbol != middleSymbol) &&
		    before != fullDomain) {
			/*
			 * If earlier clues have already narrowed an outer symbol, show
			 * each remaining adjacent-three reason before the row singleton
			 * turns into a placement.
			 */
			var target = before & ~step.removed;
			while (current[step.row][step.symbol] != target) {
				var domain = current[step.row][step.symbol];
				var removed = domain & ~target;
				var group = adjacent3OuterCommonCauseGroup(puzzle,
					step, removed, current);
				if (!group)
					group = removed & -removed;
				var split = Object.assign({}, step, {
					placement: false,
					removed: group,
				});
				applyProofStep(current, placements, split);
				split.domain = current[split.row][split.symbol];
				split.domains = copyDomains(current);
				split.placements = placements.slice();
				split.message = proofDeductionMessage(puzzle, split,
					domain, split.domain, current);
				replay.push(split);
			}
			drainForcedProofSteps(current, placements,
				function(forced, forcedBefore) {
					forced.domain = current[forced.row][forced.symbol];
					forced.domains = copyDomains(current);
					forced.placements = placements.slice();
					forced.message = forcedProofMessage(puzzle, forced,
						forcedBefore);
					replay.push(forced);
				}, function() {
					return proofConclusionPresented(puzzle, current,
						placements, failedSlot, failedValue);
				});
			continue;
		}
		applyProofStep(current, placements, step);
		step.domain = current[step.row][step.symbol];
		step.domains = copyDomains(current);
		step.placements = placements.slice();
		step.message = proofDeductionMessage(puzzle, step, before,
			step.domain, current);
		replay.push(step);
		drainForcedProofSteps(current, placements,
			function(forced, forcedBefore) {
				forced.domain = current[forced.row][forced.symbol];
				forced.domains = copyDomains(current);
				forced.placements = placements.slice();
				forced.message = forcedProofMessage(puzzle, forced,
					forcedBefore);
				replay.push(forced);
			}, function() {
				return proofConclusionPresented(puzzle, current,
					placements, failedSlot, failedValue);
			});
	}
	steps = replay;
	if (!proofConcluded(puzzle, current, failedSlot, failedValue)) {
		var step = directFailedProofStep(puzzle, current,
			failedSlot, failedValue);
		if (!step)
			return [];
		var before = current[step.row][step.symbol];
		applyProofStep(current, placements, step);
		step.domain = current[step.row][step.symbol];
		step.domains = copyDomains(current);
		step.placements = placements.slice();
		step.message = proofDeductionMessage(puzzle, step, before,
			step.domain, current);
		steps.push(step);
	}
	var conclusion = proofConclusionMessage(puzzle, failedSlot, failedValue);
	if (steps.length && failedSlot.value != failedValue)
		steps[steps.length - 1].conclusion = true;
	else if (steps.length && steps[steps.length - 1].placement &&
		 steps[steps.length - 1].row == puzzle.rows.indexOf(failedSlot.row) &&
		 steps[steps.length - 1].symbol == failedValue &&
		 steps[steps.length - 1].domain ==
			1 << failedSlot.row.slots.indexOf(failedSlot))
		steps[steps.length - 1].conclusion = true;
	else if (steps.length && steps[steps.length - 1].message == conclusion)
		steps[steps.length - 1].conclusion = true;
	else {
		var row = puzzle.rows.indexOf(failedSlot.row);
		var col = failedSlot.row.slots.indexOf(failedSlot);
		var step = {
			clues: [],
			conclusion: true,
			domains: copyDomains(current),
			placements: placements.slice(),
			row: row,
			symbol: failedValue,
		};
		var id = failedSlot.value == failedValue ?
			"conclusion.placement" : "conclusion.remove-position";
		step.message = identifiedDeduction(step, id, {
			subject: proofSymbolReference(puzzle, row, failedValue),
			position: ordinalName(col),
		});
		steps.push(step);
	}
	var finalStep = steps[steps.length - 1];
	var failedRow = puzzle.rows.indexOf(failedSlot.row);
	var failedCol = failedSlot.row.slots.indexOf(failedSlot);
	var failedBit = 1 << failedCol;
	var conflictingPlacement = finalStep && finalStep.placement &&
		finalStep.row == failedRow &&
		(finalStep.symbol == failedValue ?
		 !(finalStep.domain & failedBit) : finalStep.domain == failedBit);
	if (finalStep && finalStep.conclusion && conflictingPlacement &&
	    finalStep.symbol != failedValue)
		finalStep.contradicts = proofSymbolReference(puzzle, failedRow,
			failedValue);
	return combineRelatedProofSteps(puzzle, steps);
}

function clueSlots(clue) {
	if (clue.slot)
		return [clue.slot];
	if (clue.mRow) {
		return [clue.lRow.slots[clue.lCol],
			clue.mRow.slots[clue.mCol],
			clue.rRow.slots[clue.rCol]];
	}
	if (clue.tRow) {
		return [clue.tRow.slots[clue.col],
			clue.bRow.slots[clue.col]];
	}
	if (clue.lRow) {
		return [clue.lRow.slots[clue.lCol],
			clue.rRow.slots[clue.rCol]];
	}
	return [];
}

function isClueExhausted(clue) {
	return clueSlots(clue).every(function(slot) { return slot.single; });
}

/* Approximate the experimental percentile composite with a weighted raw
 * score. Fit on 1,000 five-route puzzles and checked on 10,000 separate seeds;
 * see DIFFICULTY.md. These units are not percentiles.
 */
function difficultyRating(metrics) {
	var score = metrics.supportSteps + 2.65 * metrics.scarcity +
		0.87 * metrics.maxDiscardRun;
	return { score: score,
		level: score < 45 ? "easy" : score < 80 ? "medium" : "hard" };
}

/* Rate the original puzzle, regardless of the player's current progress.
 * This does not mutate the puzzle or consume the generator's random stream.
 */
function puzzleDifficulty(puzzle) {
	return difficultyRating(measureDifficulty(puzzle));
}

function difficultyPlacements(domains) {
	return domains.flat().filter(bits => countBits(bits) == 1).length;
}

/* Group all reductions to one target from one clue as one observation. */
function difficultyOpportunities(puzzle, domains) {
	var full = (1 << domains[0].length) - 1;
	var anchored = domains.map(row => row.map(bits =>
		countBits(bits) == 1 ? bits : full));
	var result = [];
	for (var clue of puzzle.clues) {
		if (clue.applyInitialState)
			continue;
		var simple = copyDomains(anchored);
		var complete = copyDomains(domains);
		clue.constrain(simple, full);
		clue.constrain(complete, full);
		for (var row = 0; row < domains.length; row++) {
			for (var symbol = 0; symbol < domains[row].length; symbol++) {
				var before = domains[row][symbol];
				var basic = before & simple[row][symbol];
				var after = before & complete[row][symbol];
				if (!after)
					throw new Error("constraint contradicted generated solution");
				if (after == before)
					continue;
				var tier = basic != before ? 1 : 2;
				var next = tier == 1 ? basic : after;
				result.push({ row, symbol, tier, after: next,
					placement: countBits(next) == 1 });
			}
		}
	}
	return result;
}

function traceDifficulty(puzzle, orderSeed) {
	var random = seedRandom(orderSeed);
	var full = (1 << puzzle.rows[0].slots.length) - 1;
	var domains = puzzle.rows.map(row => row.slots.map(() => full));
	var placements = puzzle.rows.map(() => 0);
	for (var clue of puzzle.clues)
		if (clue.applyInitialState)
			clue.constrain(domains, full);
	drainForcedProofSteps(domains, placements);
	var supportSteps = 0, scarcity = 0;
	var gap = 0, maxDiscardRun = 0;
	while (difficultyPlacements(domains) < domains.flat().length) {
		var available = difficultyOpportunities(puzzle, domains);
		if (!available.length)
			throw new Error("difficulty solver stalled");
		scarcity += 1 / available.length;
		// Prefer anchored deductions, then immediate placements. Randomize ties.
		var priority = move => 2 * move.tier + (move.placement ? 0 : 1);
		var best = Math.min(...available.map(priority));
		var choices = available.filter(move => priority(move) == best);
		var move = choices[Math.floor(random() * choices.length)];
		var beforePlacements = difficultyPlacements(domains);
		domains[move.row][move.symbol] = move.after;
		drainForcedProofSteps(domains, placements);
		supportSteps += move.tier == 2;
		if (!move.placement)
			maxDiscardRun = Math.max(maxDiscardRun, ++gap);
		if (difficultyPlacements(domains) > beforePlacements)
			gap = 0;
	}
	return { supportSteps, scarcity, maxDiscardRun };
}

/* Measure an already-generated puzzle without changing its board or clues.
 * Fixed route seeds keep the result independent of the game's random stream.
 */
function measureDifficulty(puzzle, routes = 5) {
	if (!Number.isInteger(routes) || routes < 1)
		throw new Error("difficulty analysis needs a positive route count");
	var metrics = { supportSteps: 0, scarcity: 0, maxDiscardRun: 0 };
	for (var i = 0; i < routes; i++) {
		var run = traceDifficulty(puzzle, Math.imul(i + 1, 0x9e3779b9));
		for (var key of Object.keys(metrics))
			metrics[key] += run[key];
	}
	for (var key of Object.keys(metrics))
		metrics[key] /= routes;
	return metrics;
}

/* Try to solve the puzzle using only deductions from the given clues. */
function cluesSolve(puzzle, clues) {
	var numRows = puzzle.rows.length;
	var rowSize = puzzle.rows[0].slots.length;
	var fullDomain = (1 << rowSize) - 1;
	var domains = [];

	for (var row = 0; row < numRows; row++)
		domains[row] = Array(rowSize).fill(fullDomain);

	if (!cluesAllow(puzzle, clues, domains))
		return false;

	for (var row = 0; row < numRows; row++) {
		for (var symbol = 0; symbol < rowSize; symbol++) {
			var domain = domains[row][symbol];
			if (!domain || (domain & (domain - 1)) != 0)
				return false;
		}
	}
	return true;
}

function clueVariable(domains, row, slot) {
	var rowNum = row.puzzle.rows.indexOf(row);
	return {
		domains: domains[rowNum],
		symbol: slot.value
	};
}

function restrictVariable(variable, allowed) {
	var old = variable.domains[variable.symbol];
	variable.domains[variable.symbol] &= allowed;
	return old != variable.domains[variable.symbol];
}

function Row(puzzle, symbols, display, family) {
	this.puzzle = puzzle;
	this.elem = display;
	this.familyClass = "family-" + family;
	this.slots = [];
	for (var i = 0; i < symbols.length; i++)
		this.slots[i] = new Slot(this, symbols, display.insertCell());

	this.clear = function() {
		for (var i = 0; i < this.slots.length; i++) {
			this.slots[i].singleElem.textContent = symbols[i];
			this.slots[i].displaySingle();
		}
	}

	this.newGame = function() {
		var values = [];
		for (var i = 0; i < this.slots.length; i++)
			values.push(i);
		shuffle(values);
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].newGame(values[i]);
	}

	this.clearPencilDisplay = function() {
		this.elem.classList.remove("pencil-conflict");
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].clearPencilDisplay();
	}

	this.displayPencil = function(domains, marks, conflict) {
		this.clearPencilDisplay();
		if (conflict)
			this.elem.classList.add("pencil-conflict");
		for (var col = 0; col < this.slots.length; col++) {
			var slot = this.slots[col];
			if (slot.single)
				continue;
			for (var value = 0; value < domains.length; value++) {
				if (!slot.possible[value])
					continue;
				var selected = false;
				var removed = false;
				for (var i = 0; i < marks.length; i++) {
					if (marks[i].slot != slot ||
					    marks[i].value != value)
						continue;
					if (marks[i].discard)
						removed = true;
					else
						selected = true;
				}
				var bit = 1 << col;
				var elem = slot.possibilityElems[value];
				if (selected)
					elem.className +=
						" pencil-selected pencil-explicit";
				else if (domains[value] == bit)
					elem.className +=
						" pencil-selected pencil-derived";
				if (removed)
					elem.className +=
						" pencil-removed pencil-explicit";
				else if (!(domains[value] & bit))
					elem.className +=
						" pencil-removed pencil-derived";
			}
		}
	}

	this.removePossible = function(value) {
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].removePossible(value, true);
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].checkSingleton();
		for (var i = 0; i < this.slots.length; i++)
			if (i != value)
				this.checkSingleton(i);
	}

	this.checkSingleton = function(value) {
		var possible = this.slots.filter(
			function(slot) { return slot.isPossible(value) });
		if (possible.length == 1)
			possible[0].choose(value);
	}

	this.isComplete = function() {
		for (var i = 0; i < this.slots.length; i++)
			if (!this.slots[i].single)
				return false;
		return true;
	}
}

function Slot(row, symbols, display) {
	this.row = row;
	this.symbols = symbols;
	this.elem = display;
	this.elem.className = "slot " + row.familyClass;
	this.elem.addEventListener("click", function(slot) {
		return function() {
			var puzzle = slot.row.puzzle;
			if (!puzzle.expandTileChoices)
				return;
			puzzle.openSlotTray(slot);
		};
	}(this));

	this.say = function(msg) { this.row.puzzle.say(msg) };

	this.newGame = function(value) {
		this.value = value;
		this.singleElem.textContent = this.symbols[value];
		this.possible = [];
		for (var i = 0; i < this.symbols.length; i++)
			this.possible.push(true);
		this.displayPossible();
	}

	this.symbol = function() {
		return this.symbols[this.value];
	}

	this.displaySingle = function(source) {
		var sourceRect;
		if (source && source.getBoundingClientRect)
			sourceRect = source.getBoundingClientRect();
		this.singleElem.classList.remove("placing", "failed-action",
			"proof-change");
		this.singleElem.hidden = false;
		this.possibleElem.hidden = true;
		if (source) {
			var x = 0;
			var y = -1;
			var scaleX = 1.04;
			var scaleY = 1.04;
			if (sourceRect && this.singleElem.getBoundingClientRect) {
				var destRect = this.singleElem.getBoundingClientRect();
				x = sourceRect.left + sourceRect.width / 2 -
					(destRect.left + destRect.width / 2);
				y = sourceRect.top + sourceRect.height / 2 -
					(destRect.top + destRect.height / 2);
				scaleX = sourceRect.width / destRect.width;
				scaleY = sourceRect.height / destRect.height;
			}
			this.singleElem.style.setProperty("--tile-place-x", x + "px");
			this.singleElem.style.setProperty("--tile-place-y", y + "px");
			this.singleElem.style.setProperty("--tile-place-scale-x", scaleX);
			this.singleElem.style.setProperty("--tile-place-scale-y", scaleY);
			this.singleElem.style.setProperty("--tile-place-overshoot-x",
				(x ? -Math.sign(x) * 2 : 0) + "px");
			this.singleElem.style.setProperty("--tile-place-overshoot-y",
				(y ? -Math.sign(y) * 2 : 0) + "px");
			this.singleElem.classList.add("placing");
		}
		this.single = true;
	}

	this.reveal = function() {
		if (this.single)
			return;
		this.singleElem.hidden = true;
		this.possibleElem.hidden = false;
		this.possibleElem.className = "solution";
		this.possibilityElems[this.value].className = "possibility answer";
	}

	this.displayPossible = function() {
		this.singleElem.classList.remove("placing", "failed-action",
			"proof-change", "clue-highlight-source");
		this.possibleElem.className = "";
		for (var i = 0; i < this.possibilityElems.length; i++)
			this.possibilityElems[i].className = "possibility";
		this.singleElem.hidden = true;
		this.possibleElem.hidden = false;
		this.single = false;
	}

	this.displayProof = function(domains, col, placements, change) {
		this.singleElem.classList.remove("placing");
		var bit = 1 << col;
		var placed = -1;
		for (var i = 0; i < domains.length; i++) {
			if (placements & (1 << i) && domains[i] == bit) {
				placed = i;
				break;
			}
		}
		this.singleElem.classList.remove("failed-action", "proof-change");
		if (placed >= 0) {
			this.singleElem.textContent = this.symbols[placed];
			if (change && change.placement && change.symbol == placed)
				this.singleElem.classList.add("proof-change");
			if (this.row.puzzle.proof &&
			    this.row.puzzle.proof.failedSlot == this &&
			    this.row.puzzle.proof.failedValue == placed)
				this.singleElem.classList.add("failed-action");
			this.singleElem.hidden = false;
			this.possibleElem.hidden = true;
			return;
		}
		this.possibleElem.className = "proof";
		for (var i = 0; i < this.possibilityElems.length; i++) {
			var failed = this.row.puzzle.proof &&
				this.row.puzzle.proof.failedSlot == this &&
				this.row.puzzle.proof.failedValue == i;
			var changed = change && !change.placement &&
				change.symbol == i && change.removed & bit;
			this.possibilityElems[i].className = "possibility" +
				(domains[i] & bit ? "" : " proof-impossible") +
				(changed ? " proof-change" : "") +
				(failed ? " failed-action" : "");
		}
		this.singleElem.hidden = true;
		this.possibleElem.hidden = false;
	}

	this.clearPencilDisplay = function() {
		if (!this.possible)
			return;
		for (var i = 0; i < this.possibilityElems.length; i++)
			this.possibilityElems[i].className = this.possible[i] ?
				"possibility" : "possibility dead-possibility";
	}

	this.choose = function(value, playerAction) {
		if (this.row.puzzle.gameOver || this.row.puzzle.paused ||
		    this.row.puzzle.proof)
			return;
		this.row.puzzle.clearHint();
		this.row.puzzle.clearPracticeMistake();
		if (this.value == value) {
			if (playerAction || this.row.puzzle.placeSoundPending)
				this.row.puzzle.playSound("place");
			this.row.puzzle.placeSoundPending = false;
			this.displaySingle(this.possibilityElems[value]);
			this.row.removePossible(value);
			this.row.puzzle.reconcilePencilMarks(this.row);
			this.row.puzzle.checkWin();
		} else {
			var clues = this.row.puzzle.findContradictingClues(
				this, value, false);
			this.row.puzzle.lose(
				this.row.puzzle.practiceMode ?
					practiceMistakeMessage(false, clues) :
					randomChoice(falsePlacementMessages),
				clues, this, value);
		}
	}

	this.discard = function(value, playerAction) {
		if (this.single || this.row.puzzle.gameOver ||
		    this.row.puzzle.paused || this.row.puzzle.proof)
			return;
		this.row.puzzle.clearHint();
		this.row.puzzle.clearPracticeMistake();
		if (this.value == value) {
			var clues = this.row.puzzle.findContradictingClues(
				this, value, true);
			this.row.puzzle.lose(
				this.row.puzzle.practiceMode ?
					practiceMistakeMessage(true, clues) :
					randomChoice(falseEliminationMessages),
				clues, this, value);
		} else {
			if (playerAction) {
				this.row.puzzle.playSound("discard");
				this.row.puzzle.placeSoundPending = true;
			}
			this.removePossible(value);
			this.row.checkSingleton(value);
			this.row.puzzle.reconcilePencilMarks(this.row);
			this.row.puzzle.placeSoundPending = false;
		}
	}

	this.isPossible = function(value) {
		return !this.single && this.possible[value];
	}

	this.removePossible = function(value, deferCheck) {
		this.possible[value] = false;
		this.possibilityElems[value].className =
			"possibility dead-possibility";
		if (!deferCheck)
			this.checkSingleton();
	}

	this.checkSingleton = function() {
		if (this.single)
			return;
		var count = 0;
		var last;
		for (var i = 0; i < this.possible.length; i++) {
			if (this.possible[i]) {
				count++;
				last = i;
			}
		}
		if (count == 1)
			this.choose(last);
	}

	this.pencil = function(value, discard) {
		this.row.puzzle.clearHint();
		this.row.puzzle.togglePencilMark(this, value, discard);
	}

	this.singleElem = document.createElement("div");
	this.singleElem.className = "single";
	this.singleElem.hidden = true;
	this.singleElem.addEventListener("pointerdown", ev => {
		if (!this.single || (ev.button !== undefined && ev.button != 0) || this.row.puzzle.proof)
			return;
		highlightCluesForSlots(this.row.puzzle, [this]);
		this.singleElem.classList.add("clue-highlight-source");
		if (this.singleElem.setPointerCapture)
			this.singleElem.setPointerCapture(ev.pointerId);
	});
	var clearHighlight = () => {
		clearClueHighlights(this.row.puzzle);
		this.singleElem.classList.remove("clue-highlight-source");
	};
	this.singleElem.addEventListener("pointerup", clearHighlight);
	this.singleElem.addEventListener("pointercancel", clearHighlight);
	this.possibleElem = document.createElement("table");
	this.possibilityElems = [];

	// Lay the possibilities out as close to square as we can.
	var rows = Math.floor(Math.sqrt(this.symbols.length));
	var cols = Math.floor(this.symbols.length / rows);
	for (var i = 0; i < rows; i++) {
		var possibleRow = this.possibleElem.insertRow();
		var lo = i * cols;
		var hi = (i+1) * cols;
		if (hi > this.symbols.length)
			hi = this.symbols.length;
		for (var j = lo; j < hi; j++) {
			var cell = this.possibilityElems[j] =
				possibleRow.insertCell();
			var symbol = document.createElement("span");
			symbol.className = "possibility-symbol";
			symbol.textContent = this.symbols[j];
			cell.appendChild(symbol);
			cell.className = "possibility";
			cell.addEventListener('pointerdown',
				function(s, j) { return function(ev) {
					s.row.puzzle.pressTile(
						ev.currentTarget, ev, s, j);
				}}(this, j));
			cell.addEventListener('click',
				function(s, j) { return function(ev) {
					if (s.row.puzzle.suppressTileClick &&
					    s.row.puzzle.suppressTileClick ==
					    ev.currentTarget) {
						s.row.puzzle.suppressTileClick = null;
						return;
					}
					if (!s.row.puzzle.expandTileChoices)
						s.row.puzzle.requestTileAction(s, j,
							s.row.puzzle.tileActionForPointer(
								ev, false));
				}}(this, j));
			cell.addEventListener('contextmenu',
				function(s, j) { return function(ev) {
					ev.preventDefault();
					if (s.row.puzzle.suppressTileContextMenu ==
						ev.currentTarget) {
						s.row.puzzle.suppressTileContextMenu = null;
						return;
					}
					s.row.puzzle.requestTileAction(s, j,
						s.row.puzzle.tileActionForPointer(ev, true));
				}}(this, j));
		}
	}

	this.elem.appendChild(this.singleElem);
	this.elem.appendChild(this.possibleElem);
}

function checkClueDisplay(clue) {
	if (!clue.rendered) {
		clue.render();
		clue.rendered = true;
	}
	if (clue.active)
		clue.display.classList.remove("clue-hidden");
	else
		clue.display.classList.add("clue-hidden");
}

function highlightCluesForSlots(puzzle, slots, selected) {
	for (var i = 0; i < puzzle.clues.length; i++) {
		var clue = puzzle.clues[i];
		if (!clue.display)
			continue;
		clue.display.classList.remove("clue-highlight-source",
			"clue-highlight-related");
		if (clue == selected)
			clue.display.classList.add("clue-highlight-source");
		else if (clueSlots(clue).some(function(slot) {
			return slots.indexOf(slot) >= 0;
		}))
			clue.display.classList.add("clue-highlight-related");
	}
}

function highlightRelatedClues(puzzle, selected) {
	highlightCluesForSlots(puzzle, clueSlots(selected), selected);
}

function clearClueHighlights(puzzle) {
	for (var i = 0; i < puzzle.clues.length; i++) {
		if (puzzle.clues[i].display)
			puzzle.clues[i].display.classList.remove(
				"clue-highlight-source", "clue-highlight-related");
	}
}

function renderClue(puzzle, clue, slot, type, elements, horizontal) {
	slot.innerHTML = "";
	var content = slot;
	if (horizontal) {
		content = document.createElement("div");
		content.className = "clue-content";
		slot.appendChild(content);
	}
	for (var i = 0; i < elements.length; i++) {
		var elem = document.createElement(type);
		elem.className = elements[i][0];
		elem.innerHTML = elements[i][1];
		content.appendChild(elem);
	}
	if (!clue.listener) {
		clue.listener = function(ev) {
			ev.preventDefault();
			if (clue.suppressClick) {
				clue.suppressClick = false;
				return;
			}
			if (puzzle.proof)
				return;
			if (clue.active)
				puzzle.playSound("clue");
			clue.active = !clue.active;
			checkClueDisplay(clue);
		};
	}
	slot.onclick = function(ev) {
		if (puzzle.suppressClueClick == slot) {
			ev.preventDefault();
			puzzle.suppressClueClick = null;
			return;
		}
		clue.listener(ev);
	};
	slot.oncontextmenu = clue.listener;
	slot.onpointerdown = function(ev) {
		if (!ev.shiftKey || (ev.button !== undefined && ev.button != 0) ||
		    puzzle.proof) {
			puzzle.beginClueDrag(clue, slot, ev);
			return;
		}
		ev.preventDefault();
		clue.suppressClick = true;
		highlightRelatedClues(puzzle, clue);
		if (slot.setPointerCapture)
			slot.setPointerCapture(ev.pointerId);
	};
	slot.onpointermove = function(ev) {
		puzzle.updateClueDrag(ev);
	};
	slot.onpointerup = function(ev) {
		clearClueHighlights(puzzle);
		puzzle.endClueDrag(ev, false);
		/* A click normally follows; do not suppress some later click if it doesn't. */
		setTimeout(function() { clue.suppressClick = false; }, 0);
	};
	slot.onpointercancel = function(ev) {
		clue.suppressClick = false;
		clearClueHighlights(puzzle);
		puzzle.endClueDrag(ev, true);
	};
}

function OrderClue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = randInt(this.lCol + 1, this.rRow.slots.length);
	this.displayType = "horizontal";

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var rightAllowed = 0;
		for (var l = 0; l < this.lRow.slots.length; l++) {
			for (var r = l + 1; r < this.rRow.slots.length; r++) {
				if (leftDomain & (1 << l) && rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					rightAllowed |= 1 << r;
				}
			}
		}
		return restrictVariable(left, leftAllowed) |
			restrictVariable(right, rightAllowed);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["dots", "..."],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		], true);
	}
}
OrderClue.weight = 5;

function Adjacent2Clue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = this.lCol + 1;
	this.displayType = "horizontal";

	if (puzzleRandom() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = (rightDomain << 1) | (rightDomain >> 1);
		var rightAllowed = (leftDomain << 1) | (leftDomain >> 1);
		return restrictVariable(left, leftAllowed & fullDomain) |
			restrictVariable(right, rightAllowed & fullDomain);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["arrow", clueArrow],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		], true);
	}
}
Adjacent2Clue.weight = 5;

function Adjacent3Clue(puzzle) {
	this.mRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.mCol = randInt(1, this.mRow.slots.length - 1);
	this.lCol = this.mCol - 1;
	this.rCol = this.mCol + 1;
	this.displayType = "horizontal";

	if (puzzleRandom() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var middle = clueVariable(domains, this.mRow,
					  this.mRow.slots[this.mCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var middleDomain = middle.domains[middle.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var middleAllowed = 0;
		var rightAllowed = 0;
		for (var m = 1; m < this.mRow.slots.length - 1; m++) {
			for (var direction = -1; direction <= 1; direction += 2) {
				var l = m + direction;
				var r = m - direction;
				if (leftDomain & (1 << l) &&
				    middleDomain & (1 << m) &&
				    rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					middleAllowed |= 1 << m;
					rightAllowed |= 1 << r;
				}
			}
		}
		var changed = restrictVariable(left, leftAllowed);
		changed |= restrictVariable(middle, middleAllowed);
		changed |= restrictVariable(right, rightAllowed);
		return changed;
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["tile " + this.mRow.familyClass,
			     this.mRow.slots[this.mCol].symbol()],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		], true);
	}
}
Adjacent3Clue.weight = 5;

function ColumnClue(puzzle) {
	this.tRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.col = randInt(0, this.tRow.slots.length);
	this.bRow = this.tRow;
	while (this.bRow == this.tRow)
		this.bRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.displayType = "vertical";

	this.constrain = function(domains, fullDomain) {
		var top = clueVariable(domains, this.tRow,
				       this.tRow.slots[this.col]);
		var bottom = clueVariable(domains, this.bRow,
					  this.bRow.slots[this.col]);
		var common = top.domains[top.symbol] &
			bottom.domains[bottom.symbol];
		return restrictVariable(top, common) |
			restrictVariable(bottom, common);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "div", [
			    ["tile " + this.tRow.familyClass,
			     this.tRow.slots[this.col].symbol()],
			    ["tile " + this.bRow.familyClass,
			     this.bRow.slots[this.col].symbol()]
		]);
	}
}
ColumnClue.weight = 5;

function ExactClue(puzzle) {
	this.row = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.slot = this.row.slots[randInt(0, this.row.slots.length)];

	this.constrain = function(domains, fullDomain) {
		var variable = clueVariable(domains, this.row, this.slot);
		var pos = this.row.slots.indexOf(this.slot);
		return restrictVariable(variable, 1 << pos);
	}

	this.applyInitialState = function() {
		this.slot.choose(this.slot.value);
	}
}
ExactClue.weight = 1;
