/** Shape returned by `CostTracker.checkBudget()` — duplicated here so adapters stay decoupled from `src/pipeline`. */
export interface BudgetCheckResult {
  withinBudget: boolean;
  currentCostUsd: number;
  maxBudgetUsd: number;
  remainingUsd: number;
}
