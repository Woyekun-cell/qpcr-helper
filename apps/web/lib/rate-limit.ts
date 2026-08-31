interface Bucket {
  count: number;
  resetsAt: number;
}

const buckets = new Map<string, Bucket>();

export function allowRequest(key: string, limit = 20, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
