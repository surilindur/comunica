const retryCount = 1 + 1;

let attempt = 0;

while (attempt < retryCount) {
  attempt++;
  console.log('attempt', attempt, '/', retryCount);
  break;
}

console.log(attempt);
