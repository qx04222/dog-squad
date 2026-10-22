'use strict';
const fs = require('node:fs/promises');
// Read through one opened descriptor, and enforce the limit during reading too.
// A selected file being replaced or growing after stat cannot evade the cap.
async function readBoundedFile(file, maxBytes, openFile = fs.open) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new Error('文件读取限制无效');
  const handle = await openFile(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('文件无效或超过大小限制');
    const buffer = Buffer.alloc(maxBytes + 1); let size = 0;
    while (size <= maxBytes) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > maxBytes) throw new Error('文件在读取时超过大小限制');
    return buffer.subarray(0, size);
  } finally { await handle.close(); }
}
module.exports = { readBoundedFile };
