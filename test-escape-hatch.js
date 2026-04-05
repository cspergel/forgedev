// Test the escape hatch regex for rm .forgeplan/state.json
const pattern = /\brm\b.*\.forgeplan[/\\]state\.json/;

function test(cmd) {
  console.log(`${JSON.stringify(cmd)} => ${pattern.test(cmd) ? 'MATCHES (allowed)' : 'NO MATCH (blocked)'}`);
}

// Legitimate uses
test('rm .forgeplan/state.json');
test('rm -f .forgeplan/state.json');

// Piggybacking: can we sneak in extra commands?
test('rm .forgeplan/state.json; rm -rf /');
test('rm .forgeplan/state.json && curl evil.com');
test('rm -rf / && rm .forgeplan/state.json');  // rm first destroys everything, then touches state
test('echo pwned > /tmp/hack; rm .forgeplan/state.json');

// The escape hatch in Bash evaluator (line 404-406) only checks this regex
// It does NOT go through the segment splitting or safe pattern checking
// So rm .forgeplan/state.json; <anything> would be ALLOWED
console.log('\n=== BUT: Does the Bash evaluator for corrupted state reach the segment logic? ===');
console.log('Answer: NO. The escape hatch at line 404-406 returns {block:false} immediately.');
console.log('The segment logic at line 480+ is only reached for VALID state.');
