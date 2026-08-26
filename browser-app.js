const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const baseline = Object.freeze({
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

function calculatePlan(overrides = {}) {
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

function comparePlans(base, scenario) {
  return {
    runway: scenario.metrics.runway - base.metrics.runway,
    endingCash: scenario.metrics.endingCash - base.metrics.endingCash,
    annualRevenue: scenario.metrics.annualRevenue - base.metrics.annualRevenue,
    annualEbitda: scenario.metrics.annualEbitda - base.metrics.annualEbitda,
    headcount: scenario.metrics.endingHeadcount - base.metrics.endingHeadcount
  };
}

function calculateVariance(actual, budget, type = "expense") {
  const delta = actual - budget;
  const percent = budget === 0 ? 0 : delta / Math.abs(budget);
  const favorable = type === "revenue" ? delta >= 0 : delta <= 0;
  return { delta, percent, favorable, status: favorable ? "Favorable" : "Unfavorable" };
}

const varianceRows = [
  { account: "Subscription revenue", category: "Revenue", budget: 548000, actual: 526000, driver: "Enterprise renewal slipped", type: "revenue" },
  { account: "Services revenue", category: "Revenue", budget: 76000, actual: 83000, driver: "Two implementations accelerated", type: "revenue" },
  { account: "Payroll & benefits", category: "People", budget: 488000, actual: 512000, driver: "Sales hires started early", type: "expense" },
  { account: "Cloud infrastructure", category: "COGS", budget: 94000, actual: 101000, driver: "Usage grew ahead of plan", type: "expense" },
  { account: "Demand generation", category: "Sales & marketing", budget: 122000, actual: 108000, driver: "Campaign shifted to Q4", type: "expense" },
  { account: "Software & vendors", category: "G&A", budget: 47000, actual: 53000, driver: "Annual contract true-up", type: "expense" }
].map(row => ({ ...row, ...calculateVariance(row.actual,row.budget,row.type) }));

function buildRecommendation(base, scenario, label = "Proposed hiring plan") {
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

function formatCurrency(value, compact = true) {
  const sign = value < 0 ? "−" : "";
  const n = Math.abs(value);
  if (compact && n >= 1000000) return `${sign}$${(n/1000000).toFixed(2)}M`;
  if (compact && n >= 1000) return `${sign}$${Math.round(n/1000)}K`;
  return `${sign}$${Math.round(n).toLocaleString()}`;
}

function parseScenarioPrompt(prompt) {
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



const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const basePlan = calculatePlan();
let scenarioPlan = calculatePlan();
let currentView = "overview";
let lastRecommendation = buildRecommendation(basePlan, scenarioPlan, "Approved hiring plan");

const roles = [
  { role:"Enterprise Account Executive", dept:"Sales", start:"Apr", cost:174000, priority:"High", status:"Approved" },
  { role:"Senior Product Engineer", dept:"Product", start:"Apr", cost:201000, priority:"High", status:"Approved" },
  { role:"Customer Success Manager", dept:"Customer", start:"May", cost:132000, priority:"Medium", status:"Approved" },
  { role:"Demand Generation Manager", dept:"Marketing", start:"Jun", cost:146000, priority:"Medium", status:"Pending" },
  { role:"FP&A Analyst", dept:"Finance", start:"Jul", cost:128000, priority:"High", status:"Pending" }
];

const viewMeta = {
  overview:["NEXAFLOW · FY2026 PLAN","FP&A decision studio"],
  scenarios:["DRIVER-BASED PLANNING","Scenario lab"],
  workforce:["PEOPLE COSTS · FY2026","Workforce plan"],
  variance:["ACTUALS VS BUDGET","Variance review"],
  memos:["GOVERNED OUTPUTS","Decision memos"]
};

function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}

function toast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;$("#toast-region").append(el);setTimeout(()=>el.remove(),2800);}

function showView(name){
  currentView=name;
  $$(".app-view").forEach(view=>view.classList.toggle("active",view.id===`${name}-view`));
  $$(".nav-item").forEach(item=>item.classList.toggle("active",item.dataset.view===name));
  $("#view-eyebrow").textContent=viewMeta[name][0];$("#view-title").textContent=viewMeta[name][1];
  window.scrollTo({top:0,behavior:"smooth"});requestAnimationFrame(drawAllCharts);
}

function metricCard(label,value,note,kind="",tag="PLAN"){
  return `<article class="metric-card ${kind}"><div class="metric-label">${label}<span>${tag}</span></div><div class="metric-value">${value}</div><div class="metric-note ${kind==="featured"?"positive":kind}">${note}</div></article>`;
}

function renderOverview(){
  const m=basePlan.metrics;
  $("#metric-grid").innerHTML=[
    metricCard("Cash runway",`${m.runway.toFixed(1)} <small>months</small>`,`Above 12-month guardrail`,"featured","GUARDRAIL"),
    metricCard("Ending cash",formatCurrency(m.endingCash),"December 2026 · baseline","","FORECAST"),
    metricCard("Annual recurring revenue",formatCurrency(m.arr),"4.2% gross adds · 2.1% churn","positive","ARR"),
    metricCard("Approved headcount",m.endingHeadcount,"5 roles enter plan","","PEOPLE")
  ].join("");
  const guardrails=[
    ["Runway protection",Math.min(100,m.runway/15*100),`${m.runway.toFixed(1)} mo`],
    ["Gross margin",m.grossMargin*100,`${(m.grossMargin*100).toFixed(0)}%`],
    ["Minimum cash",Math.min(100,m.endingCash/2500000*100),formatCurrency(m.endingCash)],
    ["Forecast confidence",88,"88%"]
  ];
  $("#guardrails").innerHTML=guardrails.map(([label,pct,value])=>`<div class="guardrail-row"><span>${label}</span><div class="progress"><i style="width:${pct}%"></i></div><strong>${value}</strong></div>`).join("");
  const mini=varianceRows.slice(0,4);
  const max=Math.max(...mini.map(row=>Math.abs(row.delta)));
  $("#variance-mini").innerHTML=mini.map(row=>`<div class="mini-variance-row ${row.favorable?"positive-row":""}"><span>${row.account}</span><div class="mini-bar"><i style="width:${Math.abs(row.delta)/max*100}%"></i></div><strong class="${row.favorable?"positive":"negative"}">${formatCurrency(row.delta)}</strong></div>`).join("");
}

function readScenarioControls(){
  return {plannedHires:Number($("#hires").value),averageSalary:Number($("#salary").value),monthlyGrowth:Number($("#growth").value)/100,monthlyChurn:Number($("#churn").value)/100,hireStartMonth:Number($("#start-month").value)};
}

function setScenarioControls(values){
  if(values.plannedHires!=null)$("#hires").value=values.plannedHires;
  if(values.averageSalary!=null)$("#salary").value=values.averageSalary;
  if(values.monthlyGrowth!=null)$("#growth").value=values.monthlyGrowth*100;
  if(values.monthlyChurn!=null)$("#churn").value=values.monthlyChurn*100;
  if(values.hireStartMonth!=null)$("#start-month").value=values.hireStartMonth;
  updateScenario();
}

function updateScenario(){
  const values=readScenarioControls();scenarioPlan=calculatePlan(values);lastRecommendation=buildRecommendation(basePlan,scenarioPlan,"Working hiring scenario");
  $("#hires-output").value=values.plannedHires;$("#salary-output").value=`$${Math.round(values.averageSalary/1000)}K`;$("#growth-output").value=`${(values.monthlyGrowth*100).toFixed(1)}%`;$("#churn-output").value=`${(values.monthlyChurn*100).toFixed(1)}%`;$("#start-output").value=months[values.hireStartMonth];
  const delta=comparePlans(basePlan,scenarioPlan);
  const cards=[
    ["Runway",`${scenarioPlan.metrics.runway.toFixed(1)} mo`,`${delta.runway>=0?"+":""}${delta.runway.toFixed(1)} months`,delta.runway],
    ["Ending cash",formatCurrency(scenarioPlan.metrics.endingCash),formatCurrency(delta.endingCash),delta.endingCash],
    ["FY EBITDA",formatCurrency(scenarioPlan.metrics.annualEbitda),formatCurrency(delta.annualEbitda),delta.annualEbitda],
    ["Headcount",scenarioPlan.metrics.endingHeadcount,`${delta.headcount>=0?"+":""}${delta.headcount} vs plan`,delta.headcount===0?1:-delta.headcount]
  ];
  $("#comparison-grid").innerHTML=cards.map(([label,value,note,signal])=>`<article class="comparison-card"><span>${label}</span><strong>${value}</strong><small class="${signal>=0?"positive":"negative"}">${note}</small></article>`).join("");
  requestAnimationFrame(drawAllCharts);
}

function chartColors(){const s=getComputedStyle(document.documentElement);return{line:s.getPropertyValue("--line").trim(),muted:s.getPropertyValue("--muted").trim(),blue:s.getPropertyValue("--blue").trim(),mint:s.getPropertyValue("--mint").trim(),orange:s.getPropertyValue("--orange").trim(),text:s.getPropertyValue("--text").trim()};}

function setupCanvas(canvas,height){
  if(!canvas||canvas.offsetParent===null)return null;const rect=canvas.getBoundingClientRect();if(!rect.width)return null;const dpr=window.devicePixelRatio||1;canvas.width=rect.width*dpr;canvas.height=height*dpr;canvas.style.height=`${height}px`;const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w:rect.width,h:height};
}

function drawLineChart(canvas,series,height=280){
  const setup=setupCanvas(canvas,height);if(!setup)return;const{ctx,w,h}=setup,c=chartColors(),pad={l:38,r:20,t:15,b:28};const all=series.flatMap(s=>s.values);const min=Math.min(...all,0)*.92,max=Math.max(...all)*1.04,plotW=w-pad.l-pad.r,plotH=h-pad.t-pad.b;
  ctx.font="9px system-ui";ctx.fillStyle=c.muted;ctx.strokeStyle=c.line;ctx.lineWidth=1;
  for(let i=0;i<5;i++){const y=pad.t+i*plotH/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();const val=max-(max-min)*i/4;ctx.fillText(formatCurrency(val),0,y+3);}
  months.forEach((m,i)=>{if(i%2===0||w>700){const x=pad.l+i*plotW/11;ctx.fillText(m,x-7,h-7);}});
  series.forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=s.width||2.4;ctx.beginPath();s.values.forEach((v,i)=>{const x=pad.l+i*plotW/11,y=pad.t+(max-v)/(max-min)*plotH;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();});
  const threshold=750000,y=pad.t+(max-threshold)/(max-min)*plotH;if(y>pad.t&&y<h-pad.b){ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle=c.orange;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.restore();}
}

function drawVarianceChart(){
  const canvas=$("#variance-chart"),setup=setupCanvas(canvas,300);if(!setup)return;const{ctx,w,h}=setup,c=chartColors(),pad=32;const values=[62000,-22000,7000,-24000,-7000,14000,-6000,24000];const labels=["Budget","Sub rev","Services","Payroll","Cloud","Marketing","Vendors","Actual"];const max=90000,min=-20000,barW=Math.min(54,(w-pad*2)/values.length*.58),gap=(w-pad*2)/values.length;
  ctx.font="9px system-ui";ctx.textAlign="center";values.forEach((v,i)=>{const x=pad+i*gap+gap/2;const zero=h-52;const bh=Math.abs(v)/(max-min)*(h-90);const y=v>=0?zero-bh:zero;ctx.fillStyle=i===0||i===values.length-1?c.blue:v>=0?c.mint:c.orange;ctx.fillRect(x-barW/2,y,barW,bh);ctx.fillStyle=c.muted;ctx.fillText(labels[i],x,h-28);ctx.fillStyle=c.text;ctx.fillText(formatCurrency(v),x,v>=0?y-7:y+bh+13);});ctx.strokeStyle=c.line;ctx.beginPath();ctx.moveTo(pad,h-52);ctx.lineTo(w-pad,h-52);ctx.stroke();
}

function drawAllCharts(){
  const c=chartColors();drawLineChart($("#cash-chart"),[{values:basePlan.rows.map(r=>r.cash),color:c.blue},{values:scenarioPlan.rows.map(r=>r.cash),color:c.mint}],285);drawLineChart($("#scenario-chart"),[{values:basePlan.rows.map(r=>r.cash),color:c.blue},{values:scenarioPlan.rows.map(r=>r.cash),color:c.mint}],270);drawVarianceChart();
}

function renderWorkforce(filter=""){
  const shown=roles.filter(role=>`${role.role} ${role.dept}`.toLowerCase().includes(filter.toLowerCase()));const total=roles.reduce((sum,r)=>sum+r.cost,0),approved=roles.filter(r=>r.status==="Approved").reduce((sum,r)=>sum+r.cost,0);
  $("#workforce-summary").innerHTML=[
    ["Planned roles",roles.length,"3 approved · 2 pending"],["Annualized investment",formatCurrency(total),"Fully loaded cost"],["Approved investment",formatCurrency(approved),"Enters current forecast"],["Runway impact","−3.3 mo","If all roles begin on plan"]
  ].map(([l,v,n])=>`<article class="summary-card"><span>${l}</span><strong>${v}</strong><small>${n}</small></article>`).join("");
  $("#role-count").textContent=`${roles.length} planned roles`;
  $("#workforce-body").innerHTML=shown.map((r,i)=>`<tr><td><strong>${escapeHtml(r.role)}</strong><small>HC-${String(i+1).padStart(3,"0")}</small></td><td>${r.dept}</td><td>${r.start} 2026</td><td>${formatCurrency(r.cost)}</td><td><span class="tag ${r.priority.toLowerCase()}">${r.priority}</span></td><td><span class="tag ${r.status.toLowerCase()}">${r.status}</span></td><td><button class="row-action" data-role-index="${i}" aria-label="Delay ${escapeHtml(r.role)}">•••</button></td></tr>`).join("")||`<tr><td colspan="7">No roles match this search.</td></tr>`;
}

function renderVariance(){
  const revenueBudget=varianceRows.filter(r=>r.type==="revenue").reduce((s,r)=>s+r.budget,0),revenueActual=varianceRows.filter(r=>r.type==="revenue").reduce((s,r)=>s+r.actual,0),expenseDelta=varianceRows.filter(r=>r.type==="expense").reduce((s,r)=>s+r.delta,0);
  $("#variance-summary").innerHTML=[["Revenue",formatCurrency(revenueActual),`${formatCurrency(revenueActual-revenueBudget)} vs budget`],["EBITDA",formatCurrency(24000),"−$38K vs budget"],["Gross margin","80.8%","−0.7 pts vs budget"],["Expense variance",formatCurrency(expenseDelta),"Net expense movement"]].map(([l,v,n],i)=>`<article class="summary-card"><span>${l}</span><strong>${v}</strong><small class="${i===0||i===1?"negative":""}">${n}</small></article>`).join("");
  $("#variance-body").innerHTML=varianceRows.map(r=>`<tr><td><strong>${r.account}</strong><small>${r.category}</small></td><td>${formatCurrency(r.budget)}</td><td>${formatCurrency(r.actual)}</td><td class="${r.favorable?"positive":"negative"}">${formatCurrency(r.delta)}</td><td><span class="tag ${r.favorable?"approved":"high"}">${r.status}</span></td><td>${r.driver}</td></tr>`).join("");
  $("#commentary-list").innerHTML=varianceRows.filter(r=>Math.abs(r.delta)>=7000).slice(0,4).map(r=>`<div class="driver-item"><span class="${r.favorable?"positive":"negative"}">${formatCurrency(r.delta)} · ${r.status.toUpperCase()}</span><p>${r.driver}. ${r.account} closed ${Math.abs(r.percent*100).toFixed(1)}% ${r.actual>r.budget?"above":"below"} budget.</p><small>[VAR-${r.account.replace(/\W/g,"").slice(0,8).toUpperCase()}]</small></div>`).join("");
}

function renderMemo(){
  const r=lastRecommendation,d=comparePlans(basePlan,scenarioPlan);
  $("#memo-document").innerHTML=`<div class="memo-cover"><p class="eyebrow">NEXAFLOW · FINANCE DECISION MEMO</p><h2>Hiring affordability review</h2><p>Assessment of the working workforce plan against FY2026 liquidity guardrails.</p><div class="memo-meta"><div><span>Prepared for</span><strong>Executive leadership</strong></div><div><span>Model version</span><strong>FY2026 v3.2</strong></div><div><span>Evidence timestamp</span><strong>25 Aug 2026</strong></div></div><span class="decision-badge">${r.decision.toUpperCase()}</span></div><section class="memo-section"><h3>Executive conclusion</h3><p><strong>${r.headline}</strong> ${r.summary}</p></section><section class="memo-section"><h3>Recommended action</h3><p>${r.action}</p></section><section class="memo-section"><h3>Decision economics</h3><p>The working plan changes annual EBITDA by <strong>${formatCurrency(d.annualEbitda)}</strong>, ending cash by <strong>${formatCurrency(d.endingCash)}</strong>, and year-end headcount by <strong>${d.headcount>=0?"+":""}${d.headcount}</strong> relative to baseline.</p></section><section class="memo-section"><h3>Evidence used</h3><ul class="evidence-list">${r.evidence.map(e=>`<li>${e}</li>`).join("")}</ul></section><div class="memo-actions"><button class="primary" id="download-memo">Download memo</button><button class="ghost" id="copy-memo">Copy summary</button></div>`;
  $("#download-memo")?.addEventListener("click",()=>downloadText("nexaflow-hiring-decision-memo.txt",memoText()));$("#copy-memo")?.addEventListener("click",async()=>{await navigator.clipboard?.writeText(memoText());toast("Memo summary copied");});
}

function memoText(){return `NEXAFLOW — HIRING AFFORDABILITY REVIEW\nDecision: ${lastRecommendation.decision}\n\n${lastRecommendation.headline}\n${lastRecommendation.summary}\n\nRecommendation: ${lastRecommendation.action}\n\nEvidence:\n${lastRecommendation.evidence.join("\n")}`;}
function downloadText(name,text){const blob=new Blob([text],{type:"text/plain"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast(`${name} downloaded`);}

function openAI(){$("#ai-drawer").classList.add("open");$("#drawer-backdrop").classList.add("open");$("#ai-drawer").setAttribute("aria-hidden","false");setTimeout(()=>$("#ai-query").focus(),250);}
function closeAI(){$("#ai-drawer").classList.remove("open");$("#drawer-backdrop").classList.remove("open");$("#ai-drawer").setAttribute("aria-hidden","true");}

function answerAI(question){
  const q=question.toLowerCase();let answer,evidence;
  if(q.includes("8")&&q.includes("hire")){const plan=calculatePlan({plannedHires:8});const r=buildRecommendation(basePlan,plan,"Eight-hire scenario");answer=`${r.headline} ${r.action}`;evidence=r.evidence;}
  else if(q.includes("risk")){answer="The largest controllable runway risk is payroll timing: approved hiring cost enters before recurring-revenue growth fully compounds. A two-month hiring delay protects liquidity without reducing the approved role count.";evidence=[`Approved runway: ${basePlan.metrics.runway.toFixed(1)} months [MODEL-RUNWAY-01]`,`Planned hires: ${baseline.plannedHires} [ASSUMPTION-HC-01]`];}
  else if(q.includes("variance")||q.includes("september")){answer="September EBITDA finished $38K below budget. The largest pressures were a delayed enterprise renewal and early sales hiring, partly offset by lower demand-generation spend and accelerated services revenue.";evidence=["Subscription revenue: −$22K [VAR-SUBSCRIP]","Payroll: +$24K unfavorable [VAR-PAYROLL]","Marketing: $14K favorable [VAR-DEMANDGE]"];}
  else{answer=`The current working scenario produces ${scenarioPlan.metrics.runway.toFixed(1)} months of runway and ${formatCurrency(scenarioPlan.metrics.endingCash)} ending cash. ${lastRecommendation.action}`;evidence=lastRecommendation.evidence;}
  const box=document.createElement("div");box.className="ai-message";box.innerHTML=`<span>FINANCE AI · VERIFIED MODEL</span><p>${escapeHtml(answer)}</p><ul>${evidence.map(e=>`<li>${escapeHtml(e)}</li>`).join("")}</ul>`;$("#ai-conversation").append(box);box.scrollIntoView({behavior:"smooth"});
}

function submitAI(question){if(!question.trim())return;const user=document.createElement("div");user.className="user-message";user.innerHTML=`<p>${escapeHtml(question)}</p>`;$("#ai-conversation").append(user);answerAI(question);}

function buildPromptScenario(){
  const parsed=parseScenarioPrompt($("#scenario-prompt").value);if(!parsed.understood){$("#prompt-status").textContent="I couldn’t identify a supported driver. Try hires, churn, growth, or a hiring delay.";return;}
  setScenarioControls(parsed.overrides);$("#prompt-status").innerHTML=`Built <strong>${escapeHtml(parsed.label)}</strong>. All financial outputs were recalculated by the deterministic model.`;toast("AI scenario created as a temporary overlay");
}

function wireEvents(){
  $$("[data-view]").forEach(el=>el.addEventListener("click",()=>showView(el.dataset.view)));$$("[data-view-jump]").forEach(el=>el.addEventListener("click",()=>showView(el.dataset.viewJump)));
  ["#hires","#salary","#growth","#churn","#start-month"].forEach(id=>$(id).addEventListener("input",updateScenario));
  $("#reset-scenario").addEventListener("click",()=>{setScenarioControls(baseline);toast("Working scenario reset to baseline")});
  $("#run-prompt").addEventListener("click",buildPromptScenario);$("#scenario-prompt").addEventListener("keydown",e=>{if(e.key==="Enter")buildPromptScenario();});
  $$(".prompt-chips button").forEach(button=>button.addEventListener("click",()=>{$("#scenario-prompt").value=button.textContent;buildPromptScenario();}));
  $("#analyze-scenario").addEventListener("click",()=>{lastRecommendation=buildRecommendation(basePlan,scenarioPlan,"Working hiring scenario");renderMemo();openAI();submitAI("Analyze the current working scenario and recommend an action.");});
  $("#open-ai").addEventListener("click",openAI);$("#close-ai").addEventListener("click",closeAI);$("#drawer-backdrop").addEventListener("click",closeAI);
  $("#ai-form").addEventListener("submit",e=>{e.preventDefault();const q=$("#ai-query").value;submitAI(q);$("#ai-query").value="";});$$(".suggested-prompts button").forEach(button=>button.addEventListener("click",()=>submitAI(button.textContent)));
  $("#theme-toggle").addEventListener("click",()=>{document.documentElement.classList.toggle("light");requestAnimationFrame(drawAllCharts);});
  $("#role-search").addEventListener("input",e=>renderWorkforce(e.target.value));
  $("#add-role").addEventListener("click",()=>{roles.push({role:"Strategic Finance Associate",dept:"Finance",start:"Aug",cost:121000,priority:"Medium",status:"Draft"});renderWorkforce();toast("Draft role added outside the approved baseline");});
  $("#workforce-body").addEventListener("click",e=>{if(e.target.matches(".row-action"))toast("Role actions: delay, cancel, or move to scenario")});
  $("#generate-memo").addEventListener("click",()=>{showView("memos");renderMemo();toast("Management memo regenerated from governed outputs")});$("#new-memo").addEventListener("click",()=>{renderMemo();toast("Memo regenerated from current scenario")});
  $("#download-variance").addEventListener("click",()=>downloadText("september-variance-pack.csv",`Account,Budget,Actual,Variance,Favorability,Driver\n${varianceRows.map(r=>`"${r.account}",${r.budget},${r.actual},${r.delta},${r.status},"${r.driver}"`).join("\n")}`));
  $("#export-view").addEventListener("click",()=>downloadText(`runwayos-${currentView}-snapshot.txt`,`RunwayOS — ${viewMeta[currentView][1]}\nModel: NexaFlow FY2026 v3.2\nRunway: ${scenarioPlan.metrics.runway.toFixed(1)} months\nEnding cash: ${formatCurrency(scenarioPlan.metrics.endingCash)}\nAnnual EBITDA: ${formatCurrency(scenarioPlan.metrics.annualEbitda)}`));
  window.addEventListener("resize",drawAllCharts);
}

renderOverview();renderWorkforce();renderVariance();updateScenario();renderMemo();wireEvents();requestAnimationFrame(drawAllCharts);
