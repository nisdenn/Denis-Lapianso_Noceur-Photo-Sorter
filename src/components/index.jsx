// components/index.jsx — Noceur Sorter
// Filmstrip: NO RAW conversion (placeholder only) — zero lag
// Viewer: on-demand RAW convert via IPC
// Background preloader runs silently in main process

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useStore, useCurrentImage, useImageRating, useProgress } from '../store';
import { useMediaUrl, toFileUrl, isRawFormat, getExt } from '../hooks/useMediaUrl';

const fmtSize  = b => b>1e6?`${(b/1e6).toFixed(1)}MB`:`${(b/1e3).toFixed(0)}KB`;
const basename = p => p?p.replace(/\\/g,'/').split('/').pop():'';
const VIDEO_EXTS = new Set(['.mp4','.mov','.avi','.mkv','.webm','.m4v','.wmv','.flv','.3gp','.mts','.m2ts','.mpg','.mpeg']);
export function isVideoFile(p) { return VIDEO_EXTS.has(getExt(p)); }

function getFormatBadge(p) {
  const ext = getExt(p).replace('.','').toUpperCase();
  const raw  = new Set(['CR2','CR3','NEF','ARW','DNG','RAF','ORF','RW2','PEF','SRW','X3F','RAW']);
  const heic = new Set(['HEIC','HEIF']);
  if (raw.has(ext))             return { label:ext, color:'bg-orange-900/70 text-orange-300' };
  if (heic.has(ext))            return { label:ext, color:'bg-pink-900/70 text-pink-300' };
  if (ext==='TIFF'||ext==='TIF') return { label:ext, color:'bg-yellow-900/70 text-yellow-300' };
  return null;
}

// ── RAW Placeholder (filmstrip ONLY — never converts) ─────────────────────────
function RawPlaceholder({ filePath }) {
  const badge = getFormatBadge(filePath);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-600)] gap-1">
      <span className="text-[var(--text-3)] text-xl">⬛</span>
      {badge && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${badge.color}`}>{badge.label}</span>}
    </div>
  );
}

// ── ZoomViewer (main viewer) ──────────────────────────────────────────────────
export function ZoomViewer({ src }) {
  const { url, loading, error } = useMediaUrl(src);
  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x:0, y:0 });
  const [dragging, setDragging] = useState(false);
  const [prevPos, setPrevPos]   = useState({ x:0, y:0 });
  const containerRef = useRef();
  const badge = getFormatBadge(src);

  useEffect(() => { setScale(1); setOffset({x:0,y:0}); }, [src]);

  const onWheel = useCallback(e => {
    e.preventDefault();
    setScale(s => Math.max(0.2, Math.min(10, s+(e.deltaY>0?-0.15:0.15))));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive:false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div ref={containerRef}
      className={`zoom-container flex-1 ${scale>1?(dragging?'cursor-grabbing':'cursor-grab'):'cursor-zoom-in'}`}
      onMouseDown={e => { if(scale<=1) return; setDragging(true); setPrevPos({x:e.clientX,y:e.clientY}); }}
      onMouseMove={e => { if(!dragging) return; setOffset(o=>({x:o.x+(e.clientX-prevPos.x),y:o.y+(e.clientY-prevPos.y)})); setPrevPos({x:e.clientX,y:e.clientY}); }}
      onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}
      onDoubleClick={() => { setScale(s=>s!==1?1:2.5); setOffset({x:0,y:0}); }}
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-900)]">
          <div className="w-8 h-8 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[var(--text-3)]">{isRawFormat(src)?`Membaca ${getExt(src).replace('.','').toUpperCase()}…`:'Memuat…'}</span>
          <span className="text-[10px] text-[var(--text-3)] opacity-60">{basename(src)}</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-3)]">
          <span className="text-5xl opacity-20">⚠</span>
          <span className="text-sm">Tidak bisa membuka file</span>
          <span className="text-xs opacity-60">{basename(src)}</span>
        </div>
      )}
      {url && !error && (
        <img key={url} src={url} alt={basename(src)}
          className="image-fade max-h-full max-w-full object-contain select-none"
          style={{ transform:`scale(${scale}) translate(${offset.x/scale}px,${offset.y/scale}px)`, transformOrigin:'center', transition:dragging?'none':'transform 0.05s ease' }}
          draggable={false}
        />
      )}
      {badge && url && <div className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded ${badge.color}`}>{badge.label}</div>}
      {scale!==1 && <button className="absolute top-2 right-2 text-xs btn btn-ghost opacity-70 z-10" onClick={()=>{setScale(1);setOffset({x:0,y:0});}}>Reset zoom</button>}
      <div className="absolute bottom-2 right-2 text-xs font-mono text-[var(--text-3)] select-none">{Math.round(scale*100)}%</div>
    </div>
  );
}

// ── VideoViewer ───────────────────────────────────────────────────────────────
export function VideoViewer({ src }) {
  const videoRef = useRef();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted]     = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume]   = useState(1);
  const url = toFileUrl(src);

  useEffect(() => { setPlaying(false); setProgress(0); setDuration(0); if(videoRef.current){videoRef.current.pause();videoRef.current.currentTime=0;} }, [src]);

  const toggle = () => { if(!videoRef.current) return; if(playing){videoRef.current.pause();setPlaying(false);}else{videoRef.current.play();setPlaying(true);} };
  const fmt = s => `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;

  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden min-h-0">
      <div className="flex-1 flex items-center justify-center min-h-0 relative cursor-pointer" onClick={toggle}>
        <video ref={videoRef} key={src} src={url} className="max-h-full max-w-full object-contain"
          onTimeUpdate={()=>setProgress(videoRef.current?.currentTime||0)}
          onLoadedMetadata={()=>setDuration(videoRef.current?.duration||0)}
          onEnded={()=>setPlaying(false)} muted={muted} preload="metadata" />
        {!playing && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center text-white text-2xl">▶</div></div>}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white">VIDEO</div>
      </div>
      <div className="flex-shrink-0 bg-[var(--bg-900)] border-t border-[var(--border)] px-4 py-2">
        <input type="range" min="0" max={duration||1} step="0.1" value={progress} onChange={e=>{const t=parseFloat(e.target.value);if(videoRef.current)videoRef.current.currentTime=t;setProgress(t);}} className="w-full h-1.5 mb-2 accent-amber-400 cursor-pointer" />
        <div className="flex items-center gap-3">
          <button onClick={toggle} className="text-white w-8 h-8 rounded-full bg-[var(--bg-500)] flex items-center justify-center">{playing?'⏸':'▶'}</button>
          <button onClick={()=>{const n=!muted;setMuted(n);if(videoRef.current)videoRef.current.muted=n;}} className="text-[var(--text-2)] hover:text-white">{muted?'🔇':'🔊'}</button>
          <input type="range" min="0" max="1" step="0.05" value={muted?0:volume} onChange={e=>{const v=parseFloat(e.target.value);setVolume(v);if(videoRef.current)videoRef.current.volume=v;setMuted(v===0);}} className="w-20 accent-amber-400 cursor-pointer" />
          <span className="text-xs font-mono text-[var(--text-3)] ml-auto">{fmt(progress)} / {fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export function MediaViewer({ src }) {
  if (!src) return null;
  return isVideoFile(src) ? <VideoViewer src={src} /> : <ZoomViewer src={src} />;
}

// ── Virtual Filmstrip (NO RAW conversion) ─────────────────────────────────────
const TW=72, TG=6, TT=78, SH=90;

function Thumb({ img, i, isActive, isSel, rating, onClick }) {
  const isVid = isVideoFile(img);
  const isRaw = isRawFormat(img);
  const badge = getFormatBadge(img);
  return (
    <div style={{position:'absolute',left:i*TT,top:(SH-TW+4)/2,width:TW-TG,height:TW-TG}}
      className={`filmstrip-thumb rounded overflow-hidden cursor-pointer relative ${isActive?'ring-2 ring-[var(--amber)]':''} ${isSel?'ring-2 ring-[var(--select)]':''}`}
      onClick={onClick}>
      {isVid ? (
        <div className="w-full h-full bg-[var(--bg-600)] flex flex-col items-center justify-center gap-0.5">
          <span className="text-purple-400 text-xl">▶</span>
          <span className="text-[8px] text-purple-300 truncate px-1 w-full text-center">{basename(img).replace(/\.[^.]+$/,'').slice(0,10)}</span>
        </div>
      ) : isRaw ? (
        <RawPlaceholder filePath={img} />
      ) : (
        <img src={toFileUrl(img)} alt="" className="w-full h-full object-cover" draggable={false} loading="lazy" onError={e=>{e.target.style.display='none';}} />
      )}
      {badge  && <div className={`absolute top-0 left-0 text-[7px] font-bold px-0.5 rounded-br ${badge.color}`}>{badge.label}</div>}
      {isVid  && <div className="absolute top-0.5 right-0.5 bg-purple-600 text-white text-[7px] px-0.5 rounded font-bold">VID</div>}
      {rating?.flag==='pick'   && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400" />}
      {rating?.flag==='reject' && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-400" />}
      {rating?.stars > 0 && <div className="absolute bottom-0.5 left-0.5 text-[7px] text-[var(--amber)] leading-none">{'★'.repeat(rating.stars)}</div>}
      {isSel && <div className="absolute inset-0 bg-blue-500/25 flex items-center justify-center"><div className="w-3.5 h-3.5 rounded bg-[var(--select)] text-white text-[8px] flex items-center justify-center font-bold">✓</div></div>}
      <div className="absolute bottom-0 right-0 bg-black/50 text-[7px] text-white px-0.5 font-mono">{i+1}</div>
    </div>
  );
}

export function Filmstrip() {
  const { state, dispatch } = useStore();
  const { images, index, selected, ratings } = state;
  const containerRef = useRef();
  const [scrollLeft, setScrollLeft]         = useState(0);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(()=>{
    const el=containerRef.current; if(!el) return;
    const ro=new ResizeObserver(()=>setContainerWidth(el.clientWidth));
    ro.observe(el); return()=>ro.disconnect();
  },[]);

  useEffect(()=>{
    if(!containerRef.current) return;
    const t=index*TT-containerWidth/2+TW/2;
    containerRef.current.scrollTo({left:Math.max(0,t),behavior:'smooth'});
  },[index,containerWidth]);

  const startIdx = Math.max(0, Math.floor(scrollLeft/TT)-2);
  const visCount = Math.ceil(containerWidth/TT)+4;
  const endIdx   = Math.min(images.length, startIdx+visCount);

  const handleClick = (e, idx) => {
    const fp=images[idx];
    if(e.shiftKey) dispatch({type:'SELECT_RANGE',filePath:fp});
    else if(e.ctrlKey||e.metaKey) dispatch({type:'TOGGLE_SELECTED',filePath:fp});
    else { dispatch({type:'CLEAR_SELECTED'}); dispatch({type:'SET_INDEX',index:idx}); }
  };

  if (!images.length) return null;
  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-900)] flex-shrink-0" style={{height:SH}}>
      <div ref={containerRef} className="overflow-x-auto h-full" style={{scrollbarWidth:'thin'}} onScroll={e=>setScrollLeft(e.target.scrollLeft)}>
        <div style={{width:images.length*TT,height:'100%',position:'relative'}}>
          {images.slice(startIdx,endIdx).map((img,li)=>(
            <Thumb key={img} img={img} i={startIdx+li} isActive={startIdx+li===index} isSel={selected.includes(img)} rating={ratings[img]} onClick={e=>handleClick(e,startIdx+li)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── StarRating ────────────────────────────────────────────────────────────────
export function StarRating({ filePath }) {
  const { state, dispatch } = useStore();
  const rating = useImageRating(state, filePath);
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(n=>(
        <button key={n} className={`star text-lg leading-none ${n<=(hover||rating.stars)?'filled':'empty'}`}
          onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(0)}
          onClick={()=>dispatch({type:'SET_RATING',filePath,stars:rating.stars===n?0:n})}>★</button>
      ))}
    </div>
  );
}

export function FlagBadge({ flag, onClick }) {
  if (!flag||flag==='none') return null;
  return <button onClick={onClick} className={`text-xs px-2 py-0.5 rounded font-medium ${flag==='pick'?'flag-pick':'flag-reject'}`}>{flag==='pick'?'✓ Pick':'✗ Reject'}</button>;
}

export function ProgressBar() {
  const { state } = useStore();
  const { total, sorted, remaining, pct } = useProgress(state);
  return (
    <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-800)]">
      <div className="flex items-center gap-3 text-xs text-[var(--text-2)] mb-1.5">
        <span className="font-mono text-[var(--amber)]">{state.index+1} / {state.images.length}</span>
        <span>|</span>
        <span>Sorted: <b className="text-[var(--text-1)]">{sorted}</b></span>
        <span>Sisa: <b className="text-[var(--text-1)]">{remaining}</b></span>
        <span>Total: <b className="text-[var(--text-1)]">{total}</b></span>
        <span className="ml-auto font-mono">{pct}%</span>
      </div>
      <div className="progress-track h-1.5"><div className="progress-fill" style={{width:`${pct}%`}} /></div>
    </div>
  );
}

export function ExifPanel({ filePath }) {
  const [exif, setExif] = useState(null);
  const [loading, setLoading] = useState(false);
  const prev = useRef(null);
  useEffect(()=>{
    if(!filePath||filePath===prev.current) return;
    prev.current=filePath; setExif(null); setLoading(true);
    window.api?.getExif(filePath).then(d=>{setExif(d);setLoading(false);});
  },[filePath]);
  if (!filePath) return null;
  const badge = getFormatBadge(filePath);
  const rows = exif?[
    exif.model&&{label:'Kamera',value:`${exif.make||''} ${exif.model}`.trim()},
    exif.date&&{label:'Tanggal',value:exif.date},
    exif.shutter&&{label:'Shutter',value:exif.shutter},
    exif.aperture&&{label:'Aperture',value:exif.aperture},
    exif.iso&&{label:'ISO',value:exif.iso},
    exif.focalLength&&{label:'Focal',value:exif.focalLength},
    exif.width&&exif.height&&{label:'Resolusi',value:`${exif.width} × ${exif.height}`},
    exif.size&&{label:'Ukuran',value:fmtSize(exif.size)},
  ].filter(Boolean):[];
  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)]">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-medium text-[var(--text-3)] uppercase tracking-widest">📷 EXIF</p>
        {badge&&<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.color}`}>{badge.label}</span>}
      </div>
      {loading&&<div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]"><div className="w-3 h-3 border border-[var(--text-3)] border-t-transparent rounded-full animate-spin"/>Membaca…</div>}
      {!loading&&!rows.length&&<p className="text-xs text-[var(--text-3)]">Tidak ada data EXIF</p>}
      {!loading&&rows.length>0&&<div className="space-y-1">{rows.map(({label,value})=>(
        <div key={label} className="flex justify-between gap-2 text-[11px]">
          <span className="text-[var(--text-3)] flex-shrink-0">{label}</span>
          <span className="text-[var(--text-2)] text-right truncate">{value}</span>
        </div>
      ))}</div>}
    </div>
  );
}

export function DeleteConfirmModal({ count, category, onConfirm, onCancel }) {
  useEffect(()=>{ const h=e=>{if(e.key==='Enter')onConfirm();if(e.key==='Escape')onCancel();}; window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h); },[onConfirm,onCancel]);
  return (
    <div className="overlay-bg">
      <div className="panel p-6 max-w-sm w-full mx-4 border border-red-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-900/60 flex items-center justify-center text-red-400 text-xl">⚠</div>
          <div><h2 className="text-base font-semibold text-red-400">Pindah ke {category}?</h2><p className="text-xs text-[var(--text-3)]">{count} file</p></div>
        </div>
        <p className="text-sm text-[var(--text-2)] mb-5">Bisa di-undo dengan <span className="kbd">U</span>.</p>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={onCancel}>Batal <span className="kbd ml-1">Esc</span></button>
          <button className="btn btn-danger flex-1" onClick={onConfirm}>Pindah <span className="kbd ml-1 bg-red-900">Enter</span></button>
        </div>
      </div>
    </div>
  );
}

export function CategoryStats() {
  const { state } = useStore();
  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-[var(--text-3)] uppercase tracking-widest mb-2">Statistik</p>
      <div className="space-y-1">
        {Object.entries(state.mappings).map(([key,name])=>{
          const count=state.categoryStats[name]||0;
          return (<div key={key} className="flex items-center gap-2 text-xs"><span className="kbd">{key}</span><span className="flex-1 text-[var(--text-2)] truncate">{name}</span>{count>0&&<span className="text-[var(--amber)] font-mono font-medium">{count}</span>}</div>);
        })}
      </div>
    </div>
  );
}

export function ShortcutsOverlay() {
  const { dispatch } = useStore();
  const sc = [
    {keys:['→','D'],desc:'Berikutnya'},{keys:['←','A'],desc:'Sebelumnya'},
    {keys:['1'],desc:'→ [ Best Foto ]'},{keys:['2'],desc:'→ [ Need Edit ]'},{keys:['3'],desc:'→ [ Delete ]'},
    {keys:['4–9'],desc:'Folder kustom'},{keys:['Ctrl+1–5'],desc:'Rating bintang'},
    {keys:['W'],desc:'Flag Pick'},{keys:['Q'],desc:'Flag Reject'},
    {keys:['Ctrl+Z','U'],desc:'Undo'},{keys:['C'],desc:'Compare'},
    {keys:['F'],desc:'Fullscreen'},{keys:['?'],desc:'Shortcuts'},{keys:['Scroll'],desc:'Zoom foto'},
  ];
  return (
    <div className="overlay-bg" onClick={()=>dispatch({type:'TOGGLE_SHORTCUTS'})}>
      <div className="panel p-6 max-w-lg w-full mx-4" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">Shortcuts</h2>
          <button className="text-[var(--text-3)]" onClick={()=>dispatch({type:'TOGGLE_SHORTCUTS'})}>✕</button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5">
          {sc.map(({keys,desc})=>(
            <div key={desc} className="flex items-center gap-2 text-sm">
              <div className="flex gap-1">{keys.map(k=><span key={k} className="kbd">{k}</span>)}</div>
              <span className="text-[var(--text-2)]">{desc}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--text-3)] mb-2 font-medium">Format didukung:</p>
          <div className="flex flex-wrap gap-1">
            {['JPG','PNG','WEBP','GIF','CR2','CR3','NEF','ARW','DNG','RAF','ORF','RW2','HEIC','HEIF','TIFF','MP4','MOV','AVI','MKV','WEBM'].map(f=>(
              <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-500)] text-[var(--text-2)] font-mono">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExportModal() {
  const { state, dispatch } = useStore();
  const [format, setFormat] = useState('csv');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const run = async () => { setBusy(true); await window.api.exportLog(state.log,format); setBusy(false); setDone(true); setTimeout(()=>{setDone(false);dispatch({type:'TOGGLE_EXPORT'});},1200); };
  return (
    <div className="overlay-bg" onClick={()=>dispatch({type:'TOGGLE_EXPORT'})}>
      <div className="panel p-6 max-w-sm w-full mx-4" onClick={e=>e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">Export Log</h2>
        <div className="flex gap-3 mb-5">{['csv','json'].map(f=><button key={f} className={`btn flex-1 uppercase text-xs ${format===f?'btn-primary':'btn-ghost'}`} onClick={()=>setFormat(f)}>{f}</button>)}</div>
        <button className="btn btn-primary w-full" onClick={run} disabled={busy}>{done?'✓ Berhasil!':busy?'Menyimpan…':'Simpan File'}</button>
      </div>
    </div>
  );
}

export function PresetsModal() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const save = () => {
    if (!name.trim()) return;
    const p={id:Date.now().toString(),name:name.trim(),mappings:state.mappings,pattern:state.pattern,eventName:state.eventName};
    dispatch({type:'SAVE_PRESET',preset:p}); window.api.savePresets([...state.presets,p]); setName('');
  };
  return (
    <div className="overlay-bg" onClick={()=>dispatch({type:'TOGGLE_PRESETS'})}>
      <div className="panel p-6 max-w-md w-full mx-4" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h2 className="text-base font-semibold">Presets</h2><button className="text-[var(--text-3)]" onClick={()=>dispatch({type:'TOGGLE_PRESETS'})}>✕</button></div>
        <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
          {state.presets.map(p=>(
            <div key={p.id} className="flex items-center gap-2 p-2.5 rounded bg-[var(--bg-600)] border border-[var(--border)]">
              <div className="flex-1 min-w-0"><div className="text-sm font-medium">{p.name}</div><div className="text-xs text-[var(--text-3)] truncate">{Object.values(p.mappings).filter(Boolean).join(' · ')}</div></div>
              <button className="btn btn-ghost text-xs" onClick={()=>{dispatch({type:'LOAD_PRESET',preset:p});dispatch({type:'TOGGLE_PRESETS'});}}>Load</button>
              <button className="btn btn-danger text-xs" onClick={()=>{dispatch({type:'DELETE_PRESET',id:p.id});window.api.savePresets(state.presets.filter(x=>x.id!==p.id));}}>✕</button>
            </div>
          ))}
          {!state.presets.length&&<p className="text-sm text-[var(--text-3)] text-center py-4">Belum ada preset</p>}
        </div>
        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex gap-2">
            <input className="flex-1 bg-[var(--bg-600)] border border-[var(--border)] rounded px-3 py-1.5 text-sm outline-none focus:border-[var(--amber)]" placeholder="Nama preset…" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} />
            <button className="btn btn-primary" onClick={save}>Simpan</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DuplicatesModal() {
  const { state, dispatch } = useStore();
  return (
    <div className="overlay-bg" onClick={()=>dispatch({type:'TOGGLE_DUPLICATES'})}>
      <div className="panel p-6 max-w-2xl w-full mx-4" onClick={e=>e.stopPropagation()} style={{maxHeight:'80vh',overflowY:'auto'}}>
        <div className="flex items-center justify-between mb-5"><h2 className="text-base font-semibold">Deteksi Duplikat</h2><button className="text-[var(--text-3)]" onClick={()=>dispatch({type:'TOGGLE_DUPLICATES'})}>✕</button></div>
        {state.findingDuplicates&&<p className="text-sm text-center py-8">Memindai…</p>}
        {!state.findingDuplicates&&!state.duplicateGroups.length&&<p className="text-sm text-center py-8 text-[var(--text-2)]">Tidak ada duplikat.</p>}
        {!state.findingDuplicates&&state.duplicateGroups.length>0&&(
          <div className="space-y-4">
            {state.duplicateGroups.map((g,gi)=>(
              <div key={gi} className="p-3 rounded bg-[var(--bg-600)] border border-[var(--border)]">
                <p className="text-xs text-[var(--text-3)] mb-2">Grup {gi+1}</p>
                <div className="flex gap-2 flex-wrap">
                  {g.map(img=>(
                    <div key={img} className="flex flex-col items-center gap-1">
                      {isVideoFile(img)||isRawFormat(img)?<div className={`w-20 h-20 rounded flex items-center justify-center text-2xl ${isVideoFile(img)?'bg-purple-900/40 text-purple-400':'bg-orange-900/40 text-orange-400'}`}>{isVideoFile(img)?'▶':'⬛'}</div>
                        :<img src={toFileUrl(img)} alt="" className="w-20 h-20 object-cover rounded border border-[var(--border)]"/>}
                      <span className="text-[10px] text-[var(--text-3)] w-20 truncate text-center">{basename(img)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityLog() {
  const { state } = useStore();
  return (
    <div className="flex-1 overflow-y-auto">
      <p className="text-xs font-medium text-[var(--text-3)] uppercase tracking-widest mb-2">Aktivitas</p>
      <div className="space-y-1.5">
        {state.log.slice(0,60).map((e,i)=>(
          <div key={i} className="p-2 rounded bg-[var(--bg-600)] border border-[var(--border)] text-xs">
            <div className="text-[var(--text-3)] font-mono">{e.time}</div>
            {e.type==='undo'?<div className="text-yellow-400 mt-0.5">↩ Undo</div>:<><div className="text-[var(--text-2)] mt-0.5 truncate">{basename(e.from)}</div><div className="text-[var(--amber)] truncate">→ {e.category}</div></>}
          </div>
        ))}
        {!state.log.length&&<p className="text-xs text-[var(--text-3)] text-center py-4">Belum ada aktivitas</p>}
      </div>
    </div>
  );
}

export function FilterBar() {
  const { state, dispatch } = useStore();
  return (
    <div className="flex gap-1">
      {[{key:'all',label:'Semua'},{key:'unrated',label:'Unrated'},{key:'picks',label:'Pick'},{key:'rejects',label:'Reject'}].map(f=>(
        <button key={f.key} className={`text-xs px-2 py-1 rounded transition-colors ${state.filter===f.key?'bg-[var(--amber)] text-black font-medium':'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-500)]'}`} onClick={()=>dispatch({type:'SET_FILTER',filter:f.key})}>{f.label}</button>
      ))}
    </div>
  );
}

export function CompareMode({ onPickBest }) {
  const { state, dispatch } = useStore();
  const [best, setBest] = useState(null);
  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-900)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] flex-shrink-0">
        <span className="text-sm font-medium text-[var(--amber)]">Compare Mode</span>
        <button className="btn btn-ghost text-xs" onClick={()=>dispatch({type:'EXIT_COMPARE'})}>✕ Keluar</button>
      </div>
      <div className="flex-1 flex gap-2 p-3 overflow-hidden min-h-0">
        {state.compareImages.map(img=>{
          const isBest=best===img;
          const { url } = useMediaUrl(img);
          return (
            <div key={img} className={`compare-pane flex flex-col overflow-hidden ${isBest?'best':''}`} onClick={()=>{setBest(img);onPickBest?.(img);}}>
              <div className="flex-1 min-h-0 flex items-center justify-center bg-[var(--bg-800)] rounded overflow-hidden relative">
                {isVideoFile(img)?<div className="text-5xl text-purple-400">▶</div>:url&&<img src={url} alt="" className="max-h-full max-w-full object-contain" draggable={false}/>}
                {isBest&&<div className="absolute top-2 left-2 bg-[var(--amber)] text-black text-xs font-bold px-2 py-0.5 rounded">★ BEST</div>}
              </div>
              <div className="text-center text-xs text-[var(--text-3)] py-1 truncate">{basename(img)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
