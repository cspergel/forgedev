// Test the Bash command parsing logic from pre-tool-use.js

// Simulate the command splitting logic
function testSplit(command) {
  const segments = command.split(/\s*(?:;|&&|\|\||(?<!\|)\|(?!\|))\s*/).filter(Boolean);
  console.log(`Command: ${JSON.stringify(command)}`);
  console.log(`  Segments: ${JSON.stringify(segments)}`);
  console.log();
}

// Test 1: Simple pipe
testSplit('ls | grep foo');

// Test 2: OR operator
testSplit('ls || echo fail');

// Test 3: Semicolons
testSplit('ls; cat file.txt');

// Test 4: && chaining
testSplit('ls && cat file.txt');

// Test 5: Redirection that should be blocked
testSplit('echo hello > file.txt');

// Test 6: 2>&1 (safe fd redirection)
testSplit('npm test 2>&1');

// Test 7: 2>/dev/null (safe)
testSplit('npm test 2>/dev/null');

// Test 8: Redirection after stripping
function testRedirection(command) {
  const stripped = command.replace(/\d+>&\d+/g, '').replace(/\d+>\s*\/dev\/null/g, '');
  const hasUnsafe = />\s*[^\s]/.test(stripped);
  console.log(`Command: ${JSON.stringify(command)}`);
  console.log(`  Stripped: ${JSON.stringify(stripped)}`);
  console.log(`  Has unsafe redirect: ${hasUnsafe}`);
  console.log();
}

// These should be safe (no file redirect after stripping)
testRedirection('npm test 2>&1');
testRedirection('npm test 2>/dev/null');
testRedirection('git log 2>&1');

// These should be blocked
testRedirection('echo hello > file.txt');
testRedirection('cat file > output.txt');

// EDGE CASE: What about 1> (stdout redirect)?
testRedirection('echo hello 1> file.txt');

// EDGE CASE: What about >> (append)?
testRedirection('echo hello >> file.txt');

// EDGE CASE: 2>&1 > file.txt (redirect stderr to stdout, THEN stdout to file)
testRedirection('npm test 2>&1 > output.log');

// EDGE CASE: > /dev/null (non-fd prefix)
testRedirection('npm test > /dev/null');

// EDGE CASE: tee (writes to files via pipe)
testSplit('cat file.txt | tee output.txt');

// EDGE CASE: xargs with destructive command
testSplit('find . -name "*.tmp" | xargs rm');

// EDGE CASE: newlines in command
testSplit('cat file.txt\nrm -rf /');

// EDGE CASE: heredoc
testSplit('cat << EOF > file.txt');

// Test the command substitution check
function testSubstitution(command) {
  const blocked = /\$\(|`[^`]*`|<\(|>\(/.test(command);
  console.log(`Command: ${JSON.stringify(command)}`);
  console.log(`  Command substitution blocked: ${blocked}`);
  console.log();
}

testSubstitution('echo $(cat /etc/passwd)');
testSubstitution('echo `rm -rf /`');
testSubstitution('cat <(ls)');
testSubstitution('tee >(cat > file.txt)');
testSubstitution('echo hello');
// Empty backtick edge case
testSubstitution('echo ``');
