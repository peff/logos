// Read two-clue-cost.js JSONL on stdin; emit summary JSON or per-puzzle CSV.
const input = await new Response(Deno.stdin.readable).text();
const records = input.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
if (Deno.args.includes('--csv')) {
	const fields = ['seed', 'baseline_complete', 'baseline_stalled', 'baseline_score', 'baseline_bottlenecks',
		'baseline_max_depth', 'baseline_ms', 'paired_complete', 'paired_stalled', 'paired_contradiction_score',
		'paired_deductions', 'paired_bottlenecks', 'paired_max_depth', 'paired_ms', 'compile_ms', 'pair_only_routes'];
	console.log(fields.join(','));
	for (const {seed, baseline: b, paired: p, compileMs} of records)
		console.log([seed, b.complete, b.stalled, b.contradictionScore, b.bottlenecks, b.maxDepth, b.ms,
			p.complete, p.stalled, p.contradictionScore, p.deductions, p.bottlenecks, p.maxDepth, p.ms,
			compileMs, p.routes.filter(r => r.complete && !r.bottlenecks).length].join(','));
} else {
	function stats(values) {
		if (!values.length) return { count: 0 };
		values.sort((a, b) => a - b);
		const q = fraction => {
			const index = (values.length - 1) * fraction, lower = Math.floor(index);
			return values[lower] + (values[Math.ceil(index)] - values[lower]) * (index - lower);
		};
		return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
			median: q(.5), p90: q(.9), p95: q(.95), max: values.at(-1) };
	}
	const common = records.filter(r => r.baseline.complete && r.paired.complete);
	const score = (r, cost) => r.paired.contradictionScore + cost * r.paired.deductions;
	const skulls = value => Math.ceil(value / 1500);
	const distribution = values => Object.fromEntries([...new Set(values)].sort((a,b) => a-b)
		.map(value => [value, values.filter(v => v === value).length]));
	console.log(JSON.stringify({ count: records.length, firstSeed: records[0].seed, lastSeed: records.at(-1).seed,
		baselineComplete: records.filter(r => r.baseline.complete).length,
		pairedComplete: records.filter(r => r.paired.complete).length,
		baselineStalled: records.filter(r => r.baseline.stalled).length,
		pairedStalled: records.filter(r => r.paired.stalled).length,
		pairOnlyAllRoutes: records.filter(r => r.paired.complete && !r.paired.bottlenecks).length,
		pairOnlySomeRoutes: records.filter(r => r.paired.routes.some(s => s.complete && !s.bottlenecks) && r.paired.bottlenecks).length,
		noPairDeductions: records.filter(r => !r.paired.deductions).length,
		pairOnlyBaselineScores: stats(records.filter(r => r.paired.complete && !r.paired.bottlenecks).map(r => r.baseline.contradictionScore)),
		pairOnlyBaselineSkulls: distribution(records.filter(r => r.paired.complete && !r.paired.bottlenecks).map(r => skulls(r.baseline.contradictionScore))),
		baselineDepth: distribution(records.map(r => r.baseline.maxDepth)),
		pairedDepth: distribution(records.map(r => r.paired.maxDepth)),
		baselineMs: stats(records.map(r => r.baseline.ms)),
		pairedMsIncludingCompile: stats(records.map(r => r.paired.ms + r.compileMs)),
		commonComplete: common.length,
		baselineScores: stats(common.map(r => r.baseline.contradictionScore)),
		baselineSkulls: distribution(common.map(r => skulls(r.baseline.contradictionScore))),
		baselineBottlenecks: stats(common.map(r => r.baseline.bottlenecks)),
		pairedBottlenecks: stats(common.map(r => r.paired.bottlenecks)),
		pairedDeductions: stats(common.map(r => r.paired.deductions)),
		costs: [0, 10, 50, 100].map(cost => ({ cost, scores: stats(common.map(r => score(r, cost))),
			skulls: distribution(common.map(r => skulls(score(r, cost)))),
			lowerScore: common.filter(r => score(r,cost) < r.baseline.contradictionScore - 1e-8).length,
			higherScore: common.filter(r => score(r,cost) > r.baseline.contradictionScore + 1e-8).length,
			fewerSkulls: common.filter(r => skulls(score(r,cost)) < skulls(r.baseline.contradictionScore)).length,
			moreSkulls: common.filter(r => skulls(score(r,cost)) > skulls(r.baseline.contradictionScore)).length })),
		incomplete: records.filter(r => !r.baseline.complete || !r.paired.complete)
			.map(r => ({ seed:r.seed, baselineComplete:r.baseline.complete, pairedComplete:r.paired.complete,
				baselineStalled:r.baseline.stalled, pairedStalled:r.paired.stalled })),
	}, null, 2));
}
