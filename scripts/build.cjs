'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { ROOT, collectSiteFiles } = require('./site-files.cjs');
async function build() {
  const files = await collectSiteFiles();
  const output = path.resolve(ROOT, 'dist');
  // Only the generated dist directory inside this workspace may be replaced.
  if (path.dirname(output) !== ROOT || path.basename(output) !== 'dist') throw new Error('构建输出路径不正确。');
  try {
    const stat = await fs.lstat(output);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(output) !== path.join(await fs.realpath(ROOT), 'dist')) throw new Error('dist 必须是项目内的普通目录。');
    const marker = JSON.parse(await fs.readFile(path.join(output, '.youjian-build.json'), 'utf8'));
    if (marker.generator !== 'youjian-game-hall') throw new Error('dist 不是本项目的构建产物。');
    await fs.rm(output, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // If dist exists without our marker, preserve its contents.
    if (await fs.stat(output).then(() => true, () => false)) throw new Error('dist 中已有其他文件，请先将它们另行保存。');
  }
  await fs.mkdir(output, { recursive: true });
  for (const file of files) {
    const destination = path.join(output, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(ROOT, file), destination);
  }
  await fs.writeFile(path.join(output, '.youjian-build.json'), JSON.stringify({ generator: 'youjian-game-hall', files }, null, 2));
  console.log(`构建完成：${files.length} 个发布文件 → ${output}`);
  return files;
}
if (require.main === module) build().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { build };
