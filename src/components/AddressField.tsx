import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { geocodeSuggest } from '../lib/api';
import type { Suggestion } from '../lib/types';

interface Props {
  value: string;
  disabled?: boolean;
  /** Free typing — parent should clear any stored origin coords. */
  onChange: (text: string) => void;
  /** A suggestion was picked — parent gets the label + exact coords. */
  onSelect: (label: string, origin: { lat: number; lon: number }) => void;
  onUseLocation: () => void;
}

export default function AddressField({
  value,
  disabled,
  onChange,
  onSelect,
  onUseLocation,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const skipNextFetch = useRef(false); // don't re-query right after a pick
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced type-ahead fetch (min 3 chars), aborting the in-flight request.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      const res = await geocodeSuggest(q, ctrl.signal);
      if (res) {
        setSuggestions(res);
        setOpen(res.length > 0);
        setActive(-1);
      }
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (s: Suggestion) => {
    skipNextFetch.current = true;
    onSelect(s.label, { lat: s.lat, lon: s.lon });
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Suburb or address, e.g. Lidcombe NSW"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full h-11 rounded-md border border-hairline bg-white px-3 text-base text-ink placeholder:text-muted-soft focus:outline-none focus:border-ink"
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-hairline bg-white shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                // mousedown (not click) so it fires before the input blurs
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={
                  'w-full text-left px-3 py-2 text-sm leading-snug ' +
                  (i === active ? 'bg-surface-card text-ink' : 'text-body hover:bg-surface-soft')
                }
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onUseLocation}
        disabled={disabled}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline disabled:opacity-50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        Use my current location
      </button>
    </div>
  );
}
