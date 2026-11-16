# gnuplot -c analysis/effort-distribution.gnuplot bands.dat output.png random-count played-count
set terminal pngcairo size 1250,730 enhanced font 'Sans,14'
set output ARG2
set title sprintf("How experimental effort scores distribute\n%s randomly sampled Extreme puzzles vs. %s played puzzles", ARG3, ARG4) font ',19'
set style data histograms
set style histogram clustered gap 1
set style fill solid 0.85 border -1
set boxwidth 0.9
set border 3 lc rgb '#8895a5'
set tics nomirror textcolor rgb '#344256'
set grid ytics lc rgb '#e3e8ee'
set ylabel 'Percentage of puzzles in each set'
set xlabel 'Effort score band (unequal numeric widths)'
set yrange [0:50]
set ytics 10
set key top right spacing 1.5
set bmargin 5
plot ARG1 using 2:xtic(1) lc rgb '#3977aa' title 'Random sample', \
     '' using 3 lc rgb '#d07818' title 'Your first recorded timed wins'
