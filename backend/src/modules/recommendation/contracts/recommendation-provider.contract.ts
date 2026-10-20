export interface RecommendationCandidate {
  itemId: string;
  score: number;
  reason: string | null;
}

export interface PersonalizedProviderResponse {
  recommendations: RecommendationCandidate[];
  coldStart: boolean;
  strategy: string;
  modelVersion: string;
}

export interface SimilarProviderResponse {
  items: RecommendationCandidate[];
  strategy: string;
  modelVersion: string;
}

export function parsePersonalizedProviderResponse(
  data: unknown,
): PersonalizedProviderResponse {
  const record = requireRecord(data);

  if (!Array.isArray(record.recommendations)) {
    throw new Error('Provider recommendations must be an array');
  }

  if (typeof record.cold_start !== 'boolean') {
    throw new Error('Provider cold_start must be a boolean');
  }

  return {
    recommendations: record.recommendations.map(parseCandidate),
    coldStart: record.cold_start,
    strategy: requireString(record.strategy, 'strategy'),
    modelVersion: requireString(record.model_version, 'model_version'),
  };
}

export function parseSimilarProviderResponse(
  data: unknown,
): SimilarProviderResponse {
  const record = requireRecord(data);

  if (!Array.isArray(record.items)) {
    throw new Error('Provider items must be an array');
  }

  return {
    items: record.items.map(parseCandidate),
    strategy: requireString(record.strategy, 'strategy'),
    modelVersion: requireString(record.model_version, 'model_version'),
  };
}

function parseCandidate(value: unknown): RecommendationCandidate {
  const record = requireRecord(value);
  const itemId = record.item_id;
  const score = record.score;
  const reason = record.reason;

  if (typeof itemId !== 'string' || !/^[1-9]\d*$/.test(itemId)) {
    throw new Error('Provider item_id must be a positive integer string');
  }

  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new Error('Provider score must be a finite number');
  }

  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    throw new Error('Provider reason must be a string or null');
  }

  return {
    itemId,
    score,
    reason: typeof reason === 'string' ? reason : null,
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Provider response must be an object');
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Provider ${field} must be a non-empty string`);
  }

  return value;
}
