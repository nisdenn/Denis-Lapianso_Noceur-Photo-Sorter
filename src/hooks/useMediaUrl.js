// useMediaUrl.js
// Filmstrip: NEVER converts RAW (placeholder only)
// Viewer: converts on-demand via IPC

import { useState, useEffect, useRef } from 'react';

const RAW_EXTS = new Set(['.cr2','.cr3','.nef','.arw','.dng','.raf','.orf','.rw2','.pef','.srw','.x3f','.raw','.heic','.heif','.tiff','.tif']);

export function getExt(p) { return p ? (p.match(/\.[^.]+$/) || [''])[0].toLowerCase() : ''; }
export function isRawFormat(p) { return RAW_EXTS.has(getExt(p)); }
export function toFileUrl(p) {
  if (!p) return null;
  const n = p.replace(/\\/g, '/');
  return `file:///${n.startsWith('/') ? n.slice(1) : n}`;
}

// Hook for VIEWER only — fetches base64 for RAW/HEIC
export function useMediaUrl(filePath) {
  const [state, setState] = useState({ url: null, loading: false, error: false });
  const prev = useRef(null);

  useEffect(() => {
    if (!filePath) { setState({ url: null, loading: false, error: false }); return; }
    if (filePath === prev.current) return;
    prev.current = filePath;

    if (!isRawFormat(filePath)) {
      setState({ url: toFileUrl(filePath), loading: false, error: false });
      return;
    }

    setState({ url: null, loading: true, error: false });
    window.api.getRawPreview(filePath)
      .then(r => {
        if (r?.base64) setState({ url: `data:${r.mime};base64,${r.base64}`, loading: false, error: false });
        else setState({ url: null, loading: false, error: true });
      })
      .catch(() => setState({ url: null, loading: false, error: true }));
  }, [filePath]);

  return state;
}
