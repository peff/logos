# Usage: python3 analysis/extreme-times-summary.py times.csv
import csv, math, collections, sys
rows=list(csv.DictReader(open(sys.argv[1])))
r=[dict(x, **{k:float(x[k]) for k in ('minutes','old_score','effort')}) for x in rows if x['included']=='1']
def corr(x,y):
 a=sum(x)/len(x);b=sum(y)/len(y)
 return sum((i-a)*(j-b) for i,j in zip(x,y))/math.sqrt(sum((i-a)**2 for i in x)*sum((j-b)**2 for j in y))
def rank(x):
 return [1+sum(v<t for v in x)+(sum(v==t for v in x)-1)/2 for t in x]
print('Exclusions',dict(collections.Counter(x['reason'] for x in rows if x['included']=='0')))
for name,rr in [('All first timed wins',r),('Without aac80a9c',[x for x in r if x['seed']!='aac80a9c']),('No earlier recorded attempt',[x for x in r if x['prior_runs']=='0']),('Under 15 minutes',[x for x in r if x['minutes']<=15])]:
 print(name,len(rr))
 for field in ('old_score','effort'):
  x=[t[field] for t in rr]; y=[t['minutes'] for t in rr]
  print(field,'Pearson',round(corr(x,y),3),'Spearman',round(corr(rank(x),rank(y)),3))
print('Largest scores',[(x['seed'],round(x['minutes'],2),round(x['old_score']),round(x['effort'])) for x in sorted(r,key=lambda x:x['effort'],reverse=True)[:8]])
