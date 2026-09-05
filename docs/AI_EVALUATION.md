# Evaluating AI usefulness

Automated checks verify mechanics, not whether a model discovers the best correlations. The integration verification uses a simulated executable and an isolated database; it makes no paid model calls. Do not report those results as a model-quality benchmark.

For a real comparison, use the synthetic scenarios in AI_TEST_DATA.md. Compare a preserved legacy report with a new macro report for the same scope and selected lenses. Separately compare macro reports from original and manually accepted improved notes. Keep the provider configuration fixed, review the selected excerpts, and note any differences in coverage. Use more than one scenario, including Aurora's false-positive control and bridges between projects with different object names.

Classify each finding manually as supported, useful, and/or repeated. Record expected signals and how many were found. A valid source ID or exact quote alone does not establish that a conclusion is supported. Do not count paraphrased repetitions as new useful discoveries.

Create a ratings JSON file:

```json
{
  "baseline": {
    "runId": "existing-legacy-run-id",
    "usefulFindingIds": [],
    "supportedFindingIds": [],
    "repeatedFindingIds": [],
    "expectedSignals": 5,
    "foundSignals": 0
  },
  "candidate": {
    "runId": "new-macro-run-id",
    "usefulFindingIds": [],
    "supportedFindingIds": [],
    "repeatedFindingIds": [],
    "expectedSignals": 5,
    "foundSignals": 0
  }
}
```

Replace the example values with actual IDs and assessments; the zeros above are placeholders, not benchmark results. Run `pnpm compare:ai <ratings.json>` against the appropriate `STAFF_CHIEF_DATA_DIR`. This read-only command reports useful findings, precision, signal recall, false positives, repetition, latency and source coverage. It never starts an analysis.

For the draft assistant, record suggestions accepted, rejected and corrected, plus semantic changes noticed during review. Quality comparison remains a human evaluation; no improvement percentage is claimed by the implementation.
