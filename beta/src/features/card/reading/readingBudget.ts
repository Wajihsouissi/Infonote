/** Release a contiguous prefix without charging multiple complex blocks to
 * one commit. Always admit one item so even a wide table can make progress. */
export function nextReadingCount(costs: readonly number[], from: number, budget: number): number {
    let count = from, remaining = budget;
    while (count < costs.length) {
        const cost = Math.max(1, costs[count]);
        if (count > from && cost > remaining) break;
        remaining -= cost;
        count++;
        if (remaining <= 0) break;
    }
    return count;
}
