# gnuplot -c analysis/extreme-times.gnuplot times.csv times.png
set terminal pngcairo size 1500,1100 enhanced font 'Sans,12'
set output ARG2
set datafile separator ','
set border 3 lc rgb '#8895a5'
set tics nomirror textcolor rgb '#344256'
set grid ytics lc rgb '#e3e8ee'
set ylabel 'Active play time (minutes)'
set key top left Left reverse samplen 1 spacing 1.2
set style line 1 pt 7 ps 1 lc rgb '#3977aa'
set style line 2 pt 9 ps 1.7 lc rgb '#d07818'
set style line 3 pt 13 ps 1.7 lc rgb '#ba4164'
set multiplot layout 2,2 title "Which Extreme score tracks play time?\n67 first recorded timed solo wins; both scores recomputed with ten routes" font ',18' margins 0.075,0.97,0.08,0.88 spacing 0.09,0.13
set title 'Legacy numeric score — full range' font ',15'
set xlabel 'Legacy numeric score'
set xrange [-1500:66000]
set yrange [0:90]
set xtics 20000
set ytics 15
plot ARG1 every ::1 using ($6 == 1 ? $9 : 1/0):4 with points ls 1 title 'First timed wins', \
 ARG1 every ::1 using ($6 == 1 && strcol(2) eq 'ac185eca' ? $9 : 1/0):4 with points ls 2 title 'ac185eca', \
 ARG1 every ::1 using ($6 == 1 && strcol(2) eq 'aac80a9c' ? $9 : 1/0):4 with points ls 3 title 'aac80a9c'
set title 'Effort — full range' font ',15'
set xlabel 'Effort score'
set xrange [-50:2350]
set xtics 500
plot ARG1 every ::1 using ($6 == 1 ? $10 : 1/0):4 with points ls 1 notitle, \
 ARG1 every ::1 using ($6 == 1 && strcol(2) eq 'ac185eca' ? $10 : 1/0):4 with points ls 2 notitle, \
 ARG1 every ::1 using ($6 == 1 && strcol(2) eq 'aac80a9c' ? $10 : 1/0):4 with points ls 3 notitle
set title 'Detail: score <= 6,000; time <= 15 min' font ',15'
set xlabel 'Legacy numeric score'
set xrange [-150:6000]
set yrange [0:15]
set xtics 1000
set ytics 3
plot ARG1 every ::1 using ($6 == 1 ? $9 : 1/0):4 with points ls 1 notitle, \
 ARG1 every ::1 using ($6 == 1 && strcol(2) eq 'ac185eca' ? $9 : 1/0):4 with points ls 2 notitle
set title 'Detail: effort <= 400; time <= 15 min' font ',15'
set xlabel 'Effort score'
set xrange [-10:400]
set xtics 100
plot ARG1 every ::1 using ($6 == 1 ? $10 : 1/0):4 with points ls 1 notitle, \
 ARG1 every ::1 using ($6 == 1 && strcol(2) eq 'ac185eca' ? $10 : 1/0):4 with points ls 2 notitle
unset multiplot
