const path = require('path');

// Test path.relative behavior on Windows with various attack vectors
const cwd = 'C:\\project';

function test(label, targetPath) {
  try {
    const absPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
    const relPath = path.relative(cwd, absPath).replace(/\\/g, '/');
    console.log(`${label}:`);
    console.log(`  absPath=${absPath}`);
    console.log(`  relPath="${relPath}"`);
    console.log(`  startsWith("..")=${relPath.startsWith('..')}`);
    console.log();
  } catch(e) {
    console.log(`${label}: ERROR - ${e.message}\n`);
  }
}

// Normal cases
test('Normal outside project', 'C:\\other\\file.txt');
test('Inside project', 'C:\\project\\src\\file.ts');
test('.forgeplan state', 'C:\\project\\.forgeplan\\state.json');

// Path traversal attempts
test('Traversal middle (resolved)', path.resolve(cwd, '..', 'project', '.forgeplan', 'state.json'));
test('Traversal to sibling', path.resolve(cwd, '..', 'other', 'file.txt'));

// Different drive
test('Different drive D:', 'D:\\secret\\file.txt');

// UNC path (network share)
test('UNC path', '\\\\server\\share\\file.txt');

// What about paths that resolve to same dir but look different?
test('Dot-dot-then-back', 'C:\\project\\..\\project\\src\\file.ts');

// What does path.relative return for a path on a DIFFERENT drive letter?
const relCrossDrive = path.relative('C:\\project', 'D:\\secret\\file.txt');
console.log('Cross-drive raw result:', JSON.stringify(relCrossDrive));
console.log('Cross-drive normalized:', JSON.stringify(relCrossDrive.replace(/\\/g, '/')));
console.log('startsWith("..") =', relCrossDrive.replace(/\\/g, '/').startsWith('..'));
console.log();

// UNC raw
const relUNC = path.relative('C:\\project', '\\\\server\\share\\file.txt');
console.log('UNC raw result:', JSON.stringify(relUNC));
console.log('UNC normalized:', JSON.stringify(relUNC.replace(/\\/g, '/')));
console.log('startsWith("..") =', relUNC.replace(/\\/g, '/').startsWith('..'));
