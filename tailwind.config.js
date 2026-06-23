/** @type {import('tailwindcss').Config} */
// Design tokens adapted from DESIGN.md (Clay.com system) for a sidebar+map dashboard.
// Cream canvas + ink type + a single saturated accent ("best value"), not the
// six-color marketing-card cycle.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#fffaf0',
        'surface-soft': '#faf5e8',
        'surface-card': '#f5f0e0',
        'surface-strong': '#ebe6d6',
        ink: '#0a0a0a',
        'body-strong': '#1a1a1a',
        body: '#3a3a3a',
        muted: '#6a6a6a',
        'muted-soft': '#9a9a9a',
        hairline: '#e5e5e5',
        'hairline-soft': '#f0f0f0',
        // Single accent for the "best value" highlight.
        accent: '#1a3a3a', // brand-teal
        'accent-soft': '#a4d4c5', // brand-mint
        pink: '#ff4d8b',
        ochre: '#e8b94a',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        xs: '6px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
      letterSpacing: {
        display: '-0.03em',
        'display-tight': '-0.05em',
      },
    },
  },
  plugins: [],
};
