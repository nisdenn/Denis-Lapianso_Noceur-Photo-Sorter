import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StoreProvider, useStore, useCurrentImage, useImageRating } from './store';
import useKeyboard from './hooks/useKeyboard';
import logo from './assets/logo.png';
import { isRawFormat, getExt, toFileUrl } from './hooks/useMediaUrl';
import {
  StarRating, FlagBadge, ProgressBar, MediaViewer, Filmstrip,
  CompareMode, CategoryStats, ShortcutsOverlay, ExportModal,
  PresetsModal, DuplicatesModal, ActivityLog, FilterBar,
  ExifPanel, DeleteConfirmModal, isVideoFile,
} from './components';

const DELETE_KW = ['delete','hapus','trash','reject','buang','sampah'];
const isDeleteFolder = n => n ? DELETE_KW.some(k => n.toLowerCase().includes(k)) : false;
const fmtSize = b => b > 1e6 ? `${(b/1e6).toFixed(1)}MB` : `${(b/1e3).toFixed(0)}KB`;

function PreloadBar({ total, done }) {
  if (!total || done >= total) return null;
  const pct = Math.round((done/total)*100);
  return (
    <div className="flex items-center gap-2 text-[10px] text-[var(--text-3)] px-3 py-1 border-b border-[var(--border)] bg-[var(--bg-900)] flex-shrink-0">
      <div className="w-3 h-3 border border-[var(--amber)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
      <span>Pre-loading RAW/HEIC: {done}/{total} ({pct}%)</span>
      <div className="flex-1 h-0.5 bg-[var(--bg-500)] rounded overflow-hidden">
        <div className="h-full bg-[var(--amber)] transition-all duration-300" style={{ width:`${pct}%` }} />
      </div>
    </div>
  );
}

function Inner() {
  const { state, dispatch } = useStore();
  const currentImage = useCurrentImage(state);
  const rating       = useImageRating(state, currentImage);
  const [dragOver, setDragOver]           = useState(false);
  const [fileStats, setFileStats]         = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [preloadTotal, setPreloadTotal]   = useState(0);
  const [preloadDone, setPreloadDone]     = useState(0);
  const preloadCache = useRef(new Map());
  const saveTimer    = useRef(null);

  useEffect(() => {
    window.api?.loadPresets().then(p => dispatch({ type:'SET_PRESETS', presets:p }));
  }, []);

  useEffect(() => {
    window.api?.onPreviewReady(() => setPreloadDone(d => d+1));
    return () => window.api?.offPreviewReady();
  }, []);

  useEffect(() => {
    if (!state.rootFolder) return;
    window.api?.loadRatings(state.rootFolder).then(saved => {
      if (saved && Object.keys(saved).length) dispatch({ type:'LOAD_SAVED_RATINGS', ratings:saved });
    });
  }, [state.rootFolder]);

  useEffect(() => {
    if (!state.rootFolder || !Object.keys(state.ratings).length) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => window.api?.saveRatings(state.rootFolder, state.ratings), 800);
    return () => clearTimeout(saveTimer.current);
  }, [state.ratings, state.rootFolder]);

  useEffect(() => {
    state.images.slice(state.index+1, state.index+4).forEach(src => {
      if (!isVideoFile(src) && !isRawFormat(src) && !preloadCache.current.has(src)) {
        const img = new Image(); img.src = toFileUrl(src);
        preloadCache.current.set(src, img);
      }
    });
    const keys = [...preloadCache.current.keys()];
    if (keys.length > 12) keys.slice(0, keys.length-12).forEach(k => preloadCache.current.delete(k));
  }, [state.index, state.images]);

  useEffect(() => {
    setFileStats(null);
    if (currentImage) window.api?.getFileStats(currentImage).then(setFileStats);
  }, [currentImage]);

  const loadFolder = useCallback(async folder => {
    await window.api?.cancelPreload();
    setPreloadTotal(0); setPreloadDone(0);
    const list = await window.api.listImages(folder);
    if (!list.length) return;
    dispatch({ type:'LOAD_IMAGES', folder, images:list });
    const rawFiles = list.filter(p => isRawFormat(p));
    if (rawFiles.length) {
      setPreloadTotal(rawFiles.length);
      window.api.startPreload(list);
    }
  }, [dispatch]);

  const executeSort = useCallback(async (filePaths, key, category) => {
    if (!state.rootFolder) return;
    await window.api.ensureFolders(state.rootFolder, state.mappings);
    const sep = state.rootFolder.includes('/') ? '/' : '\\';
    const destDir = `${state.rootFolder}${sep}${category}`;
    for (const fp of filePaths) {
      const res = await window.api.moveAndRename(fp, destDir,
        state.pattern.replace('{event}', state.eventName).replace('{category}', category));
      if (res?.success) dispatch({ type:'SORT_IMAGE', filePath:fp, destPath:res.destPath, category });
    }
    setDeleteConfirm(null);
  }, [state.rootFolder, state.mappings, state.pattern, state.eventName, dispatch]);

  const handleSort = useCallback(async (filePaths, key, category) => {
    if (isDeleteFolder(category)) { setDeleteConfirm({ filePaths, key, category }); return; }
    executeSort(filePaths, key, category);
  }, [executeSort]);

  const handleUndo = useCallback(async () => {
    const res = await window.api?.undoMove();
    if (res?.restoredPath) dispatch({ type:'UNDO_RESTORE', filePath:res.restoredPath, category:res.category });
  }, [dispatch]);

  useKeyboard({ onSort: handleSort, onUndo: handleUndo });

  const onDrop = async e => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.path) await loadFolder(file.path);
  };

  const pickFolder = async () => {
    const folder = await window.api.pickFolder();
    if (folder) await loadFolder(folder);
  };

  const batchSort = key => {
    const targets = state.selected.length ? state.selected : [currentImage].filter(Boolean);
    const category = state.mappings[key];
    if (category && targets.length) handleSort(targets, key, category);
  };

  const isVid = isVideoFile(currentImage);

  return (
    <div className={`h-screen flex flex-col bg-[var(--bg-800)] select-none ${dragOver?'ring-2 ring-inset ring-[var(--amber)]':''}`}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}>

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-900)] flex-shrink-0 z-10">
        <div className="flex items-center gap-2.5 mr-3">
          <img src={logo} alt="Noceur" className="w-8 h-8 rounded object-cover" />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-white" style={{fontFamily:'Georgia,serif',letterSpacing:'0.05em'}}>NOCEUR</span>
            <span className="text-[10px] text-[var(--amber)] tracking-widest uppercase font-medium">Sorter</span>
          </div>
        </div>
        {state.allImages.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-[var(--bg-500)] text-[var(--text-2)]">📷 {state.allImages.filter(f=>!isVideoFile(f)&&!isRawFormat(f)).length} foto</span>
            {state.allImages.filter(f=>isRawFormat(f)).length > 0 && <span className="px-2 py-0.5 rounded bg-orange-900/50 text-orange-300">⬛ {state.allImages.filter(f=>isRawFormat(f)).length} RAW</span>}
            {state.allImages.filter(f=>isVideoFile(f)).length > 0 && <span className="px-2 py-0.5 rounded bg-purple-900/50 text-purple-300">🎬 {state.allImages.filter(f=>isVideoFile(f)).length} video</span>}
          </div>
        )}
        <div className="flex-1 text-xs font-mono text-[var(--text-3)] truncate">{state.rootFolder||'Drop folder atau klik Buka Folder →'}</div>
        <FilterBar />
        <div className="w-px h-4 bg-[var(--border)]" />
        {state.rootFolder && <button className="btn btn-ghost text-xs" onClick={async()=>{dispatch({type:'FINDING_DUPLICATES'});dispatch({type:'TOGGLE_DUPLICATES'});const g=await window.api.findDuplicates(state.rootFolder);dispatch({type:'SET_DUPLICATES',groups:g});}}>Duplikat</button>}
        <button className="btn btn-ghost text-xs" onClick={()=>dispatch({type:'TOGGLE_PRESETS'})}>Preset</button>
        <button className="btn btn-ghost text-xs" onClick={()=>dispatch({type:'TOGGLE_EXPORT'})} disabled={!state.log.length}>Export</button>
        <button className="btn btn-ghost text-xs" onClick={handleUndo}>↩ Undo</button>
        <button className="btn btn-primary text-xs" onClick={pickFolder}>Buka Folder</button>
        <button className="btn btn-ghost text-xs" onClick={()=>dispatch({type:'TOGGLE_SHORTCUTS'})}>?</button>
      </header>

      <PreloadBar total={preloadTotal} done={preloadDone} />
      {state.allImages.length > 0 && <ProgressBar />}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        {state.sidebarOpen && (
          <aside className="w-56 flex flex-col border-r border-[var(--border)] bg-[var(--bg-700)] flex-shrink-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <label className="text-xs text-[var(--text-3)] uppercase tracking-widest">Nama Event</label>
                <input className="mt-1 w-full bg-[var(--bg-600)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--amber)]"
                  value={state.eventName} onChange={e=>dispatch({type:'SET_EVENT_NAME',eventName:e.target.value})} />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-3)] uppercase tracking-widest mb-2">Folder Tujuan</p>
                <div className="space-y-1.5">
                  {['1','2','3','4','5','6','7','8','9','0'].map(k=>(
                    <div key={k} className="flex items-center gap-2">
                      <span className={`kbd ${isDeleteFolder(state.mappings[k])?'border-red-700 text-red-400':''}`}>{k}</span>
                      <input className={`flex-1 bg-[var(--bg-600)] border rounded px-2 py-1 text-xs outline-none focus:border-[var(--amber)] ${isDeleteFolder(state.mappings[k])?'border-red-800 text-red-400':'border-[var(--border)]'}`}
                        value={state.mappings[k]||''} placeholder="Nama folder…"
                        onChange={e=>dispatch({type:'SET_MAPPINGS',mappings:{...state.mappings,[k]:e.target.value}})} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-3)] uppercase tracking-widest">Pola Rename</label>
                <input className="mt-1 w-full bg-[var(--bg-600)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--amber)]"
                  value={state.pattern} onChange={e=>dispatch({type:'SET_PATTERN',pattern:e.target.value})} />
                <p className="text-[10px] text-[var(--text-3)] mt-1">Token: <code className="text-[var(--amber)]">{'{event} {category} {counter}'}</code></p>
              </div>
              <CategoryStats />
              {currentImage && <ExifPanel filePath={currentImage} />}
            </div>
          </aside>
        )}

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {state.compareMode ? (
            <CompareMode onPickBest={img=>{dispatch({type:'SET_INDEX',index:state.images.indexOf(img)});dispatch({type:'EXIT_COMPARE'});}} />
          ) : (
            <>
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {currentImage ? <MediaViewer src={currentImage} /> : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
                    <img src={logo} alt="Noceur" className="w-24 h-24 rounded-xl object-cover opacity-30" />
                    <div>
                      <p className="text-[var(--text-2)] font-medium text-lg" style={{fontFamily:'Georgia,serif',letterSpacing:'0.1em'}}>NOCEUR SORTER</p>
                      <p className="text-[var(--text-3)] text-sm mt-1">Buka folder atau drop di sini</p>
                      <p className="text-[var(--text-3)] text-xs mt-0.5">JPG · PNG · CR2 · NEF · ARW · HEIC · MP4 · dll</p>
                    </div>
                    <button className="btn btn-primary" onClick={pickFolder}>Buka Folder</button>
                  </div>
                )}
              </div>

              {currentImage && (
                <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-800)] flex-shrink-0 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isVid && <span className="text-xs font-bold text-purple-400 bg-purple-900/40 px-1.5 py-0.5 rounded">VIDEO</span>}
                    {!isVid && isRawFormat(currentImage) && <span className="text-xs font-bold text-orange-400 bg-orange-900/40 px-1.5 py-0.5 rounded">{getExt(currentImage).replace('.','').toUpperCase()}</span>}
                    {!isVid && !isRawFormat(currentImage) && <span className="text-xs font-bold text-blue-400 bg-blue-900/40 px-1.5 py-0.5 rounded">FOTO</span>}
                    <p className="text-xs font-mono text-[var(--text-1)] truncate">{currentImage.replace(/\\/g,'/').split('/').pop()}</p>
                    {fileStats && <p className="text-[10px] text-[var(--text-3)] font-mono flex-shrink-0">{fmtSize(fileStats.size)}</p>}
                  </div>
                  {!isVid && <StarRating filePath={currentImage} />}
                  <FlagBadge flag={rating.flag} onClick={()=>dispatch({type:'SET_FLAG',filePath:currentImage,flag:'none'})} />
                  {(!rating.flag||rating.flag==='none') && (
                    <div className="flex gap-1">
                      <button className="btn text-xs flag-pick"   onClick={()=>dispatch({type:'SET_FLAG',filePath:currentImage,flag:'pick'})}>✓ W</button>
                      <button className="btn text-xs flag-reject" onClick={()=>dispatch({type:'SET_FLAG',filePath:currentImage,flag:'reject'})}>✗ Q</button>
                    </div>
                  )}
                  {state.selected.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded bg-[var(--select)]/20 border border-[var(--select)]/40">
                      <span className="text-xs text-blue-300">{state.selected.length} dipilih</span>
                      <button className="text-[10px] text-blue-300 hover:text-white" onClick={()=>dispatch({type:'CLEAR_SELECTED'})}>✕</button>
                    </div>
                  )}
                  <button className="btn btn-ghost text-xs" onClick={()=>state.images.length>1&&dispatch({type:'ENTER_COMPARE'})}>⊞ Compare</button>
                  <button className="btn btn-ghost text-xs" onClick={()=>dispatch({type:'TOGGLE_SIDEBAR'})}>⊟ Panel</button>
                </div>
              )}

              {currentImage && (
                <div className="flex gap-1 px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-900)] flex-shrink-0 flex-wrap">
                  {Object.entries(state.mappings).filter(([,v])=>v).map(([key,name])=>(
                    <button key={key} className={`flex items-center gap-1.5 btn text-xs ${isDeleteFolder(name)?'btn-danger':'btn-ghost'}`} onClick={()=>batchSort(key)}>
                      <span className="kbd" style={isDeleteFolder(name)?{background:'#7f1d1d',borderColor:'#991b1b'}:{}}>{key}</span>
                      <span className="truncate max-w-32">{name}</span>
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button className="btn btn-ghost text-xs" onClick={()=>dispatch({type:'PREV'})}>← Prev</button>
                  <button className="btn btn-ghost text-xs" onClick={()=>dispatch({type:'NEXT'})}>Next →</button>
                </div>
              )}
            </>
          )}
          <Filmstrip />
        </main>

        {state.log.length > 0 && (
          <aside className="w-52 border-l border-[var(--border)] bg-[var(--bg-700)] p-3 overflow-hidden flex flex-col flex-shrink-0">
            <ActivityLog />
          </aside>
        )}
      </div>

      {state.showShortcuts  && <ShortcutsOverlay />}
      {state.showExport     && <ExportModal />}
      {state.showPresets    && <PresetsModal />}
      {state.showDuplicates && <DuplicatesModal />}
      {deleteConfirm && (
        <DeleteConfirmModal count={deleteConfirm.filePaths.length} category={deleteConfirm.category}
          onConfirm={()=>executeSort(deleteConfirm.filePaths,deleteConfirm.key,deleteConfirm.category)}
          onCancel={()=>setDeleteConfirm(null)} />
      )}
      {dragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="panel p-10 text-center"><p className="text-3xl mb-2">📁</p><p className="text-[var(--amber)] font-semibold">Drop folder foto/video</p></div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <StoreProvider><Inner /></StoreProvider>;
}
