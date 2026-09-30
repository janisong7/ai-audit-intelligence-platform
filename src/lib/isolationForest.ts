/**
 * Isolation Forest anomaly detection (in-browser, no external dependencies).
 * Liu, F. T., Ting, K. M., & Zhou, Z. H. (2008). Isolation Forest.
 * IEEE International Conference on Data Mining, pp. 413–422.
 *
 * Returns anomaly scores in [0, 1] — higher score = more anomalous.
 * The algorithm isolates anomalies by building random trees: anomalies
 * are isolated closer to the root (shorter average path length), which
 * maps to a higher anomaly score via 2^(-E[path] / c(n)).
 */

/** Expected path length to isolate one point in a random binary tree of n nodes. */
function c(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  // Approximation using harmonic numbers: H(n-1) ≈ ln(n-1) + Euler–Mascheroni constant
  return 2 * (Math.log(n - 1) + 0.5772156649015329) - (2 * (n - 1)) / n;
}

class IsolationTree {
  private splitFeature = 0;
  private splitValue = 0;
  private left: IsolationTree | null = null;
  private right: IsolationTree | null = null;
  private nodeSize = 0;
  private leaf = false;

  build(data: Float64Array[], depth: number, maxDepth: number): void {
    this.nodeSize = data.length;
    if (data.length <= 1 || depth >= maxDepth) { this.leaf = true; return; }
    const nFeatures = data[0].length;
    this.splitFeature = Math.floor(Math.random() * nFeatures);
    let min = data[0][this.splitFeature]; let max = min;
    for (const row of data) { const v = row[this.splitFeature]; if (v < min) min = v; if (v > max) max = v; }
    if (min === max) { this.leaf = true; return; }
    this.splitValue = min + Math.random() * (max - min);
    const left = data.filter(row => row[this.splitFeature] < this.splitValue);
    const right = data.filter(row => row[this.splitFeature] >= this.splitValue);
    if (!left.length || !right.length) { this.leaf = true; return; }
    this.left = new IsolationTree(); this.right = new IsolationTree();
    this.left.build(left, depth + 1, maxDepth);
    this.right.build(right, depth + 1, maxDepth);
  }

  pathLength(point: Float64Array, depth: number): number {
    if (this.leaf || !this.left || !this.right) return depth + c(this.nodeSize);
    return point[this.splitFeature] < this.splitValue
      ? this.left.pathLength(point, depth + 1)
      : this.right.pathLength(point, depth + 1);
  }
}

/**
 * Min-max normalise features column-wise so no single feature dominates by scale
 * (e.g. resolutionHours 0–1000 vs binary SLA flag 0–1).
 */
function normalise(matrix: number[][]): Float64Array[] {
  if (!matrix.length) return [];
  const n = matrix[0].length;
  const mins = new Float64Array(n).fill(Infinity);
  const maxs = new Float64Array(n).fill(-Infinity);
  for (const row of matrix) { for (let f = 0; f < n; f++) { if (row[f] < mins[f]) mins[f] = row[f]; if (row[f] > maxs[f]) maxs[f] = row[f]; } }
  return matrix.map(row => {
    const out = new Float64Array(n);
    for (let f = 0; f < n; f++) { const range = maxs[f] - mins[f]; out[f] = range > 0 ? (row[f] - mins[f]) / range : 0; }
    return out;
  });
}

/**
 * Run Isolation Forest on a feature matrix and return per-row anomaly scores.
 * @param data - each row is one sample, each column is one feature
 * @param nTrees - number of isolation trees (100 is standard)
 * @param subsampleSize - samples used to build each tree (256 is standard)
 * @returns anomaly score per row in [0, 1]; higher = more anomalous
 */
export function isolationForestScores(data: number[][], nTrees = 100, subsampleSize = 256): number[] {
  const n = data.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const actualSample = Math.min(subsampleSize, n);
  const maxDepth = Math.ceil(Math.log2(actualSample));
  const normalised = normalise(data);
  const cNorm = c(actualSample);
  const pathSums = new Float64Array(n);
  for (let t = 0; t < nTrees; t++) {
    // Fisher-Yates partial shuffle for O(n) subsample without replacement
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > n - actualSample - 1; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    const sample = idx.slice(n - actualSample).map(i => normalised[i]);
    const tree = new IsolationTree();
    tree.build(sample, 0, maxDepth);
    for (let i = 0; i < n; i++) pathSums[i] += tree.pathLength(normalised[i], 0);
  }
  return Array.from(pathSums).map(sum => Math.pow(2, -(sum / nTrees) / cNorm));
}
