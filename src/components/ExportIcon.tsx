interface Props {
  className?: string;
}

/** Export / share glyph: an up-arrow lifting out of an open tray. */
export default function ExportIcon({ className }: Props) {
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
      {/* arrow shaft + head */}
      <path d="M12 3.5 V14" />
      <path d="M8 7.5 L12 3.5 L16 7.5" />
      {/* open tray */}
      <path d="M5 13 V18 Q5 19.5 6.5 19.5 H17.5 Q19 19.5 19 18 V13" />
    </svg>
  );
}
