import { useState, type KeyboardEvent } from 'react';
import { applyMuscleSuggestion, muscleSuggestions } from '@/domain/programs/muscles';

/**
 * Autocomplete for comma-separated muscle names (decision 0021). Suggestions come from muscles
 * already used in the same week. ArrowUp/ArrowDown move through them and Enter picks one, so typing
 * "gl" can join an existing "Glutes". Without a highlighted suggestion, keys behave as usual.
 */
export function useMuscleSuggestions(known: readonly string[], text: string, setText: (text: string) => void, listId: string) {
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(true);
  const suggestions = open ? muscleSuggestions(known, text) : [];
  const pick = (name: string) => { setText(applyMuscleSuggestion(text, name)); setActive(-1); setOpen(true); };

  return {
    /** Returns true when the key was used by the suggestion list. */
    onKeyDown(event: KeyboardEvent<HTMLInputElement>): boolean {
      if (!suggestions.length) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        // -1 is "nothing highlighted", so the list wraps through it.
        setActive((index) => {
          const next = index + step;
          return next >= suggestions.length ? -1 : next < -1 ? suggestions.length - 1 : next;
        });
        return true;
      }
      if (event.key === 'Enter' && active >= 0 && suggestions[active]) {
        event.preventDefault();
        event.stopPropagation();
        pick(suggestions[active]!);
        return true;
      }
      if (event.key === 'Escape' && active >= 0) {
        event.preventDefault();
        event.stopPropagation();
        setActive(-1);
        setOpen(false);
        return true;
      }
      return false;
    },
    onTextChange() { setActive(-1); setOpen(true); },
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list' as const,
      'aria-expanded': suggestions.length > 0,
      'aria-controls': listId,
      'aria-activedescendant': active >= 0 && suggestions[active] ? `${listId}-${active}` : undefined,
    },
    list: suggestions.length ? (
      <ul id={listId} role="listbox" aria-label="Muscles used this week"
        className="absolute left-0 top-full z-20 mt-1 max-h-56 min-w-full overflow-y-auto rounded-card border border-line bg-surface py-1 text-sm shadow-lg">
        {suggestions.map((name, index) => (
          <li key={name} id={`${listId}-${index}`} role="option" aria-selected={index === active}
            // Keep focus in the input so choosing a suggestion doesn't commit the edit first.
            onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onClick={(event) => { event.stopPropagation(); pick(name); }}
            className={`cursor-pointer px-3 py-2 ${index === active ? 'bg-gold/10 text-gold-fg' : 'text-text hover:bg-surface-raised'}`}>
            {name}
          </li>
        ))}
      </ul>
    ) : null,
  };
}
