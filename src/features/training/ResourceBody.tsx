import type { ReactNode } from 'react';
import { matrixTone, parseResourceBody, type ResourceBlock } from '@/domain/programs/resourceText';

/** Resource text with its pipe tables drawn as tables: translucent gold header row, grey row labels, banded cells. */
export function ResourceBody({ body, label }: { body: string; label: string }) {
  const blocks = parseResourceBody(body);
  return (
    <div className="mt-1 grid gap-3">
      {blocks.map((block, b) =>
        block.kind === 'heading' ? (
          <h3 key={b} className={`text-sm font-semibold ${b ? 'mt-2' : ''}`}>{block.text}</h3>
        ) : block.kind === 'text' ? (
          <p key={b} className="whitespace-pre-line break-words text-sm text-muted">{block.text}</p>
        ) : (
          <TableFrame key={b} label={label} wide={(block.kind === 'table' ? block.header.length : block.columns.length + 2) >= 4}>
            {block.kind === 'table' ? <Table block={block} /> : <Matrix block={block} />}
          </TableFrame>
        ),
      )}
    </div>
  );
}

// Wide tables scroll sideways on a phone instead of widening the page.
function TableFrame({ label, wide, children }: { label: string; wide: boolean; children: ReactNode }) {
  return (
    <div role="region" aria-label={`${label} table`} tabIndex={0} className="overflow-x-auto rounded-card border border-line">
      <table className={`w-full border-collapse text-left text-sm ${wide ? 'min-w-[34rem]' : ''}`}>{children}</table>
    </div>
  );
}

function Table({ block }: { block: Extract<ResourceBlock, { kind: 'table' }> }) {
  return (
    <>
      <thead>
        <tr className="bg-table-head text-on-table-head">
          {block.header.map((h, c) => (
            <th key={c} scope="col" className="border-b border-line px-3 py-1 font-semibold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, r) => (
          <tr key={r} className={r % 2 ? 'bg-surface' : 'bg-surface-raised'}>
            {row.map((cell, c) =>
              c === 0 && row.length > 1 ? (
                <th key={c} scope="row" className="border-t border-r border-ink bg-line px-3 py-2 align-top font-semibold">{cell}</th>
              ) : (
                <td key={c} className="border-t border-ink px-3 py-2 align-top">{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </>
  );
}

const TONE = { good: 'bg-good-fill text-on-tone font-medium', bad: 'bg-bad-fill text-on-tone font-medium' } as const;
const cell = 'border border-ink px-2 text-center';
const gridCell = `${cell} py-2.5`;

/** Two-axis grid: column axis across the top, row axis down the left, advice cells tinted by tone. */
function Matrix({ block }: { block: Extract<ResourceBlock, { kind: 'matrix' }> }) {
  return (
    <>
      <thead>
        <tr>
          <td className={`${cell} bg-line`} />
          <th scope="colgroup" colSpan={block.columns.length + 1} className={`${cell} bg-table-head py-1.5 font-semibold text-on-table-head`}>{block.columnAxis}</th>
        </tr>
      </thead>
      {/* The row axis spans the column-number row too, so both sit in one row group. */}
      <tbody>
        <tr>
          <th scope="rowgroup" rowSpan={block.rows.length + 1} className={`${gridCell} w-10 bg-table-head px-1 font-semibold text-on-table-head`}>
            <span className="inline-block rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{block.rowAxis}</span>
          </th>
          <td className={`${gridCell} w-12 bg-line`} />
          {block.columns.map((c, i) => (
            <th key={i} scope="col" className={`${gridCell} bg-surface-raised font-semibold text-gold-fg`}>{c}</th>
          ))}
        </tr>
        {block.rows.map((row, r) => (
          <tr key={r}>
            <th scope="row" className={`${gridCell} bg-surface-raised font-semibold text-gold-fg`}>{row.label}</th>
            {block.columns.map((_, c) => {
              const value = row.cells[c] ?? '';
              const tone = matrixTone(value);
              return <td key={c} className={`${gridCell} ${tone ? TONE[tone] : 'bg-surface text-muted'}`}>{value}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </>
  );
}
