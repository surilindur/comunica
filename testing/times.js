const times = [ 1724836337636, 1724836337637 ];

for (let i = 1; i < times.length; i++) {
  console.log('interval', (times[i] - times[i - 1]) / 1_000);
}
