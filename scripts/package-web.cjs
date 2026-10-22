const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dog-squad-web-'));
const out = path.join(root, 'dist', `Dog-Squad-${require('../package.json').version}-Web.zip`);
const pending = out + '.pending';
try {
  execFileSync(process.execPath, ['build.cjs'], { cwd: root, stdio: 'inherit' });
  for (const file of ['狗狗突击队.html', '启动游戏.command', '怎么玩.txt', 'LICENSE', 'LICENSE-ASSETS.md', 'THIRD_PARTY_NOTICES.md', 'assets/PROVENANCE.md', 'assets/ART-PROVENANCE-1.0.md']) {
    fs.mkdirSync(path.dirname(path.join(stage,file)),{recursive:true});
    fs.copyFileSync(path.join(root, file), path.join(stage, file));
  }
  fs.chmodSync(path.join(stage, '启动游戏.command'), 0o755);
  // macOS Info-ZIP can omit UTF-8 flags for Chinese filenames. Python writes
  // the standard UTF-8 flag and preserves Unix executable mode in the archive.
  execFileSync('python3', ['-c', `
from pathlib import Path
import sys, zipfile
stage, out = Path(sys.argv[1]), Path(sys.argv[2])
names = ['狗狗突击队.html', '启动游戏.command', '怎么玩.txt', 'LICENSE', 'LICENSE-ASSETS.md', 'THIRD_PARTY_NOTICES.md', 'assets/PROVENANCE.md', 'assets/ART-PROVENANCE-1.0.md']
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        archive.write(stage / name, name)
with zipfile.ZipFile(out) as archive:
    assert archive.namelist() == names
    assert archive.testzip() is None
    assert all(entry.flag_bits & 0x800 for entry in archive.infolist() if not entry.filename.isascii())
    assert (archive.getinfo(names[1]).external_attr >> 16) & 0o777 == 0o755
print('Web ZIP: CRC, UTF-8 filenames and executable permissions verified.')
`, stage, pending], { stdio: 'inherit' });
  fs.renameSync(pending, out);
  console.log(out);
} finally {
  fs.rmSync(pending, { force: true });
  fs.rmSync(stage, { recursive: true, force: true });
}
