export const aud = (n: number): string =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);

export const cpl = (n: number): string => `${n.toFixed(1)} c/L`;

export const km = (n: number): string => (n < 10 ? `${n.toFixed(1)} km` : `${Math.round(n)} km`);

export const litres = (n: number): string => `${n.toFixed(1)} L`;
