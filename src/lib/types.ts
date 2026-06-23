// Re-export the API contract types for client use (single source of truth lives
// in api/_lib/types.ts).
export type {
  FuelType,
  FillMode,
  Suggestion,
  FindFuelRequest,
  Station,
  SavingsVs,
  Recommendation,
  QuerySummary,
  FindFuelSuccess,
  FindFuelError,
  FindFuelResponse,
} from '../../api/_lib/types';
