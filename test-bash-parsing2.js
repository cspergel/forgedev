// More edge cases for pre-tool-use.js Bash parsing

// Test newlines as command separators (not handled by split regex!)
function testFullEvaluation(command) {
  const safePatterns = [
    /^\s*ls\b/,
    /^\s*cat\s/,
    /^\s*grep\s/,
    /^\s*echo\s/,
    /^\s*git\s+(status|log|diff|show|branch|remote|tag|stash\s+list)\b/,
    /^\s*git\s+(add|commit)\b/,
    /^\s*npm\s+(test|run\s+test|run\s+lint|run\s+validate|install)\b/,
  ];

  // Command substitution check
  if (/\$\(|`[^`]*`|<\(|>\(/.test(command)) {
    console.log(`Command: ${JSON.stringify(command)} => BLOCKED (cmd substitution)`);
    return;
  }

  const segments = command.split(/\s*(?:;|&&|\|\||(?<!\|)\|(?!\|))\s*/).filter(Boolean);
  const allSafe = segments.every((seg) => {
    const trimmed = seg.trim();
    if (!trimmed) return true;
    const matchesSafe = safePatterns.some((p) => p.test(trimmed));
    const stripped = trimmed.replace(/\d+>&\d+/g, '').replace(/\d+>\s*\/dev\/null/g, '');
    const hasUnsafe = />\s*[^\s]/.test(stripped) || /\|\s*Out-File/i.test(stripped);
    return matchesSafe && !hasUnsafe;
  });

  console.log(`Command: ${JSON.stringify(command)} => ${allSafe ? 'ALLOWED' : 'BLOCKED'}`);
  console.log(`  Segments: ${JSON.stringify(segments)}`);
}

console.log('=== NEWLINE BYPASS ATTEMPTS ===');
// CRITICAL: Newlines are NOT in the split regex!
testFullEvaluation('cat file.txt\nrm -rf /');
testFullEvaluation('ls\necho pwned > /tmp/test');
testFullEvaluation('grep foo bar\npython -c "import os; os.remove(\'file\')"');

console.log('\n=== GIT ADD/COMMIT BYPASS ATTEMPTS ===');
// git add/commit can be abused to stage/commit sensitive files
testFullEvaluation('git add -A');
testFullEvaluation('git commit -m "stealing state"');
testFullEvaluation('git add .forgeplan/state.json');
// git checkout can overwrite files
testFullEvaluation('git checkout -- .');

console.log('\n=== PIPE TO DESTRUCTIVE COMMAND ===');
// tee writes to files, xargs can run anything
testFullEvaluation('cat file.txt | tee /tmp/output.txt');
testFullEvaluation('find . | xargs rm');
testFullEvaluation('echo test | xargs touch');

console.log('\n=== NPM INSTALL ABUSE ===');
// npm install with a malicious package
testFullEvaluation('npm install evil-package');
// npm run with custom scripts
testFullEvaluation('npm run build');
testFullEvaluation('npm run deploy');

console.log('\n=== NODE SCRIPT INJECTION ===');
// What if someone uses a different script path that matches the pattern?
testFullEvaluation('node /tmp/evil-validate-manifest.js');
testFullEvaluation('node scripts/validate-manifest.js; rm -rf /');
testFullEvaluation('node ./foo/cross-model-review.js --exec "rm -rf /"');

console.log('\n=== REDIRECT EDGE CASES ===');
// > /dev/null without fd prefix - is this blocked?
testFullEvaluation('npm test > /dev/null');
// What about stdout redirect to /dev/null?
testFullEvaluation('npm test 1>/dev/null');
// stderr+stdout to /dev/null
testFullEvaluation('npm test > /dev/null 2>&1');

console.log('\n=== CODEX/GEMINI INJECTION ===');
// These are whitelisted - can they be abused?
testFullEvaluation('codex -q "rm -rf /"');
testFullEvaluation('gemini -q "delete everything"');

console.log('\n=== EMPTY BACKTICK EDGE CASE ===');
// Backtick regex is `[^`]*` - what about nested or empty?
console.log('Empty backticks: ', /`[^`]*`/.test('echo ``'));
console.log('Nested backticks: ', /`[^`]*`/.test('echo `echo `rm``'));
