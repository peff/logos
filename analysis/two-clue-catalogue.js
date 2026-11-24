// Catalogue the actual pair passes selected by the Extreme rating search.
// deno run --allow-read=logos.js analysis/two-clue-catalogue.js SEED [SEED...]
// Output is JSONL, one record per seed, with all ten deterministic routes.
const source = await Deno.readTextFile(new URL('../logos.js', import.meta.url));
const game = new Function('document', source + `
return { puzzleFromSeed, extremeClueIndices, clueSlots, cluePairTuples,
 compileCluePairs, applyCluePairDeduction, traceExtremeDifficulty,
 defaultSymbols, parseSeed,
 observePairs(callback) {
  const original = applyCluePairDeduction;
  applyCluePairDeduction = function(pairs, domains) {
   for (const pair of pairs) {
    const before = copyDomains(domains);
    if (original([pair], domains)) {
     callback(pair, before, domains);
     return true;
    }
   }
   return false;
  };
 }
};`)({ addEventListener() {} });

const columns = bits => Array.from({ length: 6 }, (_, i) => i + 1)
 .filter(i => bits & (1 << (i - 1)));
let events;
game.observePairs((pair, before, after) => {
 const changes = pair.variables.flatMap((v, i) => {
  const row = Math.floor(v / 6), symbol = v % 6;
  const removed = before[row][symbol] & ~after[row][symbol];
  if (!removed) return [];
  // Separate restrictions inherent in the clue pair from those needing
  // the current candidate board. Neither label is a human difficulty score.
  const unrestricted = pair.tuples.reduce((bits, t) => bits | t[i], 0);
  const withoutRow = pair.withoutRow.filter(t => t.every((bit, j) =>
   bit & before[Math.floor(pair.variables[j] / 6)][pair.variables[j] % 6]))
   .reduce((bits, t) => bits | t[i], 0);
  return [{ symbol: pair.names[i], before: columns(before[row][symbol]),
   after: columns(after[row][symbol]), removed: columns(removed),
   inherent: columns(removed & ~unrestricted),
   needsCandidates: columns(removed & unrestricted),
   needsRowUniqueness: columns(removed & withoutRow) }];
 });
 events.push({ clues: pair.clues, types: pair.types, sharedSymbols: pair.sharedSymbols,
  rowLinks: pair.rowLinks, candidates: Object.fromEntries(pair.variables.map((v, i) =>
   [pair.names[i], columns(before[Math.floor(v / 6)][v % 6])])),
  survivingAssignments: pair.tuples.filter(t => t.every((bit, i) =>
   bit & before[Math.floor(pair.variables[i] / 6)][pair.variables[i] % 6])).length,
  changes });
});
function catalogue(seed) {
 const puzzle = game.puzzleFromSeed(seed);
 const indices = game.extremeClueIndices(puzzle);
 if (!indices) throw new Error(`no Extreme variant: ${seed.toString(16)}`);
 puzzle.clues = indices.map(i => puzzle.clues[i]);
 const name = v => `${Math.floor(v / 6) + 1}:${game.defaultSymbols[Math.floor(v / 6)][v % 6]}`;
 const tuples = puzzle.clues.map(c => game.cluePairTuples(puzzle, c));
 const pairs = game.compileCluePairs(puzzle);
 let index = 0;
 for (let i = 0; i < tuples.length; i++) for (let j = i + 1; j < tuples.length; j++) {
  const a = tuples[i][0].map(([v]) => v), b = tuples[j][0].map(([v]) => v);
  if (!a.some(v => b.some(w => Math.floor(v / 6) === Math.floor(w / 6)))) continue;
  const pair = pairs[index++];
  pair.names = pair.variables.map(name);
  pair.clues = [i, j];
  pair.types = [i, j].map(k => puzzle.clues[k].constructor.name).sort();
  pair.sharedSymbols = a.filter(v => b.includes(v)).map(name);
  pair.rowLinks = a.flatMap(v => b.filter(w => v !== w && Math.floor(v / 6) === Math.floor(w / 6))
   .map(w => [name(v), name(w)]));
  pair.withoutRow = [];
  for (const ta of tuples[i]) for (const tb of tuples[j]) {
   const merged = new Map(ta);
   if (tb.some(([v, col]) => merged.has(v) && merged.get(v) !== col)) continue;
   for (const [v, col] of tb) merged.set(v, col);
   pair.withoutRow.push(pair.variables.map(v => 1 << merged.get(v)));
  }
 }
 if (index !== pairs.length) throw new Error('pair metadata disagrees with compiler');
 const clues = puzzle.clues.map((c, i) => ({ index: i, type: c.constructor.name,
  symbols: game.clueSlots(c).map(s => name(puzzle.rows.indexOf(s.row) * 6 + s.value)) }));
 const routes = [];
 for (let route = 0; route < 10; route++) {
  events = [];
  const result = game.traceExtremeDifficulty(puzzle, 20000, { route, cluePairs: pairs, measureCost: true });
  if (events.length !== result.pairDeductions) throw new Error('deduction count mismatch');
  routes.push({ route, ...result, deductions: events });
 }
 return { seed: seed.toString(16).padStart(8, '0'), clues, routes };
}
if (!Deno.args.length) throw new Error('usage: two-clue-catalogue.js HEX_SEED...');
for (const input of Deno.args) {
 const seed = game.parseSeed(input);
 if (seed === null) throw new Error(`invalid seed: ${input}`);
 console.log(JSON.stringify(catalogue(seed)));
}
