// rawConverter.js — RAW/HEIC/TIFF Converter
const fs   = require('fs-extra');
const path = require('path');

const RAW_EXTS  = new Set(['.cr2','.cr3','.nef','.arw','.dng','.raf','.orf','.rw2','.pef','.srw','.x3f','.raw']);
const HEIC_EXTS = new Set(['.heic','.heif']);
const TIFF_EXTS = new Set(['.tiff','.tif']);
const cache = new Map();
const MAX_CACHE = 60;

function getExt(p) { return path.extname(p||'').toLowerCase(); }
function needsConversion(p) { const e=getExt(p); return RAW_EXTS.has(e)||HEIC_EXTS.has(e)||TIFF_EXTS.has(e); }
function isCached(p) { return cache.has(p); }
function clearCache() { cache.clear(); }

function evict() {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
}

async function getBase64Preview(filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  const ext = getExt(filePath);
  let result = null;
  try {
    if (HEIC_EXTS.has(ext))      result = await convertHeic(filePath);
    else if (RAW_EXTS.has(ext))  result = await extractRawJpeg(filePath);
    else if (TIFF_EXTS.has(ext)) result = await convertTiff(filePath);
  } catch (e) {
    console.error(`[raw] ${path.basename(filePath)}: ${e.message}`);
  }
  if (result) { evict(); cache.set(filePath, result); }
  return result;
}

async function convertHeic(filePath) {
  const heicConvert = require('heic-convert');
  const input  = await fs.readFile(filePath);
  const output = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.88 });
  return { base64: Buffer.from(output).toString('base64'), mime: 'image/jpeg' };
}

async function convertTiff(filePath) {
  try {
    const sharp  = require('sharp');
    const buffer = await sharp(filePath).jpeg({ quality: 88 }).toBuffer();
    return { base64: buffer.toString('base64'), mime: 'image/jpeg' };
  } catch {
    const buf = await fs.readFile(filePath);
    return { base64: buf.toString('base64'), mime: 'image/tiff' };
  }
}

async function extractRawJpeg(filePath) {
  const raw  = await fs.readFile(filePath);
  const len  = raw.length;
  const candidates = [];
  for (let i = 0; i < len - 3; i++) {
    if (raw[i]===0xFF && raw[i+1]===0xD8 && raw[i+2]===0xFF) {
      const start = i;
      const limit = Math.min(len, start + 83886080);
      let end = -1;
      for (let j = start + 2; j < limit - 1; j++) {
        if (raw[j]===0xFF && raw[j+1]===0xD9) { end = j + 2; break; }
      }
      if (end > start + 2000) { candidates.push({ start, end, size: end - start }); i = end - 1; }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a,b) => b.size - a.size);
  const best = candidates[0];
  const buf = raw.slice(best.start, best.end);
  if (buf[0]!==0xFF || buf[1]!==0xD8) return null;
  return { base64: buf.toString('base64'), mime: 'image/jpeg' };
}

module.exports = { getBase64Preview, needsConversion, isCached, clearCache };
