import React, { createContext, useContext, useReducer } from 'react';

export const initialState = {
  rootFolder:null, allImages:[], images:[], sortedPaths:[], index:0,
  mappings:{'1':'[ Best Foto ]','2':'[ Need Edit ]','3':'[ Delete ]'},
  pattern:'{counter}', eventName:'Project2025',
  ratings:{}, selected:[], compareMode:false, compareImages:[],
  fullscreen:false, showShortcuts:false, showExport:false, showPresets:false, showDuplicates:false,
  sidebarOpen:true, filter:'all', log:[], presets:[], duplicateGroups:[], findingDuplicates:false, categoryStats:{},
};

function getFiltered(all, sorted, ratings, filter) {
  const s = new Set(sorted);
  const u = all.filter(x => !s.has(x));
  if (filter==='picks')   return u.filter(x => ratings[x]?.flag==='pick');
  if (filter==='rejects') return u.filter(x => ratings[x]?.flag==='reject');
  if (filter==='unrated') return u.filter(x => { const r=ratings[x]; return !r||(!r.stars&&r.flag!=='pick'&&r.flag!=='reject'); });
  if (filter==='rated')   return u.filter(x => ratings[x]?.stars > 0);
  return u;
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_IMAGES': return { ...state, rootFolder:action.folder, allImages:action.images, images:action.images, sortedPaths:[], index:0, selected:[], compareMode:false, compareImages:[], log:[], categoryStats:{}, filter:'all' };
    case 'SET_INDEX':   return { ...state, index:Math.max(0,Math.min(action.index,state.images.length-1)) };
    case 'NEXT':        return { ...state, index:Math.min(state.index+1,state.images.length-1) };
    case 'PREV':        return { ...state, index:Math.max(state.index-1,0) };
    case 'SORT_IMAGE': {
      const sp = [...state.sortedPaths, action.filePath];
      const imgs = getFiltered(state.allImages, sp, state.ratings, state.filter);
      const cs = { ...state.categoryStats, [action.category]:(state.categoryStats[action.category]||0)+1 };
      return { ...state, sortedPaths:sp, images:imgs, index:Math.min(state.index,Math.max(0,imgs.length-1)), categoryStats:cs,
        log:[{ time:new Date().toLocaleTimeString(), type:'sort', from:action.filePath, to:action.destPath, category:action.category, stars:state.ratings[action.filePath]?.stars||0, flag:state.ratings[action.filePath]?.flag||'none' }, ...state.log],
        selected:state.selected.filter(s=>s!==action.filePath) };
    }
    case 'UNDO_RESTORE': {
      const sp = state.sortedPaths.filter(p=>p!==action.filePath);
      const imgs = getFiltered(state.allImages, sp, state.ratings, state.filter);
      const ri = imgs.indexOf(action.filePath);
      const cs = { ...state.categoryStats };
      if (action.category && cs[action.category]) cs[action.category] = Math.max(0,cs[action.category]-1);
      return { ...state, sortedPaths:sp, images:imgs, index:Math.max(0,Math.min(ri>=0?ri:state.index,imgs.length-1)), categoryStats:cs,
        log:[{ time:new Date().toLocaleTimeString(), type:'undo', filePath:action.filePath }, ...state.log] };
    }
    case 'SET_RATING': { const p=state.ratings[action.filePath]||{}; return { ...state, ratings:{ ...state.ratings, [action.filePath]:{ ...p, stars:action.stars } } }; }
    case 'SET_FLAG':   { const p=state.ratings[action.filePath]||{}; return { ...state, ratings:{ ...state.ratings, [action.filePath]:{ ...p, flag:action.flag } } }; }
    case 'LOAD_SAVED_RATINGS': return { ...state, ratings:{ ...action.ratings, ...state.ratings } };
    case 'SET_SELECTED':     return { ...state, selected:action.selected };
    case 'TOGGLE_SELECTED':  return { ...state, selected:state.selected.includes(action.filePath)?state.selected.filter(p=>p!==action.filePath):[...state.selected,action.filePath] };
    case 'SELECT_RANGE': {
      const ti = state.images.indexOf(action.filePath);
      if (ti<0) return state;
      const s=Math.min(state.index,ti), e=Math.max(state.index,ti);
      return { ...state, selected:[...new Set([...state.selected,...state.images.slice(s,e+1)])] };
    }
    case 'CLEAR_SELECTED': return { ...state, selected:[] };
    case 'ENTER_COMPARE':  return { ...state, compareMode:true, compareImages:state.images.slice(state.index,state.index+3).filter(Boolean) };
    case 'EXIT_COMPARE':   return { ...state, compareMode:false, compareImages:[] };
    case 'SET_FILTER': {
      const imgs = getFiltered(state.allImages, state.sortedPaths, state.ratings, action.filter);
      return { ...state, filter:action.filter, images:imgs, index:0 };
    }
    case 'TOGGLE_FULLSCREEN':   return { ...state, fullscreen:!state.fullscreen };
    case 'TOGGLE_SHORTCUTS':    return { ...state, showShortcuts:!state.showShortcuts };
    case 'TOGGLE_EXPORT':       return { ...state, showExport:!state.showExport };
    case 'TOGGLE_PRESETS':      return { ...state, showPresets:!state.showPresets };
    case 'TOGGLE_DUPLICATES':   return { ...state, showDuplicates:!state.showDuplicates };
    case 'TOGGLE_SIDEBAR':      return { ...state, sidebarOpen:!state.sidebarOpen };
    case 'SET_MAPPINGS':        return { ...state, mappings:action.mappings };
    case 'SET_PATTERN':         return { ...state, pattern:action.pattern };
    case 'SET_EVENT_NAME':      return { ...state, eventName:action.eventName };
    case 'SET_PRESETS':         return { ...state, presets:action.presets };
    case 'LOAD_PRESET':         return { ...state, mappings:action.preset.mappings, pattern:action.preset.pattern, eventName:action.preset.eventName };
    case 'SAVE_PRESET': {
      const ex = state.presets.findIndex(p=>p.name===action.preset.name);
      return { ...state, presets:ex>=0?state.presets.map((p,i)=>i===ex?action.preset:p):[...state.presets,action.preset] };
    }
    case 'DELETE_PRESET':      return { ...state, presets:state.presets.filter(p=>p.id!==action.id) };
    case 'SET_DUPLICATES':     return { ...state, duplicateGroups:action.groups, findingDuplicates:false };
    case 'FINDING_DUPLICATES': return { ...state, findingDuplicates:true };
    default: return state;
  }
}

const Ctx = createContext(null);
export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}
export function useStore() { return useContext(Ctx); }
export function useCurrentImage(s) { return s.images[s.index] || null; }
export function useImageRating(s, p) { return s.ratings[p] || { stars:0, flag:'none' }; }
export function useProgress(s) {
  const total=s.allImages.length, sorted=s.sortedPaths.length;
  return { total, sorted, remaining:total-sorted, pct:total>0?Math.round(sorted/total*100):0 };
}
