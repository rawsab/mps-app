import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { nutritionGridEditable, nutritionGridRange, nutritionGridText, nutritionPasteEdits, nutritionRangeEdits, NUTRITION_GRID_COLUMNS } from '@/domain/nutritionGrid';
import { planNutritionCells, type NutritionCellEdit, type NutritionColumn, type NutritionProgramSnapshot, type NutritionWeek } from '@/domain/nutritionProgram';
import { useGridDragSelection, type GridPoint } from '@/features/programs/useGridDragSelection';
import { nutritionError } from './api';
import { useSaveNutritionCells, type SheetEntry } from './programApi';

type History = {before:NutritionCellEdit[];after:NutritionCellEdit[]};
type Editing = GridPoint & {text:string;select:boolean};
export function useNutritionGrid(week:NutritionWeek,snapshot:NutritionProgramSnapshot,table:RefObject<HTMLTableElement|null>,onDirty:(week:number,dirty:boolean)=>void) {
  const initial={exerciseId:week.from,column:1};
  const [active,setActive]=useState<GridPoint>(initial),[anchor,setAnchor]=useState<GridPoint>(initial);
  const [focused,setFocused]=useState(false),[editing,setEditing]=useState<Editing|null>(null);
  const editRef=useRef<Editing|null>(null);
  const [buffers,setBuffers]=useState<Record<string,string>>({});
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [undo,setUndo]=useState<History[]>([]),[redo,setRedo]=useState<History[]>([]);
  const [paste,setPaste]=useState<NutritionCellEdit[]|null>(null);
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  const save=useSaveNutritionCells(snapshot.id,snapshot.revision.id);
  const pending=useRef(false);
  const retry=useRef<{rows:SheetEntry[];edits:NutritionCellEdit[];history:History;action:'edit'|'undo'|'redo'}|null>(null);
  const dirty=Object.keys(buffers).length>0 || save.isPending;
  useEffect(()=>{onDirty(week.index,dirty);return()=>onDirty(week.index,false);},[dirty,week.index,onDirty]);
  const key=(date:string,column:NutritionColumn)=>`${date}:${column}`;
  const pointFor=(edit:NutritionCellEdit)=>({exerciseId:edit.date,column:NUTRITION_GRID_COLUMNS.indexOf(edit.column)});
  const text=(point:GridPoint)=>buffers[`${point.exerciseId}:${NUTRITION_GRID_COLUMNS[point.column]}`] ?? nutritionGridText(week,point);
  const range=nutritionGridRange(week,anchor,active);
  const canWrite=snapshot.can_log && !save.isPending;
  function focus(point:GridPoint,extend=false) {
    setActive(point);if(!extend)setAnchor(point);
    const cell=table.current?.querySelector<HTMLElement>(`[data-grid-exercise="${point.exerciseId}"] [data-grid-column-index="${point.column}"]`);
    cell?.focus({preventScroll:true});cell?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function clearBuffers(edits:NutritionCellEdit[]) {
    const keys=new Set(edits.map((e)=>key(e.date,e.column)));
    setBuffers((old)=>Object.fromEntries(Object.entries(old).filter(([k])=>!keys.has(k))));
  }
  function perform(request:NonNullable<typeof retry.current>) {
    pending.current=true;retry.current=request;
    save.mutate(request.rows,{onSuccess:()=>{
      clearBuffers(request.edits);retry.current=null;setError('');setMessage('All changes saved');
      if(request.action==='edit'){setUndo((old)=>[...old,request.history]);setRedo([]);}
      else if(request.action==='undo'){setUndo((old)=>old.slice(0,-1));setRedo((old)=>[...old,request.history]);}
      else {setRedo((old)=>old.slice(0,-1));setUndo((old)=>[...old,request.history]);}
    },onError:(e)=>setError(nutritionError(e)),onSettled:()=>{pending.current=false;}});
  }
  function commit(edits:NutritionCellEdit[],action:'edit'|'undo'|'redo'='edit',history?:History) {
    if(pending.current || !snapshot.can_log || !edits.length)return;
    setError('');
    try {
      const changed=edits.filter((e)=>{
        const old=nutritionGridText(week,pointFor(e));
        return e.text.trim()==='' ? old!=='' : old==='' || Number(e.text)!==Number(old);
      });
      const plans=planNutritionCells([week],changed,snapshot.today);
      if(!plans.length){clearBuffers(edits);return;}
      const record=history ?? {before:changed.map((e)=>({...e,text:nutritionGridText(week,pointFor(e))})),after:changed};
      perform({rows:plans.map((p)=>({...p,request_id:crypto.randomUUID()})),edits,history:record,action});
    }catch(e){setError((e as Error).message);}
  }
  function finishEdit(discard=false) {
    const edit=editRef.current;if(!edit)return;
    editRef.current=null;setEditing(null);
    const column=NUTRITION_GRID_COLUMNS[edit.column] as NutritionColumn;
    if(discard){clearBuffers([{date:edit.exerciseId,column,text:''}]);setError('');return;}
    const related=column==='weight'?['weight'] as const:['intake','output'] as const;
    const edits=related.filter((c)=>c===column || buffers[key(edit.exerciseId,c)]!==undefined).map((c)=>({date:edit.exerciseId,column:c,text:c===column?edit.text:buffers[key(edit.exerciseId,c)]!}));
    commit(edits);
  }
  function beginEdit(point:GridPoint,replacement?:string) {
    if(!canWrite || pending.current || !nutritionGridEditable(point,snapshot.today))return;
    const edit={...point,text:replacement ?? text(point),select:replacement===undefined};
    setActive(point);setAnchor(point);editRef.current=edit;setEditing(edit);
    if(replacement!==undefined)setBuffers((old)=>({...old,[`${point.exerciseId}:${NUTRITION_GRID_COLUMNS[point.column]}`]:replacement}));
  }
  const drag=useGridDragSelection(table,(start,end)=>{setAnchor(start);setActive(end);},()=>finishEdit());
  function navigate(e:KeyboardEvent,point:GridPoint) {
    let r=week.rows.findIndex((row)=>row.date===point.exerciseId),c=point.column;
    switch(e.key){
      case 'ArrowUp':r--;break;case 'ArrowDown':r++;break;case 'ArrowLeft':c--;break;case 'ArrowRight':c++;break;
      case 'Enter':r+=e.shiftKey?-1:1;break;
      case 'Tab':{const next=r*6+c+(e.shiftKey?-1:1);if(next<0 || next>=42)return;r=Math.floor(next/6);c=next%6;break;}
      case 'Home':c=0;if(e.ctrlKey||e.metaKey)r=0;break;case 'End':c=5;if(e.ctrlKey||e.metaKey)r=6;break;
      default:return;
    }
    e.preventDefault();focus({exerciseId:week.rows[Math.max(0,Math.min(6,r))]!.date,column:Math.max(0,Math.min(5,c))},e.shiftKey && e.key!=='Tab' && e.key!=='Enter');
  }
  function clear() {
    if(!canWrite || pending.current)return;
    const edits=nutritionRangeEdits(week,anchor,active,snapshot.today);
    if(!edits.length){setMessage('Selected cells are calculated or read-only.');return;}
    setBuffers((old)=>({...old,...Object.fromEntries(edits.map((e)=>[key(e.date,e.column),'']))}));
    commit(edits);
  }
  function historyAction(action:'undo'|'redo') {
    if(!canWrite || pending.current || editing || Object.keys(buffers).length)return;
    const entry=(action==='undo'?undo:redo).at(-1);if(!entry)return;
    const expected=action==='undo'?entry.after:entry.before;
    if(expected.some((e)=>{const now=nutritionGridText(week,pointFor(e));return e.text===''?now!=='':Number(e.text)!==Number(now);})){setError('These cells changed elsewhere. Reload them before using Undo or Redo.');return;}
    commit(action==='undo'?entry.before:entry.after,action,entry);
  }
  function pasteText(raw:string,start:GridPoint={exerciseId:week.rows[range.top]!.date,column:range.left}) {
    if(!canWrite || pending.current)return;
    try{const edits=nutritionPasteEdits(week,start,raw,snapshot.today);planNutritionCells([week],edits,snapshot.today);if(!edits.length){setMessage('Selected cells are calculated or read-only.');return;}setPaste(edits);setError('');}
    catch(e){setError((e as Error).message);}
  }
  const clipboard=()=>week.rows.slice(range.top,range.bottom+1).map((row)=>Array.from({length:range.right-range.left+1},(_,c)=>text({exerciseId:row.date,column:range.left+c})).join('\t')).join('\n');
  function keyDown(e:KeyboardEvent,point:GridPoint) {
    if(e.nativeEvent.isComposing)return;
    if(editRef.current&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase()))return;
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();historyAction(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');return;}
    if(editRef.current){if(e.key==='Escape'){e.preventDefault();finishEdit(true);focus(point);}else if(e.key==='Enter'||e.key==='Tab'){finishEdit();navigate(e,point);}return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();setAnchor({exerciseId:week.from,column:0});setActive({exerciseId:week.through,column:5});return;}
    if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();setMenu({x:rect.left,y:rect.bottom});return;}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();clear();}
    else if(e.key==='Enter'||e.key==='F2'){e.preventDefault();beginEdit(point);}
    else if(e.key==='Escape'){clearBuffers([{date:point.exerciseId,column:NUTRITION_GRID_COLUMNS[point.column] as NutritionColumn,text:''}]);setAnchor(point);setError('');}
    else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();beginEdit(point,e.key);}
    else navigate(e,point);
  }
  async function menuAction(action:'copy'|'cut'|'paste'|'clear'|'undo'|'redo') {
    setMenu(null);focus(active);
    try{if(action==='copy'||action==='cut'){await navigator.clipboard.writeText(clipboard());if(action==='cut')clear();}
      else if(action==='paste')pasteText(await navigator.clipboard.readText());else if(action==='clear')clear();else historyAction(action);
    }catch{setError('Clipboard access is unavailable. Use the keyboard Copy or Paste shortcut.');}
  }
  return {active,anchor,focused,setFocused,editing,editRef,range,text,canWrite,save,error,message,dirty,drag,focus,beginEdit,finishEdit,keyDown,clear,clipboard,pasteText,paste,setPaste,menu,setMenu,menuAction,
    changeText(value:string){const edit=editRef.current;if(!edit)return;const next={...edit,text:value};editRef.current=next;setEditing(next);setBuffers((old)=>({...old,[`${edit.exerciseId}:${NUTRITION_GRID_COLUMNS[edit.column]}`]:value}));setError('');retry.current=null;},
    preparePaste(raw:string){const point=editRef.current?{exerciseId:editRef.current.exerciseId,column:editRef.current.column}:undefined;editRef.current=null;setEditing(null);pasteText(raw,point);},
    applyPaste(){if(!paste)return;setBuffers((old)=>({...old,...Object.fromEntries(paste.map((e)=>[key(e.date,e.column),e.text]))}));setPaste(null);commit(paste);},
    historyAction,canUndo:canWrite&&!dirty&&!editing&&undo.length>0,canRedo:canWrite&&!dirty&&!editing&&redo.length>0,
    retry(){if(retry.current)perform(retry.current);else commit(Object.entries(buffers).map(([k,value])=>({date:k.slice(0,10),column:k.slice(11) as NutritionColumn,text:value})));},
    discard(){editRef.current=null;setEditing(null);setBuffers({});setError('');retry.current=null;},
    hasBuffer(point:GridPoint){return buffers[`${point.exerciseId}:${NUTRITION_GRID_COLUMNS[point.column]}`]!==undefined;},
  };
}
