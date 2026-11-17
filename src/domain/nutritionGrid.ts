type GridPoint = { exerciseId: string; column: number };
import { convertWeight } from './nutrition';
import type { NutritionCellEdit, NutritionColumn, NutritionWeek } from './nutritionProgram';

export const NUTRITION_GRID_COLUMNS = ['date','weight','intake','output','balance','average'] as const;
export const NUTRITION_GRID_LABELS = ['Date','Weight (lbs)','Calories Consumed Day Before','Caloric Output Day Before','Daily Caloric Balance','Average Weight (lbs)'];
export function nutritionGridLabels(unit: 'lb' | 'kg') {
  return NUTRITION_GRID_LABELS.map((label) => label.replaceAll('lbs', unit));
}
export function nutritionGridText(week: NutritionWeek, point: GridPoint): string {
  const row=week.rows.find((r) => r.date===point.exerciseId);
  if (!row) return '';
  switch(NUTRITION_GRID_COLUMNS[point.column]) {
    case 'date': return row.date;
    case 'weight': return row.weight?.weight == null ? '' : String(Math.round(convertWeight(row.weight.weight,row.weight.unit,week.unit)*10000)/10000);
    case 'intake': return row.entry?.intake?.toString() ?? '';
    case 'output': return row.entry?.output?.toString() ?? '';
    case 'balance': return row.balance?.toString() ?? '';
    case 'average': return row.rolling.average?.toString() ?? '';
    default:return '';
  }
}
export function nutritionGridEditable(point: GridPoint,today: string): boolean {
  return point.column>=1 && point.column<=3 && point.exerciseId<=today;
}
export function nutritionGridMissing(point: GridPoint, today: string, value: string): boolean {
  return value.trim() === '' && nutritionGridEditable(point, today);
}
export function nutritionGridCoachEdited(week: NutritionWeek,point: GridPoint): boolean {
  const row=week.rows.find((r)=>r.date===point.exerciseId);
  if(!row)return false;
  if(point.column===1)return row.weight?.updated_by_staff ?? false;
  if(point.column===2)return row.entry?.intake_updated_by_staff ?? row.entry?.updated_by_staff ?? false;
  if(point.column===3)return row.entry?.output_updated_by_staff ?? row.entry?.updated_by_staff ?? false;
  return false;
}
export function nutritionGridRange(week: NutritionWeek,anchor: GridPoint,end: GridPoint) {
  const a=week.rows.findIndex((r) => r.date===anchor.exerciseId),b=week.rows.findIndex((r) => r.date===end.exerciseId);
  return {top:Math.max(0,Math.min(a,b)),bottom:Math.max(0,Math.max(a,b)),left:Math.min(anchor.column,end.column),right:Math.max(anchor.column,end.column)};
}
export function nutritionRangeEdits(week: NutritionWeek,anchor: GridPoint,end: GridPoint,today: string): NutritionCellEdit[] {
  const range=nutritionGridRange(week,anchor,end);
  return week.rows.slice(range.top,range.bottom+1).flatMap((row) => NUTRITION_GRID_COLUMNS.flatMap((column,c) =>
    c>=range.left && c<=range.right && nutritionGridEditable({exerciseId:row.date,column:c},today)
      ? [{date:row.date,column:column as NutritionColumn,text:''}] : []));
}
export function nutritionPasteEdits(week: NutritionWeek,start: GridPoint,raw: string,today: string): NutritionCellEdit[] {
  if(raw.length>10000) throw new Error('Paste is too large for this weekly spreadsheet.');
  const values=raw.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map((r) => r.split('\t'));
  const first=week.rows.findIndex((r) => r.date===start.exerciseId);
  if(first<0 || first+values.length>7 || values.some((r) => start.column+r.length>6)) throw new Error('Paste must fit within this week’s spreadsheet.');
  return values.flatMap((row,r) => row.flatMap((text,c) => {
    const date=week.rows[first+r]!.date,column=start.column+c;
    if(!nutritionGridEditable({exerciseId:date,column},today)) {
      if(column>=1 && column<=3 && text.trim()) throw new Error('Future dates are read-only.');
      return [];
    }
    return [{date,column:NUTRITION_GRID_COLUMNS[column] as NutritionColumn,text}];
  }));
}
