import fs from 'fs';
import path from 'path';
import { ClaimPacket, ClaimSession, ValidationError, RepairSuggestion, PageText, ClassifiedPage } from './types';
import { extractPdfTextFirst } from './pdf';
import { classifyPages } from './classification';
import { saveClaimState } from './db';
import { logger } from './logger';
import { calculateLifecycleStatus } from '@/lib/claimLifecycle';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Folder-relative select filename helper
function selectDemoFilename(fileName: string, pageCount: number, pathCategory: 'green' | 'yellow' | 'red'): string {
  const name = fileName.toLowerCase();
  const folder = pathCategory === 'green' ? 'healthy' : pathCategory === 'yellow' ? 'review' : 'high-risk';

  // 1. Keyword-based matching
  if (name.includes('apollo') && (name.includes('cardio') || name.includes('cashless') || name.includes('preauth'))) {
    return `${folder}/Apollo_Cashless_Cardiology_PreAuth.json`;
  }
  if (name.includes('fortis') && (name.includes('general') || name.includes('surgery'))) {
    return `${folder}/Fortis_General_Surgery_Claim.json`;
  }
  if (name.includes('kims') || name.includes('orthopedic')) {
    return `${folder}/KIMS_Orthopedic_Review_Case.json`;
  }
  if (name.includes('care') && name.includes('maternity')) {
    return `${folder}/CARE_Maternity_Pending_Claim.json`;
  }
  if (name.includes('aiims') && (name.includes('oncology') || name.includes('highrisk') || name.includes('high-risk'))) {
    return `${folder}/AIIMS_HighRisk_Oncology_Claim.json`;
  }
  if (name.includes('emergency') || name.includes('critical') || name.includes('dispute')) {
    return `${folder}/Emergency_Critical_Care_Dispute.json`;
  }

  // Fallbacks by page count
  if (pathCategory === 'green') {
    if (pageCount <= 2) return 'healthy/HDFC_Ergo_Hernia_Claim.json';
    if (pageCount <= 4) return 'healthy/CARE_Maternity_Claim.json';
    return 'healthy/Apollo_Cashless_Cardiology_PreAuth.json';
  } else if (pathCategory === 'yellow') {
    if (pageCount <= 2) return 'review/Star_Health_Dental_Claim.json';
    if (pageCount <= 4) return 'review/Max_Healthcare_Appendectomy_Claim.json';
    return 'review/KIMS_Orthopedic_Review_Case.json';
  } else {
    if (pageCount <= 2) return 'high-risk/Kokilaben_Neurology_Claim.json';
    if (pageCount <= 4) return 'high-risk/Emergency_Critical_Care_Dispute.json';
    return 'high-risk/AIIMS_HighRisk_Oncology_Claim.json';
  }
}

export async function processDemoClaimPipeline(
  buffer: Buffer,
  session: ClaimSession
): Promise<ClaimPacket> {
  const { claimId } = session;
  logger.info('DEMO_PIPELINE', `Starting Smart Demo Pipeline for claim ${claimId}`);

  // 1. UPLOADED -> PROCESSING (600ms)
  await saveClaimState(claimId, 'PROCESSING');
  await sleep(600);

  // 2. Perform lightweight real analysis
  let pageCount = 5;
  let textPages: PageText[] = [];
  let source = 'scanned';
  try {
    const parsed = await extractPdfTextFirst(buffer);
    pageCount = parsed.pageCount;
    textPages = parsed.pages;
    source = parsed.source;
  } catch (err) {
    logger.warn('DEMO_PIPELINE', 'Failed to extract PDF text, using default page count 5');
    textPages = Array.from({ length: 5 }, (_, i) => ({
      page: i + 1,
      text: '',
      method: 'ocr' as const,
      confidence: 0
    }));
  }

  const fileSize = buffer.length;
  const combinedText = textPages.map(p => p.text).join('\n\n');
  const isScanned = combinedText.trim().length < 180;
  const ocrAttempt = isScanned ? 'scanned_ocr' : 'native_text';

  // Run page classification
  let classifiedPages: ClassifiedPage[] = [];
  try {
    classifiedPages = classifyPages(textPages);
  } catch (err) {
    classifiedPages = Array.from({ length: pageCount }, (_, i) => ({
      page: i + 1,
      type: (i === 0 ? 'preauth' : i === 1 ? 'invoice' : 'clinical note'),
      confidence: 90
    }));
  }

  // Check required and optional fields via keyword detection
  const text = combinedText.toLowerCase();
  const detected = {
    // Required
    patientName: /\b(patient\s*name|name\s*of\s*patient|mr\.|ms\.|mrs\.|insured\s*person)\b/i.test(text),
    policyNumber: /\b(policy\s*(number|no|#)|member\s*(id|no|#)|card\s*id|tpa\s*(id|no|#))\b/i.test(text),
    diagnosis: /\b(diagnosis|provisional\s*diagnosis|illness|disease|condition|c\/o)\b/i.test(text),
    admissionDate: /\b(admission\s*(date|dt)|date\s*of\s*admission|doa|admitted)\b/i.test(text),
    dischargeDate: /\b(discharge\s*(date|dt)|date\s*of\s*discharge|dod|discharged)\b/i.test(text),
    hospitalName: /\b(hospital\s*(name|facility)|facility\s*name|name\s*of\s*hospital|nursing\s*home)\b/i.test(text),
    doctorName: /\b(doctor|physician|treating\s*(doctor|physician)|dr\.)\b/i.test(text),

    // Optional
    icdCodes: /\b(icd\s*(10|codes?|-10))\b/i.test(text),
    signatures: /\b(signature|signed|sign\s*here|h हस्ताक्षर)\b/i.test(text),
    hospitalSeal: /\b(seal|stamp|hospital\s*seal|hospital\s*stamp)\b/i.test(text),
    authorization: /\b(authori[sz]ation|pre[-\s]?auth|cashless\s*approval)\b/i.test(text),
    financialBreakdown: /\b(room\s*rent|icu|medicine|investigations|bill|invoice|professional\s*fees|charge)\b/i.test(text),
  };

  // Determine discharge summary presence from classifications
  const hasDischargeSummaryDoc = classifiedPages.some(p => p.type === 'discharge summary') || /\b(discharge\s*summary)\b/i.test(text);

  // Generate completeness score (Required: 10 each = max 70, Optional: 6 each = max 30)
  const reqFields = ['patientName', 'policyNumber', 'diagnosis', 'admissionDate', 'dischargeDate', 'hospitalName', 'doctorName'] as const;
  const reqScore = reqFields.reduce((sum, f) => sum + (detected[f] ? 10 : 0), 0);

  const optFields = ['icdCodes', 'signatures', 'hospitalSeal', 'authorization', 'financialBreakdown'] as const;
  const optScore = optFields.reduce((sum, f) => sum + (detected[f] ? 6 : 0), 0);

  const completenessScore = reqScore + optScore;

  // Presenter Mode Override Logic
  const presenterMode = process.env.NEXT_PUBLIC_DEMO_PRESENTER_MODE === 'true';
  const nameInput = session.originalFileName.toLowerCase();

  let pathCategory: 'green' | 'yellow' | 'red';
  if (presenterMode && (nameInput.includes('approved') || nameInput.includes('healthy') || nameInput.includes('green'))) {
    pathCategory = 'green';
  } else if (presenterMode && (nameInput.includes('pending') || nameInput.includes('review') || nameInput.includes('yellow') || nameInput.includes('hold'))) {
    pathCategory = 'yellow';
  } else if (presenterMode && (nameInput.includes('rejected') || nameInput.includes('highrisk') || nameInput.includes('red') || nameInput.includes('dispute') || nameInput.includes('fail'))) {
    pathCategory = 'red';
  } else {
    // Normal Demo Mode: derive scenario path from actual completeness score
    if (completenessScore >= 80) {
      pathCategory = 'green';
    } else if (completenessScore >= 50) {
      pathCategory = 'yellow';
    } else {
      pathCategory = 'red';
    }
  }

  logger.info('DEMO_PIPELINE', `Scenario routed: ${pathCategory.toUpperCase()} PATH (Completeness: ${completenessScore}%, PresenterMode: ${presenterMode})`);

  // Load the corresponding mock template JSON packet
  const selectedFile = selectDemoFilename(session.originalFileName, pageCount, pathCategory);
  let mockPacket: any;
  try {
    const filePath = path.join(process.cwd(), 'src', 'demo-data', selectedFile);
    const content = fs.readFileSync(filePath, 'utf8');
    mockPacket = JSON.parse(content);
  } catch (err: any) {
    logger.error('DEMO_PIPELINE', `Failed to load template ${selectedFile}, falling back`, err);
    const fallbackPath = path.join(
      process.cwd(),
      'src',
      'demo-data',
      pathCategory === 'green' ? 'healthy' : pathCategory === 'yellow' ? 'review' : 'high-risk',
      pathCategory === 'green'
        ? 'Apollo_Cashless_Cardiology_PreAuth.json'
        : pathCategory === 'yellow'
        ? 'KIMS_Orthopedic_Review_Case.json'
        : 'AIIMS_HighRisk_Oncology_Claim.json'
    );
    mockPacket = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  }

  // Override template identifiers
  mockPacket.claimId = claimId;
  mockPacket.uploadSessionId = session.uploadSessionId;
  mockPacket.pageCount = pageCount;
  mockPacket.intake = session;

  // Dynamic Validation Errors and Repair Suggestions
  const validationErrors: ValidationError[] = [];
  const repairSuggestions: RepairSuggestion[] = [];

  // Build the checklist report
  const items = [
    { id: 'preauth_form', label: 'Pre-Authorization Form', required: true, present: detected.authorization || pathCategory === 'green', page: 1, confidence: 95 },
    { id: 'insurance_card_member', label: 'Insurance / TPA Membership Card', required: true, present: detected.policyNumber || pathCategory === 'green', page: 1, confidence: 95 },
    { id: 'aadhaar_card', label: 'Aadhaar Card', required: true, present: pathCategory !== 'red', page: 3, confidence: 95 },
    { id: 'pan_card', label: 'PAN Card', required: true, present: pathCategory === 'green', page: 4, confidence: 95 },
    { id: 'clinical_note_doctor', label: "Doctor's Clinical Note", required: true, present: detected.doctorName || pathCategory === 'green', page: 2, confidence: 95 },
    { id: 'policy_schedule', label: 'Insurance Policy Schedule', required: false, present: pathCategory === 'green', page: 5, confidence: 90 }
  ];

  const missingRequired = items.filter(i => i.required && !i.present).map(i => i.id);
  const documentChecklist = {
    items,
    allRequiredPresent: missingRequired.length === 0,
    missingRequired
  };

  // Base score starting point
  let claimHealth = 100;

  // Check required demographic and request fields
  if (!detected.patientName && pathCategory !== 'green') {
    claimHealth -= 15;
    validationErrors.push({
      field: 'patient.full_name',
      issue: 'Patient name was not detected in demographics block.',
      severity: 'critical',
      pages: [1],
      suggestedAction: 'Please enter the patient\'s full name manually.'
    });
    repairSuggestions.push({
      fieldId: 'patient.full_name',
      suggestion: 'Manually enter patient name.',
      confidence: 85,
      reason: 'Name field is blank or failed OCR.'
    });
    mockPacket.extractedFields.patient.full_name.value = null;
    mockPacket.extractedFields.patient.full_name.confidence = 0;
  }

  if (!detected.policyNumber && pathCategory !== 'green') {
    claimHealth -= 15;
    validationErrors.push({
      field: 'insurance.policy_number',
      issue: 'Insurance Policy Number / Member ID was not found in document.',
      severity: 'critical',
      pages: [1],
      suggestedAction: 'Please enter the policy number from the health card.'
    });
    repairSuggestions.push({
      fieldId: 'insurance.policy_number',
      suggestion: 'Input policy number manually.',
      confidence: 85,
      reason: 'Policy number missing.'
    });
    mockPacket.extractedFields.insurance.policy_number.value = null;
    mockPacket.extractedFields.insurance.policy_number.confidence = 0;
  }

  if (!detected.diagnosis && pathCategory !== 'green') {
    claimHealth -= 15;
    validationErrors.push({
      field: 'clinical.diagnosis',
      issue: 'Primary diagnosis is missing in clinical summary.',
      severity: 'critical',
      pages: [1],
      suggestedAction: 'Please enter the primary admitting diagnosis.'
    });
    mockPacket.extractedFields.clinical.diagnosis.value = null;
    mockPacket.extractedFields.clinical.diagnosis.confidence = 0;
  }

  if (!detected.admissionDate && pathCategory !== 'green') {
    claimHealth -= 15;
    validationErrors.push({
      field: 'hospital.admission_date',
      issue: 'Admission Date is missing.',
      severity: 'critical',
      pages: [1],
      suggestedAction: 'Please enter the date of admission.'
    });
    mockPacket.extractedFields.hospital.admission_date.value = null;
    mockPacket.extractedFields.hospital.admission_date.confidence = 0;
  }

  if (!detected.dischargeDate && pathCategory !== 'green') {
    claimHealth -= 10;
    validationErrors.push({
      field: 'hospital.discharge_date',
      issue: 'Discharge Date is missing.',
      severity: 'high',
      pages: [1],
      suggestedAction: 'Please enter the date of discharge.'
    });
    mockPacket.extractedFields.hospital.discharge_date.value = null;
    mockPacket.extractedFields.hospital.discharge_date.confidence = 0;
  }

  // Dynamic Yellow Path Additions
  if (pathCategory === 'yellow') {
    // Missing discharge summary
    claimHealth -= 10;
    validationErrors.push({
      field: 'documents.discharge_summary',
      issue: 'Missing required document: Discharge Summary. The hospital relief and billing summary was not detected in the document stream.',
      severity: 'high',
      pages: [],
      suggestedAction: 'Upload the treating doctor\'s signed Discharge Summary showing final outcomes and discharge vitals.'
    });
    repairSuggestions.push({
      fieldId: 'documents.discharge_summary',
      suggestion: 'Upload treating doctor\'s signed Discharge Summary.',
      confidence: 85,
      reason: 'Discharge summary confirmation required.'
    });

    // Missing hospital stamp/seal
    claimHealth -= 8;
    mockPacket.extractedFields.authorization.hospital_seal.value = false;
    mockPacket.extractedFields.authorization.hospital_seal.confidence = 0;
    validationErrors.push({
      field: 'authorization.hospital_seal',
      issue: 'Hospital seal or stamp was not detected on page 1 of Preauth form',
      severity: 'high',
      pages: [1],
      suggestedAction: 'Affix the official hospital stamp and signature in Part B, then re-upload or mark verified if physically checked.'
    });
    repairSuggestions.push({
      fieldId: 'authorization.hospital_seal',
      suggestion: 'Hospital Seal missing. Mark Verified if verified offline.',
      confidence: 80,
      reason: 'The seal block is empty. Hospital desk seal validation required.'
    });

    // Missing signatures
    if (!detected.signatures) {
      claimHealth -= 10;
      mockPacket.extractedFields.authorization.patient_signature.value = false;
      mockPacket.extractedFields.authorization.patient_signature.confidence = 0;
      validationErrors.push({
        field: 'authorization.patient_signature',
        issue: 'Patient signature missing or not detected on Preauth form page 1.',
        severity: 'medium',
        pages: [1],
        suggestedAction: 'Please ensure the patient has signed the cashless authorization declaration.'
      });
    }
  }

  // Dynamic Red Path Additions
  if (pathCategory === 'red') {
    // Missing DOB
    claimHealth -= 15;
    mockPacket.extractedFields.patient.dob.value = null;
    mockPacket.extractedFields.patient.dob.confidence = 0;
    validationErrors.push({
      field: 'patient.dob',
      issue: 'Patient Date of Birth is missing from demographics',
      severity: 'critical',
      pages: [1],
      suggestedAction: 'Please enter patient\'s Date of Birth from Aadhaar or policy schedule.'
    });
    repairSuggestions.push({
      fieldId: 'patient.dob',
      suggestion: 'Manually input DOB from policy certificate.',
      confidence: 90,
      reason: 'Demographics block is incomplete.'
    });

    // Missing Aadhaar
    claimHealth -= 10;
    validationErrors.push({
      field: 'documents.aadhaar_card',
      issue: 'Missing required document: Aadhaar Card. Govt-mandated KYC ID proof not detected.',
      severity: 'critical',
      pages: [],
      suggestedAction: 'Upload the patient\'s Aadhaar card (front and back) to resolve the KYC check.'
    });

    // Length of Stay (LOS) Mismatch
    claimHealth -= 15;
    mockPacket.extractedFields.clinical.length_of_stay.value = 12; // Inject failure mismatch!
    validationErrors.push({
      field: 'clinical.length_of_stay',
      issue: 'Chronological inconsistency: Length of Stay (12 days) exceeds the duration between Admission and Discharge dates (3 days)',
      severity: 'critical',
      pages: [1, 4],
      suggestedAction: 'Resolve length of stay discrepancy in clinical summary.'
    });

    // Billing Mismatch
    claimHealth -= 20;
    mockPacket.extractedFields.financial.final_bill.value = 537000; // Inject failure mismatch!
    validationErrors.push({
      field: 'financial.final_bill',
      issue: 'Math validation failed: Billed item totals sum to INR 352,000, which does not match final bill INR 537,000',
      severity: 'high',
      pages: [2],
      suggestedAction: 'Correct the itemized charges to match the total final bill amount.'
    });

    // Missing treating doctor signature
    claimHealth -= 10;
    mockPacket.extractedFields.authorization.doctor_signature.value = false;
    mockPacket.extractedFields.authorization.doctor_signature.confidence = 0;
    validationErrors.push({
      field: 'authorization.doctor_signature',
      issue: 'Treating Physician signature missing on page 4 clinical report',
      severity: 'critical',
      pages: [4],
      suggestedAction: 'Obtain doctor\'s digital or physical signature on the clinical note.'
    });
    repairSuggestions.push({
      fieldId: 'authorization.doctor_signature',
      suggestion: 'Upload signed doctor clinical referral sheet.',
      confidence: 65,
      reason: 'Signature line is blank.'
    });
  }

  // Enforce score constraints
  if (pathCategory === 'green') {
    claimHealth = Math.min(100, Math.max(85, claimHealth));
  } else if (pathCategory === 'yellow') {
    claimHealth = Math.min(80, Math.max(55, claimHealth));
  } else {
    claimHealth = Math.min(50, Math.max(20, claimHealth));
  }

  // Calculate readiness score
  const requiredFieldsPopulated = [
    mockPacket.extractedFields.patient.full_name.value,
    mockPacket.extractedFields.insurance.policy_number.value,
    mockPacket.extractedFields.clinical.diagnosis.value,
    mockPacket.extractedFields.hospital.admission_date.value,
    mockPacket.extractedFields.hospital.discharge_date.value,
    mockPacket.extractedFields.hospital.facility_name.value,
    mockPacket.extractedFields.hospital.doctor_name.value,
  ];
  const presentReqCount = requiredFieldsPopulated.filter(Boolean).length;
  let readiness = Math.round((presentReqCount / 7) * 100);

  if (pathCategory === 'green') {
    readiness = Math.min(100, Math.max(85, readiness));
  } else if (pathCategory === 'yellow') {
    readiness = Math.min(80, Math.max(50, readiness));
  } else {
    readiness = Math.min(50, Math.max(20, readiness));
  }

  const rejectionRisk = pathCategory === 'green' ? 'low' : pathCategory === 'yellow' ? 'medium' : 'high';
  const finalState = calculateLifecycleStatus({
    validationIssueCount: validationErrors.length,
    readinessScore: readiness,
    threshold: 0,
  });

  // Apply scores
  mockPacket.claimHealth = claimHealth;
  mockPacket.readiness = readiness;
  mockPacket.ocrConfidence = pathCategory === 'green' ? 95 : pathCategory === 'yellow' ? 82 : 55;
  mockPacket.extractionConfidence = mockPacket.ocrConfidence - 3;
  mockPacket.rejectionRisk = rejectionRisk;
  mockPacket.state = finalState;
  mockPacket.validationErrors = validationErrors;
  mockPacket.repairSuggestions = repairSuggestions;
  mockPacket.documentChecklist = documentChecklist;

  // Build dynamic, high-fidelity audit trail logs relative to now
  const now = Date.now();
  const auditLogs = [
    { stage: 'UPLOADED', timestamp: new Date(now - 120000).toISOString(), message: `PDF document uploaded: ${session.originalFileName} (${fileSize} bytes)` },
    { stage: 'PROCESSING', timestamp: new Date(now - 100000).toISOString(), message: `Smart analyzer running native text extraction. Pages identified: ${pageCount}.` },
    { stage: 'OCR_COMPLETE', timestamp: new Date(now - 80000).toISOString(), message: `OCR complete. Layer source: ${ocrAttempt}. Confidence: ${mockPacket.ocrConfidence}%.` },
    { stage: 'CLASSIFIED', timestamp: new Date(now - 60000).toISOString(), message: `Classified pages: ${classifiedPages.map(p => `${p.type} (p.${p.page})`).join(', ')}` },
    { stage: 'EXTRACTED', timestamp: new Date(now - 40000).toISOString(), message: `Completeness assessed: ${completenessScore}%. Routed to ${pathCategory.toUpperCase()} PATH.` }
  ];

  auditLogs.push({
    stage: finalState,
    timestamp: new Date(now - 20000).toISOString(),
    message:
      validationErrors.length > 0
        ? `Validation flagged ${validationErrors.length} issues (rejection risk: ${rejectionRisk.toUpperCase()}).`
        : 'AI checks completed. No issues found. Claim moved directly to the submission queue.',
  });

  mockPacket.auditLogs = auditLogs;

  // Simulate progress transition delays in the DB
  // 1. PROCESSING (600ms) - already done above
  // 2. PROCESSING -> OCR COMPLETE (1000ms)
  await saveClaimState(claimId, 'OCR_COMPLETE', {
    ocrConfidence: mockPacket.ocrConfidence
  });
  await sleep(1000);

  // 3. OCR COMPLETE -> CLASSIFIED (600ms)
  await saveClaimState(claimId, 'CLASSIFIED', {
    classifiedPages: mockPacket.classifiedPages
  });
  await sleep(600);

  // 4. CLASSIFIED -> EXTRACTED (600ms)
  await saveClaimState(claimId, 'EXTRACTED' as any, {
    extractedFields: mockPacket.extractedFields
  });
  await sleep(600);

  // 5. EXTRACTED -> Final State
  await saveClaimState(claimId, finalState, {
    extractedFields: mockPacket.extractedFields,
    validationErrors: mockPacket.validationErrors,
    repairSuggestions: mockPacket.repairSuggestions,
    claimHealth: mockPacket.claimHealth,
    readiness: mockPacket.readiness,
    ocrConfidence: mockPacket.ocrConfidence
  });

  const packet: ClaimPacket = {
    ...mockPacket,
    success: true,
    extractionMethod: 'mixed',
    pdfType: isScanned ? 'scanned_or_image' : 'text_layer',
    intake: session
  };

  logger.info('DEMO_PIPELINE', `Smart Demo Pipeline completed successfully for claim ${claimId}`);
  return packet;
}
