/** True when the sums file has not been replaced with real digests. */
export function isUnprovisioned(text) {
  return text.includes('UNPROVISIONED') && !/^[a-f0-9]{64}\b/im.test(text);
}
