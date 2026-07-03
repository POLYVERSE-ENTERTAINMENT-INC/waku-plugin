#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const projectDir = path.resolve(flag("--project-dir", process.cwd()));
const siteDir = path.resolve(projectDir, flag("--site-dir", "public"));
const screenshot = path.resolve(projectDir, flag("--screenshot", "waku-visual-check.png"));
const visualReport = path.resolve(projectDir, flag("--visual-report", "waku-visual-report.json"));
const conformanceReport = path.resolve(projectDir, flag("--conformance-report", "waku-conformance-report.json"));
const gateReport = path.resolve(projectDir, flag("--report", "waku-create-gate-report.json"));
const attempt = Number(flag("--attempt", "1"));
const maxAttempts = Number(flag("--max-attempts", "3"));
const pluginRoot = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const visualCheck = path.join(pluginRoot, "scripts", "waku-visual-check.mjs");
const conformanceCheck = path.join(pluginRoot, "scripts", "waku-conformance-check.mjs");
const steps = [];
const rerunCommand = [
  "node",
  shellQuote(new URL(import.meta.url).pathname),
  "--project-dir",
  shellQuote(projectDir),
  "--site-dir",
  shellQuote(path.relative(projectDir, siteDir) || "."),
  "--screenshot",
  shellQuote(path.relative(projectDir, screenshot) || path.basename(screenshot)),
  "--visual-report",
  shellQuote(path.relative(projectDir, visualReport) || path.basename(visualReport)),
  "--conformance-report",
  shellQuote(path.relative(projectDir, conformanceReport) || path.basename(conformanceReport)),
  "--report",
  shellQuote(path.relative(projectDir, gateReport) || path.basename(gateReport)),
  "--attempt",
  String(Math.min(attempt + 1, maxAttempts)),
  "--max-attempts",
  String(maxAttempts),
].join(" ");

if (!fs.existsSync(path.join(projectDir, "package.json"))) {
  die(`Missing package.json in ${projectDir}. Waku create must scaffold the bundled session template first.`);
}

if (!fs.existsSync(visualCheck)) {
  die(`Missing visual gate script: ${visualCheck}`);
}

if (!fs.existsSync(conformanceCheck)) {
  die(`Missing conformance gate script: ${conformanceCheck}`);
}

console.error("[waku-create-gate] running npm run test...");
runStep({
  name: "test",
  command: "npm",
  args: ["run", "test"],
  cwd: projectDir,
  failureReport: null,
});

console.error("[waku-create-gate] running template conformance gate...");
runStep({
  name: "conformance",
  command: process.execPath,
  args: [conformanceCheck, "--source-dir", projectDir, "--site-dir", siteDir, "--report", conformanceReport],
  cwd: projectDir,
  failureReport: conformanceReport,
});

console.error("[waku-create-gate] running mobile visual host-chrome gate...");
runStep({
  name: "visual",
  command: process.execPath,
  args: [visualCheck, "--site-dir", siteDir, "--screenshot", screenshot, "--report", visualReport],
  cwd: projectDir,
  failureReport: visualReport,
});

const successReport = createReport({ ok: true, failedStep: null });
writeGateReport(successReport);
console.log(JSON.stringify({
  ok: true,
  projectDir,
  siteDir,
  gateReport,
  conformanceReport,
  screenshot,
  visualReport,
}, null, 2));

function flag(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function runStep(step) {
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const summary = {
    name: step.name,
    ok: result.status === 0,
    status: result.status ?? 1,
    command: [step.command, ...step.args],
    report: step.failureReport,
  };
  steps.push(summary);

  if (result.status !== 0) {
    const failedReport = createReport({ ok: false, failedStep: summary });
    writeGateReport(failedReport);
    console.error(`[waku-create-gate] ${step.name} failed.`);
    console.error(`[waku-create-gate] Report: ${gateReport}`);
    for (const action of failedReport.next_actions) {
      console.error(`[waku-create-gate] next ${action.priority}: ${action.action}`);
    }
    process.exit(result.status ?? 1);
  }
}

function createReport({ ok, failedStep }) {
  const childReport = failedStep?.report ? readJsonIfExists(failedStep.report) : null;
  return {
    ok,
    gate: "waku-create",
    projectDir,
    siteDir,
    reportPath: gateReport,
    checkedAt: new Date().toISOString(),
    attempt,
    maxAttempts,
    repair_protocol: {
      maxAttempts,
      currentAttempt: attempt,
      stopWhen: "All steps pass.",
      blockerWhen: `The same failure remains after ${maxAttempts} repair attempts or the report identifies an external blocker.`,
      loop: [
        "Read this create gate report and any child report referenced by failedStep.report.",
        "Apply the first unresolved next_actions item in priority order.",
        "Rerun the same create gate command before previewing, uploading, publishing, or handing off.",
      ],
    },
    steps,
    failedStep,
    childReport,
    childReports: {
      conformance: conformanceReport,
      visual: visualReport,
      screenshot,
    },
    next_actions: ok ? [] : createNextActions(failedStep, childReport),
  };
}

function createNextActions(failedStep, childReport) {
  if (!failedStep) return [];
  if (failedStep.name === "test") {
    return [{
      priority: 1,
      code: "create.test-failed",
      action: "Fix the npm test failure before running conformance or visual checks.",
      fix: "Read the test output above, repair TypeScript/runtime-contract/build errors, then rerun the create gate.",
      evidence: { step: failedStep.name, status: failedStep.status },
      rerun: { command: rerunCommand },
    }];
  }

  const childActions = Array.isArray(childReport?.next_actions) ? childReport.next_actions : [];
  if (childActions.length) {
    return childActions.map((action, index) => ({
      priority: index + 1,
      code: action.code,
      action: action.action,
      fix: action.fix,
      evidence: action.evidence ?? {},
      childReport: failedStep.report,
      rerun: { command: rerunCommand },
    }));
  }

  return [{
    priority: 1,
    code: `create.${failedStep.name}-failed`,
    action: `Fix the failed ${failedStep.name} gate, then rerun the create gate.`,
    fix: failedStep.report ? `Open ${failedStep.report} for details.` : "Read the command output above for details.",
    evidence: { step: failedStep.name, status: failedStep.status, report: failedStep.report },
    rerun: { command: rerunCommand },
  }];
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeGateReport(report) {
  fs.writeFileSync(gateReport, `${JSON.stringify(report, null, 2)}\n`);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function die(message) {
  console.error(`[waku-create-gate] ${message}`);
  process.exit(1);
}
