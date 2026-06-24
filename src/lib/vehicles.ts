// Vehicle categories and defaults (PRODUCT_BRIEF §10).

export interface VehicleCategory {
  id: 'small' | 'sedan' | 'suv' | 'large';
  label: string;
  sub: string;
  consumption: number; // L/100km
  tank: number; // L
}

export const VEHICLE_CATEGORIES: VehicleCategory[] = [
  { id: 'small', label: 'Small/Hatch', sub: '6.5L/100km · 45L', consumption: 6.5, tank: 45 },
  { id: 'sedan', label: 'Sedan', sub: '8.0L/100km · 55L', consumption: 8.0, tank: 55 },
  { id: 'suv', label: 'SUV', sub: '9.0L/100km · 60L', consumption: 9.0, tank: 60 },
  { id: 'large', label: 'Large SUV/4WD', sub: '11.0L/100km · 80L', consumption: 11.0, tank: 80 },
];

export const FUEL_TYPES = [
  { id: 'E10', label: 'E10', tag: 'Budget', desc: 'Check if your car supports this fuel.' },
  { id: 'U91', label: 'U91', tag: 'Cheap', desc: 'For most normal petrol cars.' },
  { id: 'P95', label: 'P95', tag: 'Standard', desc: 'For many performance petrol cars.' },
  { id: 'P98', label: 'P98', tag: 'Premium', desc: 'For expensive petrol cars.' },
] as const;
