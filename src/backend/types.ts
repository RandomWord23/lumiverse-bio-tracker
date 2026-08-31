/**
 * Static configuration constants and shared type definitions for the backend.
 *
 * These values are module-scope configuration tables that describe how
 * character-sheet attributes, clothing slots, and digestion conditions
 * map onto one another.  They are pure data (no runtime side-effects) so
 * they can be shared freely across backend modules.
 */

// ---------------------------------------------------------------------------
// Attribute → stat configuration
// ---------------------------------------------------------------------------

/** Maps each attribute key to the stat keys it influences. */
export const ATTRIBUTE_STAT_MAP: Record<string, string[]> = {
  STR: ['StomachResistance'],
  DEX: ['ArousalDecay'],
  CON: ['AcidRiseRate', 'HealthRegen'],
  INT: ['NutrientAbsorption'],
  WIS: ['IndigestionDecayRate', 'EnergyRegen'],
  CHA: ['Suppression'],
}

export const ATTRIBUTE_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const
export const ATTRIBUTE_MODIFIER_WEIGHT = 0.05

// ---------------------------------------------------------------------------
// Clothing stress configuration
// ---------------------------------------------------------------------------

export const conditionThresholds: Record<string, number[]> = {
  rigid: [5, 10, 20, 30, 40],
  standard: [10, 20, 35, 50, 70],
  stretchy: [20, 40, 60, 80, 100],
  magic: [Infinity, Infinity, Infinity, Infinity, Infinity],
}

export const conditionNames = ['snug', 'strained', 'tight', 'damaged', 'ruined']

export const slotBodyMap: Record<string, string[]> = {
  'Head Top': ['weight'],
  'Face': ['weight'],
  'Head Lower': ['weight'],
  'Neck': ['weight'],
  'Underwear Top': ['weight', 'breasts'],
  'Underwear Bottom': ['weight', 'hips', 'penis'],
  'Torso Base': ['weight', 'height', 'breasts'],
  'Torso Mid': ['weight', 'height', 'breasts'],
  'Torso Outer': ['weight', 'height', 'breasts'],
  'Torso Shell': ['weight', 'height', 'breasts'],
  'Hands Base': ['weight'],
  'Hands Outer': ['weight'],
  'Legs Base': ['weight', 'height', 'hips', 'penis'],
  'Legs Outer': ['weight', 'height', 'hips'],
  'Feet Base': ['weight', 'height'],
  'Feet Outer': ['weight', 'height'],
  'Jewelry': ['weight'],
  'Back': ['weight'],
  'Waist': ['weight', 'hips'],
}

export const stressMultipliers: Record<string, number> = {
  height: 1.0,
  weight: 1.0,
  breasts: 0.1,
  hips: 2.0,
  penis: 1.0,
}

// ---------------------------------------------------------------------------
// Shared interfaces
// ---------------------------------------------------------------------------

/** Collected information about a single prey item during struggle processing. */
export interface PreyData {
  name: string
  volume: number
  digestionPct: number
  willingness: string
  stamina: number
  consciousnessFactor: number
  sizeFactor: number
  willingnessFactor: number
  personalStruggle: number
  /** Effective indigestion contribution after stomach resistance & suppression (set after aggregation). */
  effectiveStruggle: number
  escaped: boolean
  attrs: string
  inner: string | null
  isSelfClosing: boolean
}
