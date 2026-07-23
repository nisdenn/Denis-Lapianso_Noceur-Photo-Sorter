import { useEffect, useCallback } from 'react';
import { useStore, useCurrentImage } from '../store';

export default function useKeyboard({ onSort, onUndo }) {
  const { state, dispatch } = useStore();
  const currentImage = useCurrentImage(state);

  const handleKey = useCallback(async (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    if (key === 'Escape') {
      if (state.compareMode)    dispatch({ type:'EXIT_COMPARE' });
      if (state.showShortcuts)  dispatch({ type:'TOGGLE_SHORTCUTS' });
      if (state.showExport)     dispatch({ type:'TOGGLE_EXPORT' });
      if (state.showPresets)    dispatch({ type:'TOGGLE_PRESETS' });
      if (state.showDuplicates) dispatch({ type:'TOGGLE_DUPLICATES' });
      return;
    }
    if (key === '?') { dispatch({ type:'TOGGLE_SHORTCUTS' }); return; }
    if ((key==='f'||key==='F') && !ctrl) { const n=!state.fullscreen; dispatch({ type:'TOGGLE_FULLSCREEN' }); window.api?.setFullscreen(n); return; }
    if ((key==='c'||key==='C') && !ctrl) {
      if (state.compareMode) dispatch({ type:'EXIT_COMPARE' });
      else if (state.images.length > 1) dispatch({ type:'ENTER_COMPARE' });
      return;
    }
    if ((ctrl && key.toLowerCase()==='z') || (!ctrl && key.toLowerCase()==='u')) { e.preventDefault(); onUndo?.(); return; }
    if (!state.images.length) return;
    if (key==='ArrowRight'||key==='d'||key==='D') { dispatch({ type:'NEXT' }); return; }
    if (key==='ArrowLeft' ||key==='a'||key==='A') { dispatch({ type:'PREV' }); return; }
    if (ctrl && key>='1' && key<='5' && currentImage) { e.preventDefault(); dispatch({ type:'SET_RATING', filePath:currentImage, stars:parseInt(key) }); return; }
    if (ctrl && key==='0' && currentImage) { e.preventDefault(); dispatch({ type:'SET_RATING', filePath:currentImage, stars:0 }); return; }
    if ((key==='w'||key==='W'||key===' ') && !ctrl && currentImage) { e.preventDefault(); const cur=state.ratings[currentImage]?.flag; dispatch({ type:'SET_FLAG', filePath:currentImage, flag:cur==='pick'?'none':'pick' }); return; }
    if ((key==='q'||key==='Q'||key==='Delete'||key==='Backspace') && !ctrl && currentImage) { e.preventDefault(); const cur=state.ratings[currentImage]?.flag; dispatch({ type:'SET_FLAG', filePath:currentImage, flag:cur==='reject'?'none':'reject' }); return; }
    if (!ctrl && key>='1' && key<='9' && currentImage) {
      const category = state.mappings[key];
      if (category) onSort?.(state.compareMode ? state.compareImages : [currentImage], key, category);
      return;
    }
    if (!ctrl && key==='0' && currentImage) {
      const category = state.mappings['0'];
      if (category) onSort?.([currentImage], '0', category);
    }
  }, [state, dispatch, currentImage, onSort, onUndo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);
}
