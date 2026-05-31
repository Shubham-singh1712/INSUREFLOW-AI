# Implementation Plan — Gemini Claim Extraction Schema Alignment and OpenRouter 402 Fix

This plan details the integration of the user's target schema fields into the LLM direct extraction pipeline and addresses the OpenRouter 402 Payment Required error by using a free-tier model.

---

## User Review Required

> [!IMPORTANT]
> **Using Llama-3.3-70b free tier on OpenRouter:** We are configuring the fallback model to default to `meta-llama/llama-3.3-70b-instruct:free` with `max_tokens: 2048`. This ensures no credit limits or payment failures block our API requests.
>
> **Extracted cost evidence mapping:** We will extract `total_expected_cost` and `total_expected_cost_evidence` (the exact text snippet). The evidence string will be mapped to the `raw` property of the financial traceable fields in the UI.

---

## Proposed Changes

### 1. OpenRouter Integration and Prompt Enhancement
#### [MODIFY] [node-bridge.ts](file:///c:/Users/SHUBHAM/OneDrive/Documents/INFLOW/insureflowai/src/lib/claim-processing/node-bridge.ts)
* Update `runLlmExtraction` prompt and schema to request all of the target schema fields:
  * `patient_age` (number or null)
  * `gender` ("Male", "Female", or null)
  * `tpa_name` (string)
  * `tpa_id_number` (string)
  * `provisional_diagnosis` (string)
  * `total_expected_cost` (number or null)
  * `total_expected_cost_evidence` (string - exact text block containing the cost details)
  * `has_aadhaar` (boolean)
  * `has_pan` (boolean)
* Update the fetch body to explicitly pass:
  * `"model": process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free"`
  * `"max_tokens": 2048`

### 2. Entity Mapping and Field Parsing
#### [MODIFY] [extraction.ts](file:///c:/Users/SHUBHAM/OneDrive/Documents/INFLOW/insureflowai/src/lib/claim-processing/extraction.ts)
* Parse the new LLM-extracted fields in `extractEntities` when `pythonResult` (the LLM output) is present:
  * Map `patient_age` to `extracted.patient.age`
  * Map `gender` to `extracted.patient.gender`
  * Map `tpa_name` to `extracted.insurance.tpa_name`
  * Map `tpa_id_number` to `extracted.insurance.member_id`
  * Map `provisional_diagnosis` to `extracted.clinical.diagnosis`
  * Map `total_expected_cost` to `extracted.financial.total_claimed` and `extracted.financial.final_bill`
  * Map `total_expected_cost_evidence` to the `raw` property of `extracted.financial.total_claimed` and `extracted.financial.final_bill`
* Ensure safe numeric/float parsing (converting cost and age values appropriately).

### 3. Document Checklist Integration
#### [MODIFY] [document-checklist.ts](file:///c:/Users/SHUBHAM/OneDrive/Documents/INFLOW/insureflowai/src/lib/claim-processing/document-checklist.ts)
* Update `buildDocumentChecklist` to accept an optional `llmResult` parameter containing `{ has_aadhaar?: boolean; has_pan?: boolean }`.
* If `llmResult?.has_aadhaar` is true, force `present: true` for the Aadhaar card checklist item.
* If `llmResult?.has_pan` is true, force `present: true` for the PAN card checklist item.

#### [MODIFY] [pipeline.ts](file:///c:/Users/SHUBHAM/OneDrive/Documents/INFLOW/insureflowai/src/lib/claim-processing/pipeline.ts)
* Pass the `llmResult` object to `buildDocumentChecklist(finalPages, llmResult)` so that LLM document verification flags are fed directly into the checklist builder.

---

## Verification Plan

### Automated / Integration Verification
* Run the standalone test pipeline harness:
  ```powershell
  npx tsx scratch/test-pipeline.ts
  ```
* Verify that:
  1. The OpenRouter request completes successfully (no 402 error, using Llama-3.3-70b-instruct:free).
  2. The extracted fields match the new schema structure.
  3. Aadhaar and PAN cards are correctly identified as present if found by the LLM.
  4. Financial fields contain the exact evidence text snippet in their `raw` property.
