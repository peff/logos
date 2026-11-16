# gnuplot -c analysis/extreme-comparison.gnuplot comparison.csv comparison.png
set terminal pngcairo size 1500,760 enhanced font 'Sans,13'
set output ARG2
set datafile separator ','
set border 3 lc rgb '#8895a5'
set tics nomirror textcolor rgb '#344256'
set grid ytics lc rgb '#e3e8ee'
set xlabel 'Legacy numeric score (before skull conversion)'
set ylabel 'Effort score'
set key top left Left reverse samplen 1 spacing 1.3
set style line 1 pt 7 ps 0.9 lc rgb '#3977aa'
set style line 2 pt 9 ps 1.7 lc rgb '#d07818'
set style line 3 pt 13 ps 1.8 lc rgb '#ba4164'
set multiplot layout 1,2 title "Extreme ratings: numeric score vs. accumulated effort\n150 reproducibly sampled Extreme puzzles + 2 timed reference puzzles" font ',18' margins 0.075,0.97,0.14,0.83 spacing 0.09,0.08
set title 'Sample close-up' font ',16'
set xrange [-300:9500]
set yrange [0:500]
set xtics 2000
set ytics 100
set label 1 'ac185eca: 6:11' at 1900,112 textcolor rgb '#9c5811'
plot ARG1 every ::1 using (strcol(2) eq 'sample' ? $5 : 1/0):4 with points ls 1 title 'Random sample', \
     ARG1 every ::1 using (strcol(1) eq 'ac185eca' ? $5 : 1/0):4 with points ls 2 title 'ac185eca'
unset label 1
set title 'Full scale, including the 80-minute puzzle' font ',16'
set xrange [-1500:64500]
set yrange [0:2400]
set xtics 20000
set ytics 500
set label 2 "aac80a9c: about 80 min\n59,958.49 score / 2,150.70 effort" at 57000,2030 right textcolor rgb '#a33355'
plot ARG1 every ::1 using (strcol(2) eq 'sample' ? $5 : 1/0):4 with points ls 1 title 'Random sample', \
     ARG1 every ::1 using (strcol(1) eq 'ac185eca' ? $5 : 1/0):4 with points ls 2 title 'ac185eca', \
     ARG1 every ::1 using (strcol(1) eq 'aac80a9c' ? $5 : 1/0):4 with points ls 3 title 'aac80a9c'
unset multiplot
