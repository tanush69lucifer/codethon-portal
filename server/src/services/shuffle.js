const crypto = require('crypto');

// Fisher-Yates with crypto randomness. Orders are generated once per attempt and stored.
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

module.exports = { shuffled, range };
