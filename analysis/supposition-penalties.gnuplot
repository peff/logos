# gnuplot -c analysis/supposition-penalties.gnuplot penalties.dat output.png
set terminal pngcairo size 1450,1000 enhanced font 'Sans,12'
set output ARG2
set border 3 lc rgb '#8895a5'
set tics nomirror textcolor rgb '#344256'
set grid ytics lc rgb '#e3e8ee'
set xrange [0:40]
set xtics 10
set xlabel 'Effort penalty per used supposition'
set key top left spacing 1.2
set style line 1 lw 2.8 lc rgb '#3977aa'
set style line 2 lw 2.8 lc rgb '#d07818'
set style line 3 lw 2.8 lc rgb '#ba4164'
set multiplot layout 2,2 title "Adding a supposition penalty: ordering vs. skull calibration\n1,000 random puzzles for calibration; 67 played puzzles as a secondary check" font ',18' margins 0.075,0.97,0.09,0.87 spacing 0.09,0.14
set title 'Which puzzles change skull count?' font ',15'
set ylabel 'Percentage of random sample'
set yrange [0:100]
set ytics 20
plot ARG1 using 1:2 with lines ls 1 title 'Gain skulls; divisor stays 50', \
 '' using 1:3 with lines ls 2 title 'Gain skulls; divisor recalibrated', \
 '' using 1:4 with lines ls 3 title 'Lose skulls; divisor recalibrated'
set title 'Divisor preserving mean score in skull units' font ',15'
set ylabel 'Effort points per skull'
set yrange [45:100]
set ytics 10
plot ARG1 using 1:5 with lines ls 1 notitle
set title 'Rank correlation with your solve times' font ',15'
set ylabel 'Spearman correlation'
set yrange [0.45:0.85]
set ytics .1
plot ARG1 using 1:6 with lines ls 1 title 'All 67 puzzles', \
 '' using 1:7 with lines ls 2 title 'Without the 80-minute puzzle'
set title 'Linear correlation with your solve times' font ',15'
set ylabel 'Pearson correlation'
set yrange [0.45:0.85]
plot ARG1 using 1:8 with lines ls 1 title 'All 67 puzzles', \
 '' using 1:9 with lines ls 2 title 'Without the 80-minute puzzle'
unset multiplot
