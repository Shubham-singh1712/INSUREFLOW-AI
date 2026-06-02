import fs from 'fs';
import path from 'path';
import { processClaimPipeline } from '../src/lib/claim-processing/pipeline';
import { saveReviewClaim } from '../src/lib/liveClaims';

const mockFile = path.join(process.cwd(), 'sample-pdfs', 'CARE_Maternity_Pending_Claim.pdf');
const buffer = fs.readFileSync(mockFile);

const claimId = 'claim-test-real-123';
const uploadSessionId = 'session-test-real-123';
const userId = '0d00e1b4-8c4e-4adf-a03f-5777fe6009b1';

const sessionData = {
  claimId,
  uploadSessionId,
  originalFileName: 'CARE_Maternity_Pending_Claim.pdf',
  fileSizeBytes: buffer.length,
  uploadStartedAt: new Date().toISOString(),
};

async function run() {
  console.log('Starting real pipeline test...');
  try {
    const packet = await processClaimPipeline(buffer, sessionData);
    console.log('Real pipeline completed successfully. Packet state:', packet.state);
    console.log('Extracted fields count:', Object.keys(packet.extractedFields || {}).length);
    console.log('Extracted Patient Name:', packet.extractedFields?.patient?.full_name?.value);

    const confirmedData = {
      patient: {
        full_name: packet.extractedFields?.patient?.full_name?.value || '',
        date_of_birth: packet.extractedFields?.patient?.dob?.value || '',
        gender: packet.extractedFields?.patient?.gender?.value || '',
        address: packet.extractedFields?.patient?.address?.value || '',
        contact_phone: packet.extractedFields?.patient?.phone?.value || '',
        contact_email: '',
      },
      insurance: {
        policyholder_name: '',
        group_number: packet.extractedFields?.insurance?.corporate_or_group_id?.value || '',
        member_id: packet.extractedFields?.insurance?.member_id?.value || '',
        payer_id: packet.extractedFields?.insurance?.insurance_id?.value || '',
        plan_name: packet.extractedFields?.insurance?.provider_name?.value || '',
      },
      pre_authorization: {
        approval_code: '',
        authorized_from: '',
        authorized_to: '',
      },
      clinical: {
        admission_date: packet.extractedFields?.hospital?.admission_date?.value || '',
        discharge_date: packet.extractedFields?.hospital?.discharge_date?.value || '',
        attending_physician: packet.extractedFields?.hospital?.doctor_name?.value || '',
        hospital_npi: '',
        hospital_tax_id: '',
        facility_name: packet.extractedFields?.hospital?.facility_name?.value || '',
        principal_diagnosis: packet.extractedFields?.clinical?.diagnosis?.value || '',
      },
      coding: {
        icd10_codes: (packet.extractedFields?.clinical?.icd10_codes?.value || []).map((code) => ({
          code,
          description: '',
          confidence: 100,
        })),
        cpt_codes: [],
      },
      billing: {
        total_billed_amount: String(packet.extractedFields?.financial?.final_bill?.value || '0'),
        line_items: [],
      },
      extraction_meta: {
        overall_confidence: packet.ocrConfidence,
        low_confidence_fields: [],
        requires_manual_review: true,
      },
    };

    console.log('Calling saveReviewClaim...');
    await saveReviewClaim({
      userId,
      claimId: packet.claimId,
      confirmedData,
      reviewReasons: packet.validationErrors.map((e) => e.issue),
      readiness: packet.readiness,
      threshold: 85,
    });
    console.log('saveReviewClaim succeeded!');

    // Check if written
    const storePath = path.join(process.cwd(), '.data', 'live-claims.json');
    const content = fs.readFileSync(storePath, 'utf8');
    const claims = JSON.parse(content);
    const added = claims.find(c => c.claimId === claimId);
    if (added) {
      console.log('Successfully verified added claim in cache! Name:', added.patient, 'Status:', added.status);
      // clean up
      const cleaned = claims.filter(c => c.claimId !== claimId);
      fs.writeFileSync(storePath, JSON.stringify(cleaned, null, 2), 'utf8');
      console.log('Cleaned up test claim.');
    } else {
      console.error('Claim was NOT found in cache after saveReviewClaim!');
    }

  } catch (err) {
    console.error('Real pipeline test threw error:', err);
  }
}

run();
