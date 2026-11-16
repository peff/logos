# python3 analysis/supposition-penalties.py sample.csv times.csv output-prefix
import csv
import json
import math
import statistics
import sys

sample_rows = list(csv.DictReader(open(sys.argv[1])))
time_rows = list(csv.DictReader(open(sys.argv[2])))
sample = [r for r in sample_rows if r['group'] == 'sample' and r['status'] == 'complete']
played = [r for r in time_rows if r['included'] == '1']
for r in sample_rows + time_rows:
    for k in ('effort', 'suppositions', 'minutes'):
        if r.get(k): r[k] = float(r[k])

def quantile(values, p):
    v = sorted(values)
    i = (len(v) - 1) * p
    k = int(i)
    return v[k] + (v[min(k + 1, len(v) - 1)] - v[k]) * (i - k)

def corr(x, y):
    a, b = statistics.mean(x), statistics.mean(y)
    return sum((i-a)*(j-b) for i, j in zip(x,y)) / math.sqrt(
        sum((i-a)**2 for i in x) * sum((j-b)**2 for j in y))

def ranks(x):
    return [1 + sum(v < t for v in x) + (sum(v == t for v in x) - 1)/2 for t in x]

def correlations(rows, penalty):
    x = [r['effort'] + penalty*r['suppositions'] for r in rows]
    y = [r['minutes'] for r in rows]
    return corr(x,y), corr(ranks(x),ranks(y))

baseline = [r['effort'] for r in sample]
base_skulls = [math.ceil(e/50) for e in baseline]
mean_effort = statistics.mean(baseline)
without_longest = [r for r in played if r['seed'] != 'aac80a9c']
results = []
for p in range(41):
    adjusted = [r['effort'] + p*r['suppositions'] for r in sample]
    # Preserve the sample's mean continuous skull units, before rounding up.
    divisor = 50 * statistics.mean(adjusted) / mean_effort
    fixed = [math.ceil(e/50) for e in adjusted]
    scaled = [math.ceil(e/divisor) for e in adjusted]
    def changes(skulls):
        return {name: sum(test(a,b) for a,b in zip(skulls,base_skulls)) for name,test in [
            ('up',lambda a,b:a>b),('down',lambda a,b:a<b),('same',lambda a,b:a==b)]}
    shares = [p*r['suppositions']/e for r,e in zip(sample,adjusted)]
    pearson, spearman = correlations(played,p)
    pearson_without, spearman_without = correlations(without_longest,p)
    result = dict(penalty=p, divisor=divisor, fixed=changes(fixed), scaled=changes(scaled),
                  fixed_mean_skulls=statistics.mean(fixed), scaled_mean_skulls=statistics.mean(scaled),
                  median_penalty_share=statistics.median(shares), p95_penalty_share=quantile(shares,.95),
                  penalty_dominates=sum(s>.5 for s in shares),
                  pearson=pearson, spearman=spearman,
                  pearson_without_longest=pearson_without, spearman_without_longest=spearman_without)
    if p in [0,5,10,20,40]:
        comparable = reversed_pairs = 0
        for i in range(len(sample)):
            for j in range(i):
                before = baseline[i]-baseline[j]
                if before == 0: continue
                comparable += 1
                reversed_pairs += before*(adjusted[i]-adjusted[j]) < 0
        result['pair_reversals'] = reversed_pairs
        result['pair_reversal_fraction'] = reversed_pairs/comparable
    results.append(result)

refs = {r['seed']: {
    'effort': r['effort'], 'suppositions':r['suppositions'],
    'cases': [{'penalty':v['penalty'], 'score':r['effort']+v['penalty']*r['suppositions'],
               'fixed_skulls':math.ceil((r['effort']+v['penalty']*r['suppositions'])/50),
               'scaled_skulls':math.ceil((r['effort']+v['penalty']*r['suppositions'])/v['divisor'])}
              for v in results if v['penalty'] in [0,5,10,20,40]]}
    for r in played if r['seed'] in ['ac185eca','aac80a9c','639553c0']}
report = dict(sample_count=len(sample), played_count=len(played), mean_effort=mean_effort,
              mean_suppositions=statistics.mean(r['suppositions'] for r in sample),
              zero_suppositions=sum(r['suppositions']==0 for r in sample),
              baseline_mean_skulls=statistics.mean(base_skulls), references=refs, results=results)
with open(sys.argv[3]+'.json','w') as f: json.dump(report,f,indent=2)
with open(sys.argv[3]+'.dat','w') as f:
    f.write('# penalty fixed_up_pct scaled_up_pct scaled_down_pct divisor spearman spearman_without pearson pearson_without\n')
    for v in results:
        f.write(' '.join(str(x) for x in [v['penalty'],100*v['fixed']['up']/len(sample),
            100*v['scaled']['up']/len(sample),100*v['scaled']['down']/len(sample),v['divisor'],
            v['spearman'],v['spearman_without_longest'],v['pearson'],v['pearson_without_longest']])+'\n')
print(json.dumps({**report,'results':[r for r in results if r['penalty'] in [0,5,10,20,40]]},indent=2))
