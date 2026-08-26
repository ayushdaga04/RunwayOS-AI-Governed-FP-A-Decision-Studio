# Finance model and controls

RunwayOS is a deterministic FP&A portfolio model for a fictional B2B SaaS company. It is designed to demonstrate forward-looking decision support rather than claim results for a real employer.

## Revenue schedule

Monthly recurring revenue follows a transparent bridge:

`Ending MRR = Beginning MRR + Growth MRR - Churned MRR`

Annual recurring revenue equals December MRR multiplied by twelve. Revenue is modeled monthly; no GAAP revenue-recognition claim is made.

## Cost and P&L schedule

- Cost of revenue is derived from the governed gross-margin assumption.
- Payroll uses active headcount multiplied by average salary and the benefit load.
- Non-payroll operating expense grows by the annual inflation assumption.
- EBITDA is revenue less cost of revenue, payroll and non-payroll operating expense.
- Cash movement equals EBITDA plus modeled funding inflows. The simplified portfolio model does not claim to be a three-statement accounting model.

## Runway

Runway uses projected cash divided by average monthly negative cash movement. The minimum-cash guardrail is separately shown so the decision can be evaluated before cash reaches zero.

## Scenario governance

The approved baseline remains immutable in the browser session. Sliders and natural-language inputs create a temporary overlay. Natural-language inputs only modify supported assumptions; every financial value is recalculated by the deterministic engine.

## Variance favorability

- Revenue above budget is favorable.
- Expense below budget is favorable.
- Every material variance retains its driver and source identifier.

## Tests

The automated checks validate cash roll-forward, the MRR bridge, directionality of hiring scenarios, expense/revenue favorability, scenario parsing, and citation whitelisting.
