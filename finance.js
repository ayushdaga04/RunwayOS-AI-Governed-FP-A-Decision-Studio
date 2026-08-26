export const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const baseline = Object.freeze({
  openingCash: 5200000,
  startingMrr: 486000,
  monthlyGrowth: 0.042,
  monthlyChurn: 0.021,
  grossMargin: 0.81,
  startingHeadcount: 42,
  averageSalary: 116000,
  benefitsRate: 0.22,
  plannedHires: 5,
  hireStartMonth: 3,
  nonPayrollOpex: 238000,
  annualInflation: 0.06,
  fundingAmount: 0,
  fundingMonth: 12,
  minimumCash: 750000
});

const round = value => Math.round(value);

export function calculatePlan(overrides = {}) {
  const a = { ...baseline, ...overrides };
  const rows = [];
  let cash = a.openingCash;
  let mrr = a.startingMrr;
  let cumulativeBurn = 0;

  months.forEach((month, index) => {
    const growthMrr = round(mrr * a.monthlyGrowth);
    const churnMrr = round(mrr * a.monthlyChurn);
    mrr += growthMrr - churnMrr;
    const revenue = mrr;
    const cogs = round(revenue * (1 - a.grossMargin));
    const hiresActive = index >= a.hireStartMonth ? a.plannedHires : 0;
    const headcount = a.startingHeadcount + hiresActive;
    const payroll = round(headcount * a.averageSalary * (1 + a.benefitsRate) / 12);
    const opex = round(a.nonPayrollOpex * Math.pow(1 + a.annualInflation, index / 12));
    const ebitda = revenue - cogs - payroll - opex;
    const funding = index === a.fundingMonth ? a.fundingAmount : 0;
    const cashMovement = ebitda + funding;
    cash = round(cash) + round(cashMovement);
    if (cashMovement < 0) cumulativeBurn += Math.abs(cashMovement);
    rows.push({ month, index, revenue, cogs, grossProfit: revenue-cogs, payroll, opex, ebitda, cashMovement: round(cashMovement), cash, headcount, hiresActive, growthMrr, churnMrr });
  });

  const negativeMonths = rows.filter(row => row.cashMovement < 0);
  const averageBurn = negativeMonths.length ? negativeMonths.reduce((sum,row)=>sum+Math.abs(row.cashMovement),0)/negativeMonths.length : 0;
  const runway = averageBurn > 0 ? rows[0].cash / averageBurn : 99;
  return {
    assumptions: a,
    rows,
    metrics: {
      endingCash: rows.at(-1).cash,
      averageBurn: round(averageBurn),
      runway: Math.min(99, Math.round(runway * 10) / 10),
      endingMrr: rows.at(-1).revenue,
      arr: rows.at(-1).revenue * 12,
      endingHeadcount: rows.at(-1).headcount,
      annualRevenue: rows.reduce((sum,row)=>sum+row.revenue,0),
      annualEbitda: rows.reduce((sum,row)=>sum+row.ebitda,0),
      grossMargin: a.grossMargin
    }
  };
}

export function comparePlans(base, scenario) {
  return {
    runway: scenario.metrics.runway - base.metrics.runway,
    endingCash: scenario.metrics.endingCash - base.metrics.endingCash,
    annualRevenue: scenario.metrics.annualRevenue - base.metrics.annualRevenue,
    annualEbitda: scenario.metrics.annualEbitda - base.metrics.annualEbitda,
    headcount: scenario.metrics.endingHeadcount - base.metrics.endingHeadcount
  };
}

export function calculateVariance(actual, budget, type = "expense") {
  const delta = actual - budget;
  const percent = budget === 0 ? 0 : delta / Math.abs(budget);
  const favorable = type === "revenue" ? delta >= 0 : delta <= 0;
  return { delta, percent, favorable, status: favorable ? "Favorable" : "Unfavorable" };
}

export const varianceRows = [
  { account: "Subscription revenue", category: "Revenue", budget: 548000, actual: 526000, driver: "Enterprise renewal slipped", type: "revenue" },
  { account: "Services revenue", category: "Revenue", budget: 76000, actual: 83000, driver: "Two implementations accelerated", type: "revenue" },
  { account: "Payroll & benefits", category: "People", budget: 488000, actual: 512000, driver: "Sales hires started early", type: "expense" },
  { account: "Cloud infrastructure", category: "COGS", budget: 94000, actual: 101000, driver: "Usage grew ahead of plan", type: "expense" },
  { account: "Demand generation", category: "Sales & marketing", budget: 122000, actual: 108000, driver: "Campaign shifted to Q4", type: "expense" },
  { account: "Software & vendors", category: "G&A", budget: 47000, actual: 53000, driver: "Annual contract true-up", type: "expense" }
].map(row => ({ ...row, ...calculateVariance(row.actual,row.budget,row.type) }));

export function buildRecommendation(base, scenario, label = "Proposed hiring plan") {
  const delta = comparePlans(base, scenario);
  const runwayRisk = scenario.metrics.runway < 12;
  const cashRisk = scenario.metrics.endingCash < scenario.assumptions.minimumCash;
  const decision = runwayRisk || cashRisk ? "Revise before approval" : "Financially supportable";
  const action = runwayRisk
    ? "Phase the hires across two quarters or defer lower-priority roles until recurring revenue catches up."
    : "Approve with a monthly runway checkpoint and retain the minimum-cash guardrail.";
  return {
    decision,
    tone: runwayRisk || cashRisk ? "risk" : "positive",
    headline: runwayRisk ? "The plan breaks the 12-month runway guardrail." : "The plan stays inside the runway guardrail.",
    summary: `${label} changes projected runway by ${delta.runway.toFixed(1)} months and ending cash by ${formatCurrency(delta.endingCash)} versus the approved baseline.`,
    action,
    evidence: [
      `Runway: ${scenario.metrics.runway.toFixed(1)} months [MODEL-RUNWAY-01]`,
      `Ending cash: ${formatCurrency(scenario.metrics.endingCash)} [MODEL-CASH-12]`,
      `Annual EBITDA impact: ${formatCurrency(delta.annualEbitda)} [MODEL-PL-12]`
    ]
  };
}

export function formatCurrency(value, compact = true) {
  const sign = value < 0 ? "−" : "";
  const n = Math.abs(value);
  if (compact && n >= 1000000) return `${sign}$${(n/1000000).toFixed(2)}M`;
  if (compact && n >= 1000) return `${sign}$${Math.round(n/1000)}K`;
  return `${sign}$${Math.round(n).toLocaleString()}`;
}

export function parseScenarioPrompt(prompt) {
  const text = prompt.toLowerCase();
  const overrides = {};
  let label = "AI-created scenario";
  const hireMatch = text.match(/(?:hire|add)\s+(\d+)/);
  const churnMatch = text.match(/churn(?:\s+(?:to|at))?\s+(\d+(?:\.\d+)?)\s*%/);
  const growthMatch = text.match(/(?:growth|revenue growth)(?:\s+(?:to|at))?\s+(\d+(?:\.\d+)?)\s*%/);
  const delayMatch = text.match(/delay(?:\s+(?:hiring|hires))?(?:\s+by)?\s+(\d+)\s+month/);
  if (hireMatch) { overrides.plannedHires = Number(hireMatch[1]); label = `Hire ${hireMatch[1]} people`; }
  if (churnMatch) { overrides.monthlyChurn = Number(churnMatch[1]) / 100; label += ` · ${churnMatch[1]}% churn`; }
  if (growthMatch) { overrides.monthlyGrowth = Number(growthMatch[1]) / 100; label += ` · ${growthMatch[1]}% growth`; }
  if (delayMatch) { overrides.hireStartMonth = Math.min(11, baseline.hireStartMonth + Number(delayMatch[1])); label += ` · delay ${delayMatch[1]} months`; }
  return { overrides, label, understood: Object.keys(overrides).length > 0 };
}
