import fs from 'fs';
import path from 'path';
import { ClaimPacket, ClaimSession } from './types';
import { saveClaimState } from './db';
import { logger } from './logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Smart Demo Simulator Selector
function selectDemoFilename(fileName: string, pageCount: number): string {
  const name = fileName.toLowerCase();

  // 1. Exact or near-exact filename keyword matching
  if (name.includes('apollo') && (name.includes('cardio') || name.includes('cashless') || name.includes('preauth'))) {
    return 'healthy/Apollo_Cashless_Cardiology_PreAuth.json';
  }
  if (name.includes('fortis') && (name.includes('general') || name.includes('surgery'))) {
    return 'healthy/Fortis_General_Surgery_Claim.json';
  }
  if (name.includes('kims') || (name.includes('orthopedic') && (name.includes('review') || name.includes('case')))) {
    return 'review/KIMS_Orthopedic_Review_Case.json';
  }
  if (name.includes('care') && name.includes('maternity') && (name.includes('pending') || name.includes('review') || name.includes('hold'))) {
    return 'review/CARE_Maternity_Pending_Claim.json';
  }
  if (name.includes('aiims') && (name.includes('oncology') || name.includes('highrisk') || name.includes('high-risk') || name.includes('cancer') || name.includes('tumor'))) {
    return 'high-risk/AIIMS_HighRisk_Oncology_Claim.json';
  }
  if (name.includes('emergency') || name.includes('critical') || name.includes('dispute')) {
    return 'high-risk/Emergency_Critical_Care_Dispute.json';
  }

  // 2. General disease / specialty keywords
  if (name.includes('maternity') || name.includes('delivery') || name.includes('pregnancy') || name.includes('care')) {
    return 'healthy/CARE_Maternity_Claim.json';
  }
  if (name.includes('pediatric') || name.includes('child') || name.includes('rainbow')) {
    return 'healthy/Star_Health_Pediatrics_Claim.json';
  }
  if (name.includes('gastro') || name.includes('pancreatitis') || name.includes('lombard')) {
    return 'healthy/ICICI_Lombard_Gastroenterology_Claim.json';
  }
  if (name.includes('dermatology') || name.includes('skin') || name.includes('bupa') || name.includes('psoriasis')) {
    return 'healthy/Max_Bupa_Dermatology_Claim.json';
  }
  if (name.includes('hernia') || name.includes('inguinal')) {
    return 'healthy/HDFC_Ergo_Hernia_Claim.json';
  }
  if (name.includes('pneumonia') || name.includes('aiims') || name.includes('lung')) {
    return 'review/AIIMS_Pneumonia_Claim.json';
  }
  if (name.includes('appendix') || name.includes('appendectomy') || name.includes('max')) {
    return 'review/Max_Healthcare_Appendectomy_Claim.json';
  }
  if (name.includes('urology') || name.includes('kidney') || name.includes('stone') || name.includes('manipal')) {
    return 'review/Manipal_Urology_Claim.json';
  }
  if (name.includes('dental') || name.includes('tooth') || name.includes('wisdom')) {
    return 'review/Star_Health_Dental_Claim.json';
  }
  if (name.includes('nephrology') || name.includes('dialysis') || name.includes('renal') || name.includes('narayana')) {
    return 'review/Narayana_Nephrology_Claim.json';
  }
  if (name.includes('stroke') || name.includes('kokilaben')) {
    return 'high-risk/Kokilaben_Neurology_Claim.json';
  }
  if (name.includes('glaucoma') || name.includes('eye') || name.includes('cataract')) {
    return 'high-risk/Apollo_Glaucoma_HighRisk_Claim.json';
  }
  if (name.includes('trauma') || name.includes('accident') || name.includes('fracture')) {
    return 'high-risk/Global_Hospitals_Trauma_Claim.json';
  }
  if (name.includes('orthopedic') || name.includes('fortis')) {
    return 'high-risk/Fortis_Orthopedics_HighRisk_Claim.json';
  }

  // 3. Category flag fallback matching
  if (name.includes('healthy') || name.includes('green') || name.includes('approved')) {
    return 'healthy/Apollo_Cashless_Cardiology_PreAuth.json';
  }
  if (name.includes('review') || name.includes('pending') || name.includes('yellow') || name.includes('hold')) {
    return 'review/KIMS_Orthopedic_Review_Case.json';
  }
  if (name.includes('highrisk') || name.includes('high-risk') || name.includes('red') || name.includes('reject')) {
    return 'high-risk/AIIMS_HighRisk_Oncology_Claim.json';
  }

  // 4. Page-count fallback matching
  if (pageCount <= 2) {
    const healthyList = [
      'healthy/Star_Health_Pediatrics_Claim.json',
      'healthy/CARE_Maternity_Claim.json',
      'healthy/HDFC_Ergo_Hernia_Claim.json'
    ];
    return healthyList[Math.floor(Math.random() * healthyList.length)];
  } else if (pageCount <= 4) {
    const reviewList = [
      'review/KIMS_Orthopedic_Review_Case.json',
      'review/CARE_Maternity_Pending_Claim.json',
      'review/AIIMS_Pneumonia_Claim.json',
      'review/Star_Health_Dental_Claim.json'
    ];
    return reviewList[Math.floor(Math.random() * reviewList.length)];
  } else {
    const highRiskList = [
      'high-risk/AIIMS_HighRisk_Oncology_Claim.json',
      'high-risk/Emergency_Critical_Care_Dispute.json',
      'high-risk/Kokilaben_Neurology_Claim.json'
    ];
    return highRiskList[Math.floor(Math.random() * highRiskList.length)];
  }
}

export async function processDemoClaimPipeline(
  buffer: Buffer,
  session: ClaimSession
): Promise<ClaimPacket> {
  const { claimId } = session;
  logger.info('DEMO_PIPELINE', `Starting Demo Pipeline for claim ${claimId}`);

  // Calculate page count based on buffer size or default to 5 pages
  let pageCount = 5;
  try {
    // Simple native PDF parsing to extract page count
    const pdfString = buffer.toString('latin1');
    const matches = pdfString.match(/\/Count\s+(\d+)/);
    if (matches && matches[1]) {
      pageCount = Math.max(1, parseInt(matches[1], 10));
    }
  } catch (err) {
    logger.warn('DEMO_PIPELINE', 'Failed to read PDF page count, using default count = 5');
  }

  // Select the appropriate demo claim packet
  const selectedFile = selectDemoFilename(session.originalFileName, pageCount);
  logger.info('DEMO_PIPELINE', `Smart simulator selected: ${selectedFile} for pageCount: ${pageCount}, file: ${session.originalFileName}`);

  // Load the selected mock claim packet JSON
  let mockPacket: any;
  try {
    const filePath = path.join(process.cwd(), 'src', 'demo-data', selectedFile);
    const content = fs.readFileSync(filePath, 'utf8');
    mockPacket = JSON.parse(content);
  } catch (err: any) {
    logger.error('DEMO_PIPELINE', `Failed to load mock packet ${selectedFile}, falling back to cardiology`, err);
    // Absolute fallback in case of missing files
    const fallbackPath = path.join(process.cwd(), 'src', 'demo-data', 'healthy', 'Apollo_Cashless_Cardiology_PreAuth.json');
    mockPacket = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  }

  // Override unique session identifiers
  mockPacket.claimId = claimId;
  mockPacket.uploadSessionId = session.uploadSessionId;
  mockPacket.pageCount = pageCount;
  mockPacket.intake = session;

  // Modify timestamps in audit logs to be relative to now
  const now = Date.now();
  if (mockPacket.auditLogs && Array.isArray(mockPacket.auditLogs)) {
    mockPacket.auditLogs = mockPacket.auditLogs.map((log: any, idx: number) => ({
      ...log,
      timestamp: new Date(now - (mockPacket.auditLogs.length - idx) * 10000).toISOString()
    }));
  }

  // 1. UPLOADED -> PROCESSING (600ms)
  await saveClaimState(claimId, 'PROCESSING');
  await sleep(600);

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

  // 5. EXTRACTED -> Final State (READY or REVIEW_REQUIRED)
  const finalState = mockPacket.state;
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
    pdfType: 'text_layer',
    intake: session
  };

  logger.info('DEMO_PIPELINE', `Demo Pipeline complete for claim ${claimId}. Status: ${finalState}`);
  return packet;
}
