import test from "node:test";
import assert from "node:assert/strict";
import { baseline, buildRecommendation, calculatePlan, calculateVariance, comparePlans, parseScenarioPrompt } from "../finance.mjs";

test("monthly model produces twelve periods and rolls cash correctly", () => {
  const plan = calculatePlan();
  assert.equal(plan.rows.length, 12);
  let prior = baseline.openingCash;
  plan.rows.forEach(row => { assert.equal(row.cash, Math.round(prior + row.cashMovement)); prior = row.cash; });
});

test("MRR bridge reconciles for every month", () => {
  const plan = calculatePlan();
  let prior = baseline.startingMrr;
  plan.rows.forEach(row => { assert.equal(row.revenue, Math.round(prior + row.growthMrr - row.churnMrr)); prior = row.revenue; });
});

test("more hires reduce cash and runway", () => {
  const base = calculatePlan();
  const scenario = calculatePlan({ plannedHires: 12 });
  const delta = comparePlans(base, scenario);
  assert.ok(delta.endingCash < 0);
  assert.ok(delta.runway < 0);
});

test("revenue and expense favorability use the correct sign", () => {
  assert.equal(calculateVariance(110,100,"revenue").favorable, true);
  assert.equal(calculateVariance(90,100,"expense").favorable, true);
});

test("AI prompt parser converts supported assumptions deterministically", () => {
  const parsed = parseScenarioPrompt("Hire 8 people and delay hiring by 2 months with churn at 3.5%");
  assert.equal(parsed.overrides.plannedHires, 8);
  assert.equal(parsed.overrides.hireStartMonth, 5);
  assert.equal(parsed.overrides.monthlyChurn, 0.035);
});

test("recommendation cites only governed model identifiers", () => {
  const rec = buildRecommendation(calculatePlan(), calculatePlan({ plannedHires: 10 }));
  assert.equal(rec.evidence.length, 3);
  rec.evidence.forEach(item => assert.match(item, /\[MODEL-(RUNWAY-01|CASH-12|PL-12)\]/));
});
