import { describe,expect,it } from 'vitest';
import { nutritionGridLabels,nutritionGridCoachEdited,nutritionGridMissing,nutritionGridText,nutritionPasteEdits,nutritionRangeEdits } from '@/domain/nutritionGrid';
import { nutritionTotals,nutritionWeeks,planNutritionCells,type NutritionProgramDraft } from '@/domain/nutritionProgram';
import { type WeighIn } from '@/domain/nutrition';

const draft:NutritionProgramDraft={program_style:'Bulk',start_date:'2026-11-01',weight_unit:'lb',week_count:1,maintenance:2500,calorie_goal:2700,notes:''};
const metadata={version:1,updated_at:'2026-11-01T12:00:00Z',updated_by_staff:false};
const weights:WeighIn[]=[200,201,202].map((weight,i)=>({...metadata,weight,unit:'lb',measured_on:`2026-11-0${i+1}`}));
const week=nutritionWeeks(draft,weights,[{...metadata,activity_on:'2026-10-31',intake:2200,output:2500,notes:''}],'2026-11-03')[0]!;
describe('nutrition grid selection and protected cells',()=>{
  it('warns only for missing weight or calorie entries through today', () => {
    const today = '2026-11-03';
    expect(nutritionGridMissing({ exerciseId: today, column: 1 }, today, '')).toBe(true);
    expect(nutritionGridMissing({ exerciseId: '2026-11-02', column: 3 }, today, '')).toBe(true);
    expect(nutritionGridMissing({ exerciseId: '2026-11-04', column: 1 }, today, '')).toBe(false);
    expect(nutritionGridMissing({ exerciseId: today, column: 4 }, today, '')).toBe(false);
    expect(nutritionGridMissing({ exerciseId: today, column: 5 }, today, '')).toBe(false);
    expect(nutritionGridMissing({ exerciseId: today, column: 2 }, today, '0')).toBe(false);
  });
  it('marks only the fields actually edited by a coach, preserving explicit client attribution',()=>{
    const attributed={...week,rows:week.rows.map((row,i)=>i===0?{...row,weight:{...row.weight!,updated_by_staff:true},entry:{...row.entry!,updated_by_staff:false,intake_updated_by_staff:true,output_updated_by_staff:false}}:row)};
    expect(nutritionGridCoachEdited(attributed,{exerciseId:week.from,column:1})).toBe(true);
    expect(nutritionGridCoachEdited(attributed,{exerciseId:week.from,column:2})).toBe(true);
    expect(nutritionGridCoachEdited(attributed,{exerciseId:week.from,column:3})).toBe(false);
    expect(nutritionGridCoachEdited(attributed,{exerciseId:week.from,column:4})).toBe(false);
    expect(nutritionGridCoachEdited(attributed,{exerciseId:week.from,column:0})).toBe(false);
  });
  it('clears only input cells in a reversed rectangular selection, skipping dates, computed cells and future days',()=>{
    const edits=nutritionRangeEdits(week,{exerciseId:'2026-11-07',column:5},{exerciseId:'2026-11-01',column:0},'2026-11-03');
    expect(edits).toHaveLength(9);
    expect([...new Set(edits.map((e)=>e.column))]).toEqual(['weight','intake','output']);
    expect(edits.every((e)=>e.date<='2026-11-03'&&e.text==='')).toBe(true);
    expect(nutritionRangeEdits(week,{exerciseId:'2026-11-01',column:4},{exerciseId:'2026-11-03',column:5},'2026-11-03')).toEqual([]);
  });
  it('copies real zero/missing values distinctly and exposes computed values for copying',()=>{
    expect(nutritionGridText(week,{exerciseId:'2026-11-01',column:4})).toBe('-300');
    expect(nutritionGridText(week,{exerciseId:'2026-11-03',column:5})).toBe('201');
    expect(nutritionGridText(week,{exerciseId:'2026-11-04',column:1})).toBe('');
    const zero=nutritionWeeks(draft,weights,[{...metadata,activity_on:'2026-10-31',intake:0,output:2500,notes:''}],'2026-11-03')[0]!;
    expect(nutritionGridText(zero,{exerciseId:'2026-11-01',column:2})).toBe('0');
  });
  it('pastes raw input values while preserving date and calculated columns',()=>{
    const edits=nutritionPasteEdits(week,{exerciseId:'2026-11-01',column:0},'different date\t205\t0\t2500\t999\t999','2026-11-03');
    expect(edits).toEqual([{date:'2026-11-01',column:'weight',text:'205'},{date:'2026-11-01',column:'intake',text:'0'},{date:'2026-11-01',column:'output',text:'2500'}]);
    expect(()=>nutritionPasteEdits(week,{exerciseId:'2026-11-07',column:1},'1\n2','2026-11-07')).toThrow('fit within');
    expect(()=>nutritionPasteEdits(week,{exerciseId:'2026-11-04',column:1},'205','2026-11-03')).toThrow('Future');
  });
  it('plans an atomic clear with a null weight and keeps optimistic versions for undo/redo',()=>{
    const plan=planNutritionCells([week],nutritionRangeEdits(week,{exerciseId:'2026-11-01',column:0},{exerciseId:'2026-11-01',column:5},'2026-11-03'),'2026-11-03');
    expect(plan).toEqual([
      {row_date:'2026-11-01',kind:'weight',expected_version:1,value:{weight:null,unit:'lb'}},
      {row_date:'2026-11-01',kind:'nutrition',expected_version:1,value:{intake:null,output:null,notes:''}},
    ]);
    const cleared=nutritionWeeks(draft,[{...weights[0]!,weight:null,version:2}],[],'2026-11-03')[0]!;
    expect(planNutritionCells([cleared],[{date:'2026-11-01',column:'weight',text:'200'}],'2026-11-03')[0]).toMatchObject({expected_version:2,value:{weight:200,unit:'lb'}});
    expect(cleared.average).toEqual({count:0,average:null});
    expect(nutritionTotals([cleared]).actualChange).toBeNull();
  });
  it('does not use cleared weights as the week-one baseline or as zero measurements',()=>{
    const cleared=nutritionWeeks(draft,[{...weights[0]!,weight:null},...weights.slice(1),{...metadata,measured_on:'2026-11-04',weight:203,unit:'lb'}],[],'2026-11-04')[0]!;
    expect(cleared.average).toEqual({count:3,average:202});
    expect(cleared.change).toBe(1);
  });
});


it('edits, copies, clears and restores weights in the program unit', () => {
  const kgWeek=nutritionWeeks({...draft,weight_unit:'kg'},weights,[],'2026-11-03')[0]!;
  expect(nutritionGridLabels('kg')[1]).toBe('Weight (kg)');
  expect(Number(nutritionGridText(kgWeek,{exerciseId:week.from,column:1}))).toBeCloseTo(90.7185,4);
  const clear=planNutritionCells([kgWeek],[{date:week.from,column:'weight',text:''}],'2026-11-03');
  expect(clear[0]!.value).toEqual({weight:null,unit:'kg'});
  const undo=planNutritionCells([kgWeek],[{date:week.from,column:'weight',text:nutritionGridText(kgWeek,{exerciseId:week.from,column:1})}],'2026-11-03');
  expect(undo[0]!.value).toEqual({weight:90.7185,unit:'kg'});
});
