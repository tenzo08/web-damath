export type { Clock, SearchOptions, SearchResult, SupportedVariantId } from './types.js';
export { chooseMove } from './search.js';
export { evaluate, DEFAULT_WEIGHTS, MATERIAL_HEAVY_WEIGHTS } from './evaluate.js';
export type { EvaluationWeights } from './evaluate.js';
export { TIERS, tierOptions } from './tiers.js';
export type { DifficultyTier } from './tiers.js';
export { createRng, randomInt } from './rng.js';
export { handleAiRequest } from './worker-protocol.js';
export type { AiWorkerRequest, AiWorkerResponse } from './worker-protocol.js';
