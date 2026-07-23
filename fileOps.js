// fileOps.js — File System Operations
const fs     = require('fs-extra');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.heic','.heif','.tiff','.tif','.bmp','.gif','.raw','.cr2','.cr3','.nef','.arw','.dng','.raf','.orf','.rw2','.pef','.srw','.x3f']);
const VIDEO_EXTS = new Set(['.mp4','.mov','.avi','.mkv','.webm','.m4v','.wmv','.flv','.3gp','.mts','.m2ts','.mpg','.mpeg']);
const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);
const PRESETS_FILE = path.join(os.homedir(), '.noceursorter', 'presets.json');
const RATINGS_DIR  = path.join(os.homedir(), '.noceursorter', 'ratings');

const folderCounters = new Map();
const ensuredFolders = new Set();
let undoStack = [];

function isVideo(p) { return VIDEO_EXTS.has(path.extname(p||'').toLowerCase()); }

async function listImages(folder) {
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && MEDIA_EXTS.has(path.extname(e.name).toLowerCase()))
      .sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    folderCounters.clear(); ensuredFolders.clear();
    return files.map(f => path.join(folder, f.name));
  } catch { return []; }
}

async function ensureFolders(root, mappings) {
  try {
    await Promise.all(Object.values(mappings).filter(Boolean).map(name => {
      const full = path.join(root, name);
      if (ensuredFolders.has(full)) return;
      ensuredFolders.add(full);
      return fs.ensureDir(full);
    }));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function moveAndRename(srcPath, destDir, pattern) {
  try {
    if (!(await fs.pathExists(srcPath))) return { success: false, error: 'Source not found' };
    if (!ensuredFolders.has(destDir)) { await fs.ensureDir(destDir); ensuredFolders.add(destDir); }
    const ext = path.extname(srcPath);
    if (!folderCounters.has(destDir)) {
      try {
        const ex = await fs.readdir(destDir);
        folderCounters.set(destDir, ex.filter(f => MEDIA_EXTS.has(path.extname(f).toLowerCase())).length);
      } catch { folderCounters.set(destDir, 0); }
    }
    const cur = folderCounters.get(destDir);
    folderCounters.set(destDir, cur + 1);
    const counter = String(cur + 1).padStart(4, '0');
    let base = (pattern||'{counter}').replace('{counter}', counter).replace('{ext}', ext.replace('.', '')).replace(/[\\/:*?"<>|]/g, '');
    let dest = path.join(destDir, `${base}${ext}`);
    let n = 1;
    while (await fs.pathExists(dest)) { dest = path.join(destDir, `${base}_${n}${ext}`); n++; }
    await fs.move(srcPath, dest);
    undoStack.push({ from: dest, to: srcPath, category: path.basename(destDir) });
    return { success: true, destPath: dest };
  } catch (e) {
    if (folderCounters.has(destDir)) folderCounters.set(destDir, folderCounters.get(destDir) - 1);
    return { success: false, error: e.message };
  }
}

async function undoLast() {
  const last = undoStack.pop();
  if (!last) return null;
  try {
    await fs.move(last.from, last.to);
    const d = path.dirname(last.from);
    if (folderCounters.has(d)) folderCounters.set(d, Math.max(0, folderCounters.get(d) - 1));
    return { restoredPath: last.to, category: last.category };
  } catch { undoStack.push(last); return null; }
}

async function undoMany(count) {
  const r = [];
  for (let i = 0; i < count; i++) { const x = await undoLast(); if (!x) break; r.push(x); }
  return r;
}

async function findDuplicates(folder) {
  try {
    const media = await listImages(folder);
    const hashMap = new Map();
    const BATCH = 8;
    for (let i = 0; i < media.length; i += BATCH) {
      await Promise.all(media.slice(i, i+BATCH).map(async p => {
        try {
          const fd = await fs.open(p, 'r');
          const buf = Buffer.alloc(65536);
          await fs.read(fd, buf, 0, 65536, 0);
          await fs.close(fd);
          const hash = crypto.createHash('md5').update(buf).digest('hex');
          if (!hashMap.has(hash)) hashMap.set(hash, []);
          hashMap.get(hash).push(p);
        } catch {}
      }));
    }
    return [...hashMap.values()].filter(g => g.length > 1);
  } catch { return []; }
}

function ratingKey(folder) { return crypto.createHash('md5').update(folder).digest('hex'); }
async function loadRatings(folder) {
  try {
    const f = path.join(RATINGS_DIR, `${ratingKey(folder)}.json`);
    return await fs.pathExists(f) ? await fs.readJSON(f) : {};
  } catch { return {}; }
}
async function saveRatings(folder, ratings) {
  try {
    await fs.ensureDir(RATINGS_DIR);
    await fs.writeJSON(path.join(RATINGS_DIR, `${ratingKey(folder)}.json`), ratings, { spaces: 2 });
    return true;
  } catch { return false; }
}

// EXIF reader (pure JS, no deps)
const EXIF_TAGS = { 0x010F:'make', 0x0110:'model', 0x9003:'date', 0x829A:'shutter', 0x829D:'fNumber', 0x8827:'iso', 0x920A:'focal', 0xA002:'width', 0xA003:'height' };
function readRational(buf, off, le) {
  const n = le ? buf.readUInt32LE(off) : buf.readUInt32BE(off);
  const d = le ? buf.readUInt32LE(off+4) : buf.readUInt32BE(off+4);
  return d === 0 ? 0 : n / d;
}
function parseExif(buf) {
  try {
    if (buf[0]!==0xFF||buf[1]!==0xD8) return null;
    let off = 2;
    while (off < buf.length - 4) {
      if (buf[off]!==0xFF) break;
      const marker = buf[off+1];
      const segLen = buf.readUInt16BE(off+2);
      if (marker===0xE1 && buf.slice(off+4,off+10).toString('ascii').startsWith('Exif')) {
        const ts = off + 10;
        const tb = buf.slice(ts);
        const le = tb[0]===0x49;
        const ifdOff = le ? tb.readUInt32LE(4) : tb.readUInt32BE(4);
        const n = le ? tb.readUInt16LE(ifdOff) : tb.readUInt16BE(ifdOff);
        const res = {};
        for (let i = 0; i < n; i++) {
          const eo = ifdOff + 2 + i * 12;
          if (eo + 12 > tb.length) break;
          const tag = le ? tb.readUInt16LE(eo) : tb.readUInt16BE(eo);
          const type = le ? tb.readUInt16LE(eo+2) : tb.readUInt16BE(eo+2);
          const name = EXIF_TAGS[tag];
          if (!name) continue;
          try {
            if (type===2) {
              const cnt = le ? tb.readUInt32LE(eo+4) : tb.readUInt32BE(eo+4);
              let so = eo + 8;
              if (cnt > 4) so = le ? tb.readUInt32LE(eo+8) : tb.readUInt32BE(eo+8);
              res[name] = tb.slice(so, so+cnt-1).toString('ascii').trim();
            } else if (type===3) {
              res[name] = le ? tb.readUInt16LE(eo+8) : tb.readUInt16BE(eo+8);
            } else if (type===4) {
              res[name] = le ? tb.readUInt32LE(eo+8) : tb.readUInt32BE(eo+8);
            } else if (type===5) {
              const ro = le ? tb.readUInt32LE(eo+8) : tb.readUInt32BE(eo+8);
              res[name] = readRational(tb, ro, le);
            }
          } catch {}
        }
        return res;
      }
      off += 2 + segLen;
    }
    return null;
  } catch { return null; }
}

async function getExif(filePath) {
  try {
    const stat = await fs.stat(filePath);
    const base = { filename: path.basename(filePath), size: stat.size, mtime: stat.mtime };
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg','.jpeg','.tiff','.tif','.cr2','.nef','.arw'].includes(ext)) return base;
    const fd = await fs.open(filePath, 'r');
    const buf = Buffer.alloc(131072);
    await fs.read(fd, buf, 0, 131072, 0);
    await fs.close(fd);
    const exif = parseExif(buf);
    if (!exif) return base;
    const sh = exif.shutter ? (exif.shutter < 1 ? `1/${Math.round(1/exif.shutter)}s` : `${exif.shutter.toFixed(1)}s`) : '';
    return { ...base, make: exif.make||'', model: exif.model||'', date: exif.date||'', shutter: sh, aperture: exif.fNumber ? `f/${exif.fNumber.toFixed(1)}` : '', iso: exif.iso ? `ISO ${exif.iso}` : '', focalLength: exif.focal ? `${Math.round(exif.focal)}mm` : '', width: exif.width||0, height: exif.height||0 };
  } catch { return null; }
}

function getDefaultPresets() {
  return [
    { id:'default', name:'Default', mappings:{'1':'[ Best Foto ]','2':'[ Need Edit ]','3':'[ Delete ]'}, pattern:'{counter}', eventName:'Project2025' },
    { id:'wedding', name:'Wedding', mappings:{'1':'[ Best Foto ]','2':'[ Need Edit ]','3':'[ Delete ]','4':'[ Ceremony ]','5':'[ Reception ]','6':'[ Candid ]'}, pattern:'{event}_{counter}', eventName:'Wedding2025' },
    { id:'event',   name:'Event',   mappings:{'1':'[ Best Foto ]','2':'[ Need Edit ]','3':'[ Delete ]','4':'[ Groups ]','5':'[ Venue ]'}, pattern:'{event}_{counter}', eventName:'Event2025' },
    { id:'product', name:'Product', mappings:{'1':'[ Best Foto ]','2':'[ Need Edit ]','3':'[ Delete ]','4':'[ Detail ]','5':'[ Context ]'}, pattern:'{event}_{counter}', eventName:'Product2025' },
  ];
}
async function loadPresets() {
  try { return await fs.pathExists(PRESETS_FILE) ? await fs.readJSON(PRESETS_FILE) : getDefaultPresets(); }
  catch { return getDefaultPresets(); }
}
async function savePresets(presets) {
  try { await fs.ensureDir(path.dirname(PRESETS_FILE)); await fs.writeJSON(PRESETS_FILE, presets, { spaces:2 }); return true; }
  catch { return false; }
}
async function exportLog(log, filePath, format) {
  try {
    if (format==='json') { await fs.writeJSON(filePath, log, { spaces:2 }); }
    else {
      const hdr = 'Time,Filename,Destination,Category,Stars,Flag\n';
      const rows = log.filter(e=>e.from).map(e =>
        [e.time, path.basename(e.from||''), path.basename(e.to||''), e.category||'', e.stars||0, e.flag||'none']
          .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')
      );
      await fs.writeFile(filePath, hdr + rows.join('\n'), 'utf8');
    }
    return true;
  } catch { return false; }
}

module.exports = { listImages, ensureFolders, moveAndRename, undoLast, undoMany, findDuplicates, loadRatings, saveRatings, getExif, loadPresets, savePresets, exportLog, isVideo };
