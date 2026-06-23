interface Props {
  className?: string;
}

/**
 * Outline petrol-pump nozzle mark (the brand logo glyph). Drawn upright for
 * precision, then rotated so the spout points up-right and the hose curls
 * down-left — matching the reference fuel-nozzle line art.
 */
export default function FuelNozzleIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <g transform="rotate(34 12 12)">
        {/* grip / pump body */}
        <path d="M10.8 8.5 H13.2 Q15 8.5 15 10.3 V16.7 Q15 18.5 13.2 18.5 H10.8 Q9 18.5 9 16.7 V10.3 Q9 8.5 10.8 8.5 Z" />
        {/* spout pipe with bent tip */}
        <path d="M12 8.5 V4.3 Q12 3.3 13 3.2 L15.2 3" />
        {/* trigger lever */}
        <path d="M14.8 11.2 L12 12.6" />
        {/* hose */}
        <path d="M9.4 18 Q6.5 19.5 6.6 22.4" />
      </g>
    </svg>
  );
}
