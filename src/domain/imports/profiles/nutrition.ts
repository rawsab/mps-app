import type { ImportAccumulator } from '../builder';
import type { NormalizedImport } from '../contract';
import { addDays, serialToIsoDate } from '../excel';
import { cellText, norm, type Cell, type Sheet, type Workbook } from '../xlsx';
import type { WeightUnit } from '../../measurements/load';
import { at, cellId, claimOwnershipAndMetadata, excludeLegacyFormulas, metadataValue, numeric, rowCells } from './common';

export const NUTRITION_PROFILE = { id: 'mps-nutrition', version: '0.1.0' } as const;

type Field = 'date' | 'weight' | 'averageWeight' | 'intake' | 'output' | 'balance';

/** Controlled heading synonyms (roadmap §10). "Day before" headings shift the activity date. */
const SYNONYMS: [Field, RegExp][] = [
  ['date', /^date$/],
  ['averageWeight', /^(average|avg\.?) (body ?)?weight$/],
  ['weight', /^(body ?)?weight$/],
  ['intake', /^calories (consumed )?(day before|day b4|previous day|yesterday)$|^calories consumed$|^intake$/],
  ['output', /^calori(c|e) output( day before| day b4| previous day)?$|^(estimated )?output$/],
  ['balance', /^(daily )?calori(c|e) balance$/],
];
const DAY_BEFORE = /(day before|day b4|previous day|yesterday)/i;

function fieldOf(cell: Cell): Field | null {
  const t = norm(cellText(cell));
  return SYNONYMS.find(([, re]) => re.test(t))?.[0] ?? null;
}

type HeaderRow = { sheet: Sheet; row: number; cols: Partial<Record<Field, Cell>> };

function headerRows(wb: Workbook): HeaderRow[] {
  const out: HeaderRow[] = [];
  for (const sheet of wb.sheets) {
    const rows = [...new Set(sheet.cells.map((c) => c.row))];
    for (const row of rows) {
      const cols: HeaderRow['cols'] = {};
      for (const c of rowCells(sheet, row)) {
        const f = fieldOf(c);
        if (f && !cols[f]) cols[f] = c;
      }
      if (cols.date && (cols.weight || cols.intake)) out.push({ sheet, row, cols });
    }
  }
  return out;
}

export function looksLikeNutrition(wb: Workbook): boolean {
  return headerRows(wb).some((h) => h.cols.intake || h.cols.output);
}

type NutritionResult = Pick<NormalizedImport, 'nutritionTargets'> & {
  bodyweights: NormalizedImport['history']['bodyweights'];
  nutritionLogs: NormalizedImport['history']['nutritionLogs'];
};

function weightUnitEvidence(wb: Workbook): { unit: WeightUnit; cell: Cell } | null {
  for (const sheet of wb.sheets) {
    for (const c of sheet.cells) {
      const t = cellText(c);
      if (/weight/i.test(t) && /\((lbs?|pounds)\)/i.test(t)) return { unit: 'lb', cell: c };
      if (/weight/i.test(t) && /\((kgs?|kilograms?)\)/i.test(t)) return { unit: 'kg', cell: c };
    }
  }
  return null;
}

export function parseNutrition(wb: Workbook, acc: ImportAccumulator): NutritionResult {
  const meta = claimOwnershipAndMetadata(wb, acc);
  const headers = headerRows(wb);
  const unitEvidence = weightUnitEvidence(wb);
  const result: NutritionResult = { nutritionTargets: [], bodyweights: [], nutritionLogs: [] };
  const balanceMismatches: string[] = [];
  const weekMeans: { label: string; app: number; coverage: number; source: Cell | undefined }[] = [];

  headers.forEach((header, i) => {
    const { sheet, cols } = header;
    Object.values(cols).forEach((c) => acc.map(cellId(c), 'heading', 'column-mapping'));
    const nextHeaderRow = headers[i + 1]?.sheet === sheet ? headers[i + 1]!.row : Number.POSITIVE_INFINITY;
    const dateCol = cols.date!.col;
    const intakeShift = cols.intake && DAY_BEFORE.test(cellText(cols.intake)) ? -1 : 0;
    const outputShift = cols.output && DAY_BEFORE.test(cellText(cols.output)) ? -1 : 0;
    const weekLabel = sheet.cells.find((c) => c.row > header.row && c.row < nextHeaderRow && c.col < dateCol && /^week\s*\d+$/i.test(cellText(c)));
    if (weekLabel) acc.map(cellId(weekLabel), 'heading', 'week-label');

    const weights: number[] = [];
    let lastAverageCell: Cell | undefined;
    const dateCells = sheet.cells.filter((c) => c.col === dateCol && c.row > header.row && c.row < nextHeaderRow && c.isDate);
    for (const dateCell of dateCells) {
      const measurementDate = serialToIsoDate(Number(dateCell.value), wb.date1904);
      if (!measurementDate) {
        acc.issue('RANGE_UNRECOGNIZED', 'blocking', `Date cell ${dateCell.ref} could not be converted.`, [cellId(dateCell)]);
        continue;
      }
      acc.map(cellId(dateCell), 'result', 'history.measurementDate');
      const r = dateCell.row;
      const weight = cols.weight ? at(sheet, r, cols.weight.col) : undefined;
      const intake = cols.intake ? at(sheet, r, cols.intake.col) : undefined;
      const output = cols.output ? at(sheet, r, cols.output.col) : undefined;
      const balance = cols.balance ? at(sheet, r, cols.balance.col) : undefined;
      const avg = cols.averageWeight ? at(sheet, r, cols.averageWeight.col) : undefined;

      if (weight && numeric(weight) !== null) {
        result.bodyweights.push({ sourceItemIds: [cellId(weight), cellId(dateCell)], measurementDate, value: numeric(weight)!, unit: unitEvidence?.unit ?? null });
        acc.map(cellId(weight), 'result', 'history.bodyweights');
        weights.push(numeric(weight)!);
      }
      const intakeVal = numeric(intake);
      const outputVal = numeric(output);
      if (intakeVal !== null || outputVal !== null) {
        // Weigh-in date and activity date are distinct: "calories day before" belongs to the previous day.
        const activityDate = addDays(measurementDate, intakeVal !== null ? intakeShift : outputShift);
        result.nutritionLogs.push({
          sourceItemIds: [intake, output, dateCell].filter((c): c is Cell => !!c).map(cellId),
          activityDate,
          intakeKcal: intakeVal,
          outputKcal: outputVal,
        });
        if (intake) acc.map(cellId(intake), 'result', 'history.nutritionLogs.intake');
        if (output) acc.map(cellId(output), 'result', 'history.nutritionLogs.output');
      }
      if (balance) {
        const source = numeric(balance);
        const app = intakeVal !== null && outputVal !== null ? intakeVal - outputVal : null;
        if (source !== null && app !== null && Math.abs(source - app) > 0.5) balanceMismatches.push(cellId(balance));
        acc.exclude(cellId(balance), 'calculated', 'Daily balance is recalculated by the app (intake minus output)');
      }
      if (avg) lastAverageCell = avg;
    }
    if (weights.length) {
      weekMeans.push({
        label: weekLabel ? cellText(weekLabel) : `rows ${header.row + 1}+`,
        app: weights.reduce((a, b) => a + b, 0) / weights.length,
        coverage: weights.length,
        source: lastAverageCell,
      });
    }
  });

  if (unitEvidence) {
    acc.map(cellId(unitEvidence.cell), 'heading', 'unit-evidence');
    acc.issue(
      'LOAD_UNIT_UNKNOWN',
      'warning',
      `Body weights are proposed as ${unitEvidence.unit} based on the label "${cellText(unitEvidence.cell)}" (${unitEvidence.cell.ref}). Confirm before saving.`,
      [cellId(unitEvidence.cell)],
      `Use ${unitEvidence.unit}`,
    );
  } else if (result.bodyweights.length) {
    acc.issue('LOAD_UNIT_UNKNOWN', 'blocking', 'Body weights have no unit evidence. Choose lb or kg.', result.bodyweights.flatMap((b) => b.sourceItemIds.slice(0, 1)));
  }

  // Starting targets: "Starting Predicted Maintenance Calories:" etc.
  const label = (re: RegExp) => wb.sheets.flatMap((s) => s.cells).find((c) => re.test(cellText(c)));
  const valueRightOf = (c: Cell | undefined) => {
    if (!c) return undefined;
    const sheet = wb.sheets.find((s) => s.name === c.sheet)!;
    return rowCells(sheet, c.row).find((o) => o.col > c.col && numeric(o) !== null);
  };
  const maintenanceLabel = label(/maintenance calories/i);
  const goalLabel = label(/daily caloric goal|calorie goal/i);
  const maintenance = valueRightOf(maintenanceLabel);
  const goal = valueRightOf(goalLabel);
  if (maintenance || goal) {
    const ids = [maintenanceLabel, maintenance, goalLabel, goal, meta.programStyle].filter((c): c is Cell => !!c).map(cellId);
    ids.forEach((id) => acc.map(id, 'prescription', 'nutritionTargets.0'));
    const firstLog = [...result.bodyweights.map((b) => b.measurementDate)].sort()[0] ?? null;
    result.nutritionTargets.push({
      sourceItemIds: ids,
      maintenanceKcal: numeric(maintenance),
      goalKcal: numeric(goal),
      styleLabel: meta.programStyle ? metadataValue(meta.programStyle) : null,
      effectiveFrom: null,
    });
    acc.issue(
      'NUTRITION_TARGET_DATES',
      'blocking',
      'The starting calorie targets have no effective date. Targets are effective-dated so later changes do not relabel past logs (FR-09).',
      ids,
      firstLog ? `Effective from ${firstLog} (first logged date)` : null,
    );
  }

  // The received-date header must not be used as an activity date; flag when it disagrees with the log dates.
  if (meta.dateReceived && result.bodyweights.length) {
    const dates = result.bodyweights.map((b) => b.measurementDate).sort();
    acc.issue(
      'HEADER_DATE_MISMATCH',
      'warning',
      `Header says "${cellText(meta.dateReceived)}" but logged dates run ${dates[0]} to ${dates.at(-1)}. Per-row dates are proposed as activity dates; confirm them.`,
      [cellId(meta.dateReceived)],
    );
  }

  if (balanceMismatches.length) {
    acc.issue('LEGACY_CALCULATION_DISCREPANCY', 'info', `${balanceMismatches.length} source daily balance value(s) differ from intake minus output.`, balanceMismatches);
  }
  for (const week of weekMeans) {
    const source = numeric(week.source);
    if (week.source && source !== null && Math.abs(source - week.app) > 0.01) {
      acc.issue(
        'LEGACY_CALCULATION_DISCREPANCY',
        'info',
        `${week.label}: source "Average Weight" ${source.toFixed(2)} (${week.source.formula ?? 'value'}) differs from the mean of that week's ${week.coverage} weigh-ins, ${week.app.toFixed(2)}. Kept for Matt's review; the app uses its own reviewed definition (PRD §10).`,
        [cellId(week.source)],
      );
    }
  }
  if (result.bodyweights.length || result.nutritionLogs.length) {
    acc.issue(
      'HISTORY_DATE_REQUIRED',
      'warning',
      `${result.bodyweights.length} weigh-ins and ${result.nutritionLogs.length} intake/output entries carry per-row dates. Confirm them before importing history; "day before" columns are assigned to the previous date.`,
      [result.bodyweights[0]?.sourceItemIds[0] ?? result.nutritionLogs[0]!.sourceItemIds[0]!],
    );
  }

  // Weekly summary labels and their values next to the log; legacy calculations.
  for (const sheet of wb.sheets) {
    for (const c of sheet.cells) {
      if (acc.isClaimed(cellId(c))) continue;
      const t = cellText(c);
      if (/(weekly|average|predicted|actual|caloric values|weight values|weight change|nutritional mesocycle)/i.test(t) && c.type !== 'n') {
        acc.exclude(cellId(c), 'calculated', 'Legacy summary label; the app recalculates reviewed metrics');
      }
    }
  }
  excludeLegacyFormulas(wb, acc);
  return result;
}
