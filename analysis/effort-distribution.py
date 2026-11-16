# python3 analysis/effort-distribution.py random.csv played.csv output-prefix
import collections
import csv
import json
import math
import sys

sample = [r for r in csv.DictReader(open(sys.argv[1])) if r['group'] == 'sample']
played = [r for r in csv.DictReader(open(sys.argv[2])) if r['included'] == '1']
bounds = [0, 100, 150, 200, 300, 500, 1000, math.inf]
labels = ['<100', '100–<150', '150–<200', '200–<300', '300–<500', '500–<1000', '1000+']

def summarize(rows):
    values = sorted(float(r['effort']) for r in rows if r['effort'])
    def quantile(p):
        i = (len(values) - 1) * p
        k = int(i)
        return values[k] + (values[min(k + 1, len(values) - 1)] - values[k]) * (i - k)
    counts = [sum(a <= x < b for x in values) for a, b in zip(bounds, bounds[1:])]
    return {
        'input_count': len(rows), 'complete_count': len(values),
        'quantiles': {str(p): quantile(p) for p in [0, .1, .25, 1/3, .5, 2/3, .75, .9, .95, .99, 1]},
        'bands': dict(zip(labels, counts)),
        'percentages': [100 * n / len(values) for n in counts],
    }

summary = {'random': summarize(sample), 'played': summarize(played),
           'random_statuses': dict(collections.Counter(r['status'] for r in sample))}
with open(sys.argv[3] + '.json', 'w') as f:
    json.dump(summary, f, indent=2)
with open(sys.argv[3] + '.dat', 'w') as f:
    for i, label in enumerate(labels):
        f.write(f'"{label}" {summary["random"]["percentages"][i]} {summary["played"]["percentages"][i]}\n')
print(json.dumps(summary, indent=2))
