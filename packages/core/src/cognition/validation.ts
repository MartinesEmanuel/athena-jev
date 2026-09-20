declare const __brand: unique symbol;

export type Probability = number & { readonly [__brand]: "Probability" };

export function isProbability(value: unknown): value is Probability {
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value)) return false;
  return value >= 0 && value <= 1;
}

export function assertProbability(
  value: unknown,
  label = "probability",
): Probability {
  if (!isProbability(value)) {
    throw new TypeError(
      `${label}: expected finite number in [0,1], got ${String(value)}`,
    );
  }
  return value;
}
