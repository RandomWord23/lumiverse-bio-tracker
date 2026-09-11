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
// Health & Damage System configuration
// ---------------------------------------------------------------------------

export const MAX_HP_BASE = 100
export const CON_HP_BONUS = 10

/** Regen rates (HP per hour). */
export const HEALTH_REGEN = {
  EMPTY_STOMACH: 1,
  DIGESTING_BASE: 3,
  DIGESTING_BONUS_PER_ITEM: 1,
  DIGESTING_BONUS_CAP: 3,
  RESTING_MULT: 2,
  CON_MULT_WEIGHT: 0.05,
  CRITICAL_MULT: 3,
  CRITICAL_THRESHOLD_PCT: 4,
} as const

/** Damage values for discrete events. */
export const HEALTH_DAMAGE = {
  VOMIT: 8,
  INDIGESTION_90: 4,
  INDIGESTION_75: 2,
  PREY_ESCAPE: 2,
  ACID_OVERLOAD: 5,
  OVERCAPACITY: 3,
} as const

export type HealthState = 'Healthy' | 'Bruised' | 'Wounded' | 'Critical' | 'Incapacitated'

/**
 * Modifier contributions per health state.
 * Each entry is an additive modifier map (same format as buffs/attributes)
 * that gets merged into collectModifiers() and clamped to ±50%.
 */
export const HEALTH_STATE_MODIFIERS: Record<Exclude<HealthState, 'Healthy' | 'Incapacitated'>, Record<string, number>> = {
  Bruised: {
    Suppression: -0.03,
  },
  Wounded: {
    Suppression: -0.08,
    EscapeChance: -0.05,
    IndigestionGain: 0.03,
  },
  Critical: {
    Suppression: -0.12,
    EscapeChance: -0.10,
    IndigestionGain: 0.08,
    EnergyRegen: -0.05,
  },
}

/** Threshold percentages (fraction of maxHP) for each health state. */
export const HEALTH_STATE_THRESHOLDS = {
  HEALTHY: 0.60,
  BRUISED: 0.30,
  WOUNDED: 0.10,
  CRITICAL: 0.01,
} as const

/** Result of processing health damage events in Phase 2. */
export interface HealthDamageResult {
  xml: string
  totalDamage: number
  events: string[]
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

// ---------------------------------------------------------------------------
// Bowels Transit System types
// ---------------------------------------------------------------------------

/** Return value from `transitItemsInContent` — processes bowels prey transit. */
export interface TransitResult {
  content: string
  transferredToStomach: string[]
  transitCount: number
}

// ---------------------------------------------------------------------------
// Womb Absorption System types
// ---------------------------------------------------------------------------

/** Return value from `absorbItemsInContent` — processes womb prey absorption. */
export interface AbsorptionResult {
  content: string
  absorbedPrey: { name: string; volume: number }[]
  absorptionCount: number
}

// ---------------------------------------------------------------------------
// Balls Conversion System types
// ---------------------------------------------------------------------------

/** Return value from `convertItemsInContent` — processes balls prey conversion. */
export interface ConversionResult {
  content: string
  convertedPrey: { name: string; volume: number }[]
  conversionCount: number
}

// ---------------------------------------------------------------------------
// Lactation System types
// ---------------------------------------------------------------------------

/** Return value from the lactation engine — processes milk production and overflow. */
export interface LactationResult {
  milkVolume: number
  milkCapacity: number
  breastGrowth: number
  isLeaking: boolean
  wombPreyCount: number
  productionRate: number
}

// ---------------------------------------------------------------------------
// Message Content Processor types
// ---------------------------------------------------------------------------

/** Context object passed to spindle.registerMessageContentProcessor handlers. */
export interface MessageContentProcessorCtx {
  chatId: string
  messageId?: string
  content: string
  extra?: Record<string, unknown>
  origin: 'create' | 'update' | 'swipe_add' | 'swipe_update' | 'render'
  swipeIndex?: number
  userId: string
}

/** Return value from a message content processor handler. */
export interface MessageContentProcessorResult {
  content?: string
  extra?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Dice System types
// ---------------------------------------------------------------------------

/** A single die type configuration (e.g. { sides: 20, count: 2 } = two d20s). */
export interface DiceConfig {
  sides: number
  count: number
}

/** A named section of dice (e.g. "Combat" with d20×2 + d6×3). */
export interface DiceSection {
  name: string
  dice: DiceConfig[]
}

/** A die that has been rolled — has an index within its section and a value. */
export interface RolledDie {
  index: number
  sides: number
  value: number
}

/** A section whose dice have all been rolled. */
export interface RolledSection {
  name: string
  dice: RolledDie[]
}

/** Parsed from an `<action_roll>` tag emitted by the LLM. */
export interface ActionRoll {
  type: string
  section: string
  attribute: string
  dc: number
  dieIndex: number
  dieValue: number
  modifier: number
  total: number
  result: 'success' | 'failure' | 'narrative'
}
