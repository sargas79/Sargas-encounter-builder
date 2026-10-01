/**
 * Pure grid-aware token placement: a square spiral of free cells around an origin.
 * Square grids are the supported case; hex/gridless callers pass `cellSize` = token pixel size
 * and receive a warning from the service.
 */

export interface PlacementRequest {
  /** Token size in grid cells (width, height). */
  width: number;
  height: number;
  id: string;
}

export interface PlacementBounds {
  /** Scene rectangle in grid cells (inclusive min, exclusive max). */
  minI: number;
  minJ: number;
  maxI: number;
  maxJ: number;
}

export interface PlacedToken extends PlacementRequest {
  /** Top-left grid offset. */
  i: number;
  j: number;
}

export interface PlacementResult {
  placed: PlacedToken[];
  unplaced: PlacementRequest[];
  /** Cells examined; bounded by `maxRadius`. */
  cellsExamined: number;
}

/** Yield grid offsets on a square spiral starting at the origin. */
export function* spiral(
  originI: number,
  originJ: number,
  maxRadius: number,
): Generator<{ i: number; j: number }> {
  yield { i: originI, j: originJ };
  for (let r = 1; r <= maxRadius; r++) {
    // Top edge left→right, right edge top→bottom, bottom edge right→left, left edge bottom→top.
    for (let dj = -r; dj <= r; dj++) yield { i: originI - r, j: originJ + dj };
    for (let di = -r + 1; di <= r; di++) yield { i: originI + di, j: originJ + r };
    for (let dj = r - 1; dj >= -r; dj--) yield { i: originI + r, j: originJ + dj };
    for (let di = r - 1; di >= -r + 1; di--) yield { i: originI + di, j: originJ - r };
  }
}

function key(i: number, j: number): string {
  return `${i},${j}`;
}

/**
 * Place tokens on free cells. `occupied` holds cells already used by existing tokens.
 * Larger tokens occupy a width×height block anchored at the spiral cell.
 */
export function placeTokens(
  requests: PlacementRequest[],
  origin: { i: number; j: number },
  bounds: PlacementBounds,
  occupied: Iterable<{ i: number; j: number }>,
  maxRadius = 12,
): PlacementResult {
  const taken = new Set<string>();
  for (const cell of occupied) taken.add(key(cell.i, cell.j));
  const placed: PlacedToken[] = [];
  const unplaced: PlacementRequest[] = [];
  let cellsExamined = 0;

  // Largest tokens first so they get the cells nearest the origin that can fit them.
  const sorted = [...requests].sort((a, b) => b.width * b.height - a.width * a.height);
  for (const request of sorted) {
    const w = Math.max(1, Math.ceil(request.width));
    const h = Math.max(1, Math.ceil(request.height));
    let found: { i: number; j: number } | null = null;
    for (const cell of spiral(origin.i, origin.j, maxRadius)) {
      cellsExamined++;
      if (
        cell.i < bounds.minI ||
        cell.j < bounds.minJ ||
        cell.i + h > bounds.maxI ||
        cell.j + w > bounds.maxJ
      )
        continue;
      let free = true;
      for (let di = 0; di < h && free; di++)
        for (let dj = 0; dj < w && free; dj++) if (taken.has(key(cell.i + di, cell.j + dj))) free = false;
      if (!free) continue;
      found = cell;
      break;
    }
    if (!found) {
      unplaced.push(request);
      continue;
    }
    for (let di = 0; di < h; di++) for (let dj = 0; dj < w; dj++) taken.add(key(found.i + di, found.j + dj));
    placed.push({ ...request, i: found.i, j: found.j });
  }
  return { placed, unplaced, cellsExamined };
}

/** Expand an existing token's footprint into occupied cells. */
export function footprintCells(
  i: number,
  j: number,
  width: number,
  height: number,
): { i: number; j: number }[] {
  const out: { i: number; j: number }[] = [];
  for (let di = 0; di < Math.max(1, Math.ceil(height)); di++)
    for (let dj = 0; dj < Math.max(1, Math.ceil(width)); dj++) out.push({ i: i + di, j: j + dj });
  return out;
}

/** Token names for duplicates: "Name 1", "Name 2", … when numbering is on and quantity > 1. */
export function tokenNames(
  baseName: string,
  quantity: number,
  numberDuplicates: boolean,
  existingNames: Iterable<string> = [],
): string[] {
  if (quantity <= 1 || !numberDuplicates) return Array.from({ length: quantity }, () => baseName);
  const used = new Set(existingNames);
  const names: string[] = [];
  let n = 1;
  while (names.length < quantity) {
    const candidate = `${baseName} ${n++}`;
    if (!used.has(candidate)) names.push(candidate);
  }
  return names;
}
