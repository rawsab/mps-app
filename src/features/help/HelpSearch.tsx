import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Highlighted } from '@/components/Highlighted';
import { SearchIcon } from '@/components/icons';
import { controlClass } from '@/components/ui';
import { searchHelp, type HelpResult } from '@/domain/help/sections';
import { SECTIONS } from './sectionIndex';

/**
 * Searches every section of every Help page by heading and text (decision 0057). ARIA 1.2 combobox,
 * as in coach search: arrows move (wrapping), Enter opens, Escape clears.
 */
export function HelpSearch({ popupClassName = 'w-full' }: { popupClassName?: string }) {
  const id = useId();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchHelp(SECTIONS, query), [query]);
  const typed = query.trim();
  const shown = focused && !!typed;
  const current = Math.min(active, results.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (current >= 0) document.getElementById(`${id}-option-${current}`)?.scrollIntoView({ block: 'nearest' });
  }, [id, current]);

  function open(result: HelpResult) {
    setQuery('');
    setActive(0);
    navigate(result.to);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = results[current];
      if (result) open(result);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
    }
  }

  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><SearchIcon className="size-4 shrink-0" /></span>
      <input
        type="search"
        role="combobox"
        aria-label="Search help"
        aria-expanded={shown}
        aria-controls={`${id}-results`}
        aria-autocomplete="list"
        aria-activedescendant={shown && current >= 0 ? optionId(current) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search help"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`min-h-11 w-full border-line pl-9 pr-3 ${controlClass}`}
      />
      <div
        id={`${id}-results`}
        role="listbox"
        aria-label="Help sections"
        hidden={!shown}
        className={`absolute left-0 top-full z-20 mt-1 max-h-[min(28rem,70vh)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-popover ${popupClassName}`}
      >
        {results.map((result, i) => {
          const selected = i === current;
          return (
            <div
              key={`${result.slug}#${result.id}`}
              id={optionId(i)}
              role="option"
              aria-selected={selected}
              // Keep focus in the input until the result opens.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => open(result)}
              onMouseMove={() => { if (!selected) setActive(i); }}
              className={`cursor-pointer rounded-inner px-2.5 py-2 ${selected ? 'bg-surface-raised' : ''}`}
            >
              <span className="block text-sm text-text"><Highlighted text={result.title} ranges={result.ranges} /></span>
              <span className="block text-xs text-muted">{result.trail}</span>
              {result.snippet ? <span className="mt-1 block text-xs leading-5 text-muted"><Highlighted text={result.snippet.text} ranges={result.snippet.ranges} /></span> : null}
            </div>
          );
        })}
        {!results.length ? <p className="px-2.5 py-6 text-center text-sm text-muted">No help sections match “{typed}”.</p> : null}
      </div>
      <p role="status" className="sr-only">{shown ? `${results.length} ${results.length === 1 ? 'section' : 'sections'}` : ''}</p>
    </div>
  );
}
