interface Option<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid grid-flow-col auto-cols-fr gap-1 rounded-md bg-surface-card p-1"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={
              'h-9 rounded-sm text-sm font-semibold transition-colors ' +
              (active
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:text-ink')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
