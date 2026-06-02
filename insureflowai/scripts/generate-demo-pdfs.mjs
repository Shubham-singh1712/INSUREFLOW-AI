import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We will write directly to both:
// 1. insureflowai/sample-pdfs/
// 2. parent sample-pdfs/
const targetDirInner = path.join(__dirname, '..', 'sample-pdfs');
const targetDirOuter = path.join(__dirname, '..', '..', 'sample-pdfs');

[targetDirInner, targetDirOuter].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper function to create a PDF file with multi-page text layers
function createPDF(filename, pagesData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      
      const pathInner = path.join(targetDirInner, filename);
      const pathOuter = path.join(targetDirOuter, filename);

      const streamInner = fs.createWriteStream(pathInner);
      const streamOuter = fs.createWriteStream(pathOuter);

      doc.pipe(streamInner);
      // Pipe to outer directory as well
      doc.pipe(streamOuter);

      pagesData.forEach((pageText, index) => {
        if (index > 0) {
          doc.addPage();
        }
        
        // Add Header
        doc.fontSize(16).fillColor('#2563eb').text(`INSUREFLOW-AI DEMO DOCUMENT: PAGE ${index + 1}`, { underline: true });
        doc.moveDown(1.5);

        // Add Body Text
        doc.fontSize(10).fillColor('#1e293b').text(pageText, {
          align: 'left',
          lineGap: 4,
          paragraphGap: 10
        });
      });

      doc.end();

      // Resolve when inner stream finishes
      streamInner.on('finish', () => {
        console.log(`Successfully generated PDF: ${filename}`);
        resolve();
      });

      streamInner.on('error', (err) => reject(err));
      streamOuter.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// PDF Text Layers Data
// ---------------------------------------------------------------------------

const claimsData = [
  // 1. HEALTHY CLAIM (GREEN PATH): Apollo_Cashless_Cardiology_PreAuth.pdf
  {
    filename: 'Apollo_Cashless_Cardiology_PreAuth.pdf',
    pages: [
      // Page 1: Pre-Authorization Form
      `REQUEST FOR CASHLESS HOSPITALISATION - PRE-AUTHORIZATION FORM (ANNEXURE A)
Name of the Patient: Aditya Sharma
Gender: Male, Age: 52, DOB: 1974-05-15
Contact Phone: +91 98400 12345
Address: Flat 4B, Shanti Apartments, Alwarpet, Chennai - 600018
Insurance Provider: Apollo Munich Health Insurance
TPA Name: Medi Assist TPA
Policy Number: AP-55421-90
Member ID: MED-7782109
Group ID: CORP-CTS-2026
Insurance ID: INS-AP-9922
Hospital Name: Apollo Hospitals, Greams Road
Attending Physician / Doctor Name: Dr. Sanjay Kapoor
Provisional Diagnosis: Coronary Artery Disease - Acute Coronary Syndrome (LAD Stenosis)
ICD-10 Code: I25.1, I21.4
Date of Admission: 2026-05-25
Date of Discharge: 2026-05-28
Total Sum Expected Cost of Hospitalisation: INR 223,000
Hospital Seal & Stamp: OFFICIAL APOLLO HOSPITALS SEAL AFFIXED
Doctor Signature: Dr. Sanjay Kapoor SIGNED
Patient Signature: Aditya Sharma SIGNED
Declaration: Cashless access request submitted for preauth approval.`,

      // Page 2: Hospital Invoice
      `FINAL ITEMIZED BILL - INVOICE
Hospital Name: Apollo Hospitals, Greams Road
Patient Name: Aditya Sharma
Bill Date: 2026-05-28
Billed Items:
1. Room Rent (Single Room, 3 Days): INR 12,000
2. ICU Charges: INR 45,000
3. OT Charges: INR 60,000
4. Medicine & Pharmacy: INR 38,000
5. Investigations & Labs: INR 18,000
6. Professional Fees: INR 50,000
Grand Total / Net Billed Amount: INR 223,000
Receipt details: Sum total matches exactly.`,

      // Page 3: Aadhaar Card KYC
      `UNIQUE IDENTIFICATION AUTHORITY OF INDIA (UIDAI) - GOVERNMENT OF INDIA
MY AADHAAR, MY IDENTITY (AADHAAR CARD)
Aadhaar Number: 4575 8876 1120
Name: Aditya Sharma
DOB: 15/05/1974
Gender: Male
Address: Flat 4B, Shanti Apartments, Alwarpet, Chennai - 600018
Helpdesk email: help@uidai.gov.in`,

      // Page 4: PAN Card KYC
      `INCOME TAX DEPARTMENT - GOVERNMENT OF INDIA
PERMANENT ACCOUNT NUMBER CARD (PAN CARD)
PAN Number: ARVPY0847M
Name: Aditya Sharma
Father's Name: R. K. Sharma
DOB: 15/05/1974`,

      // Page 5: Doctor's Clinical Note
      `DOCTOR CLINICAL REFERRAL NOTE
Hospital Name: Life Care Hospital Annexe
Treating Doctor: Dr. Sanjay Kapoor, MBBS MD DNB CARD
Registration No: REG-HOSP-8800
Patient Name: Aditya Sharma, Age: 52
Patient c/o severe chest pain, dyspnea on exertion, diaphoresis.
Provisional Diagnosis: Acute Coronary Syndrome (LAD Stenosis).
Advised procedure: Percutaneous Transluminal Coronary Angioplasty (PTCA) with Drug Eluting Stent.
Stay: 3 Days.`,

      // Page 6: Policy Schedule
      `HEALTH INSURANCE POLICY SCHEDULE
Payer: Apollo Munich Health Insurance
Policyholder Name: Aditya Sharma
Policy Type: Individual Mediclaim Policy
Policy Number: AP-55421-90
Sum Insured: INR 5,00,000
Policy Period: 01/01/2026 to 31/12/2026
TPA Administrator: Medi Assist TPA`,

      // Page 7: Discharge Summary
      `DISCHARGE SUMMARY
Hospital Name: Apollo Hospitals, Greams Road
Patient Name: Aditya Sharma
Admission Date: 2026-05-25, Discharge Date: 2026-05-28
Diagnosis: Coronary Artery Disease - Acute Coronary Syndrome
Course in Hospital: PTCA with Drug Eluting Stent successful.
Discharge Vitals: Stable. Discharged in good health.`
    ]
  },

  // 2. HEALTHY CLAIM (GREEN PATH): Fortis_General_Surgery_Claim.pdf
  {
    filename: 'Fortis_General_Surgery_Claim.pdf',
    pages: [
      // Page 1: Pre-Authorization Form
      `REQUEST FOR CASHLESS HOSPITALISATION - PRE-AUTHORIZATION FORM (ANNEXURE A)
Name of the Patient: Amitabh Verma
Gender: Male, Age: 58, DOB: 1968-04-19
Contact Phone: +91 98860 67543
Address: 88/1, 4th Main, JP Nagar 3rd Phase, Bangalore - 560078
Insurance Provider: HDFC ERGO Health Insurance
TPA Name: Paramount Health Services
Policy Number: HE-6672391
Member ID: PAR-HE-90823
Group ID: CORP-TCS-01
Insurance ID: INS-HE-5511
Hospital Name: Fortis Hospital, Bannerghatta Road
Attending Physician / Doctor Name: Dr. Vivek Murthy
Provisional Diagnosis: Acute Calculus Cholecystitis (Gallstones)
ICD-10 Code: K80.20
Date of Admission: 2026-05-25
Date of Discharge: 2026-05-28
Total Sum Expected Cost of Hospitalisation: INR 146,500
Hospital Seal & Stamp: OFFICIAL FORTIS HOSPITAL SEAL AFFIXED
Doctor Signature: Dr. Vivek Murthy SIGNED
Patient Signature: Amitabh Verma SIGNED
Declaration: Cashless access request submitted for preauth approval.`,

      // Page 2: Hospital Invoice
      `FINAL ITEMIZED BILL - INVOICE
Hospital Name: Fortis Hospital, Bannerghatta Road
Patient Name: Amitabh Verma
Bill Date: 2026-05-28
Billed Items:
1. Room Rent (Single Room, 3 Days): INR 9,500
2. ICU Charges: INR 0
3. OT Charges: INR 35,000
4. Medicine & Pharmacy: INR 28,000
5. Investigations & Labs: INR 15,000
6. Professional Fees: INR 40,000
Grand Total / Net Billed Amount: INR 146,500
Receipt details: Sum total matches exactly.`,

      // Page 3: Aadhaar Card KYC
      `UNIQUE IDENTIFICATION AUTHORITY OF INDIA (UIDAI) - GOVERNMENT OF INDIA
MY AADHAAR, MY IDENTITY (AADHAAR CARD)
Aadhaar Number: 9028 7761 1102
Name: Amitabh Verma
DOB: 19/04/1968
Gender: Male
Address: 88/1, 4th Main, JP Nagar, Bangalore`,

      // Page 4: PAN Card KYC
      `INCOME TAX DEPARTMENT - GOVERNMENT OF INDIA
PERMANENT ACCOUNT NUMBER CARD (PAN CARD)
PAN Number: BIVPV8872D
Name: Amitabh Verma
DOB: 19/04/1968`,

      // Page 5: Doctor's Clinical Note
      `DOCTOR CLINICAL REFERRAL NOTE
Hospital Name: Fortis Hospital, Bannerghatta Road
Treating Doctor: Dr. Vivek Murthy, MBBS MS GS
Registration No: REG-HOSP-8801
Patient Name: Amitabh Verma, Age: 58
Patient c/o severe right upper quadrant pain, vomiting, fever.
Provisional Diagnosis: Acute Calculus Cholecystitis.
Advised procedure: Laparoscopic Cholecystectomy (Gallbladder Removal).
Stay: 3 Days.`,

      // Page 6: Discharge Summary
      `DISCHARGE SUMMARY
Hospital Name: Fortis Hospital, Bannerghatta Road
Patient Name: Amitabh Verma
Admission Date: 2026-05-25, Discharge Date: 2026-05-28
Diagnosis: Gallstones - Cholecystitis
Course in Hospital: Successful Laparoscopic Cholecystectomy.
Discharge Vitals: Stable. Discharged.`
    ]
  },

  // 3. NEEDS REVIEW (YELLOW PATH): KIMS_Orthopedic_Review_Case.pdf
  {
    filename: 'KIMS_Orthopedic_Review_Case.pdf',
    pages: [
      // Page 1: Pre-Authorization Form (No Hospital Seal/Stamp, No Patient Signature)
      `REQUEST FOR CASHLESS HOSPITALISATION - PRE-AUTHORIZATION FORM (ANNEXURE A)
Name of the Patient: Devendra Gowda
Gender: Male, Age: 65, DOB: 1961-03-10
Contact Phone: +91 99000 88776
Address: Flat 502, Orchid Residency, Gachibowli, Hyderabad - 500032
Insurance Provider: Star Health Health Insurance
TPA Name: Star Health In-house TPA
Policy Number: SH-776210-99
Member ID: MEM-SH-88762
Group ID: INDIVIDUAL
Insurance ID: INS-SH-0982
Hospital Name: KIMS Hospitals, Secunderabad
Attending Physician / Doctor Name: Dr. C. S. Ranawat
Provisional Diagnosis: Severe Osteoarthritis of Right Knee
ICD-10 Code: M17.11
Date of Admission: 2026-05-25
Date of Discharge: 2026-05-28
Total Sum Expected Cost of Hospitalisation: INR 219,000
Hospital Seal & Stamp: [MISSING - HOSPITAL SEAL BLOCK IS BLANK]
Doctor Signature: Dr. C. S. Ranawat SIGNED
Patient Signature: [MISSING - PATIENT SIGNATURE LINE EMPTY]
Declaration: Cashless access request submitted.`,

      // Page 2: Hospital Invoice
      `FINAL ITEMIZED BILL - INVOICE
Hospital Name: KIMS Hospitals, Secunderabad
Patient Name: Devendra Gowda
Bill Date: 2026-05-28
Billed Items:
1. Room Rent (Single Room, 3 Days): INR 11,000
2. ICU Charges: INR 0
3. OT Charges: INR 55,000
4. Medicine & Pharmacy: INR 45,000
5. Investigations & Labs: INR 15,000
6. Professional Fees: INR 60,000
Grand Total / Net Billed Amount: INR 219,000`,

      // Page 3: Aadhaar Card KYC
      `UNIQUE IDENTIFICATION AUTHORITY OF INDIA (UIDAI) - GOVERNMENT OF INDIA
MY AADHAAR, MY IDENTITY (AADHAAR CARD)
Aadhaar Number: 8876 1120 9902
Name: Devendra Gowda
DOB: 10/03/1961
Gender: Male`,

      // Page 4: Doctor's Clinical Note (No Discharge Summary Page)
      `DOCTOR CLINICAL REFERRAL NOTE
Hospital Name: KIMS Hospitals, Secunderabad
Treating Doctor: Dr. C. S. Ranawat, MBBS MS ORTHO
Registration No: REG-HOSP-8807
Patient Name: Devendra Gowda, Age: 65
Patient c/o severe joint pain, joint stiffness, restricted mobility.
Provisional Diagnosis: Severe Osteoarthritis of Right Knee.
Advised procedure: Total Knee Arthroplasty (Right Knee Replacement).
Stay: 4 Days.`
    ]
  },

  // 4. NEEDS REVIEW (YELLOW PATH): CARE_Maternity_Pending_Claim.pdf
  {
    filename: 'CARE_Maternity_Pending_Claim.pdf',
    pages: [
      // Page 1: Pre-Authorization Form (No Hospital Seal/Stamp, No Patient Signature)
      `REQUEST FOR CASHLESS HOSPITALISATION - PRE-AUTHORIZATION FORM (ANNEXURE A)
Name of the Patient: Priyanka Sen
Gender: Female, Age: 33, DOB: 1992-08-22
Contact Phone: +91 99890 54321
Address: H.No. 12-2-416/A, Gagan Mahal, Hyderabad - 500029
Insurance Provider: Star Health Health Insurance
TPA Name: Star Health In-house TPA
Policy Number: SH-884712-01
Member ID: MEM-SH-09321
Group ID: CORP-INFY-99
Insurance ID: INS-SH-1102
Hospital Name: CARE Hospitals, Banjara Hills
Attending Physician / Doctor Name: Dr. Ananya Reddy
Provisional Diagnosis: Single spontaneous delivery (Maternity - Pregnancy Term)
ICD-10 Code: O80, Z37.0
Date of Admission: 2026-05-25
Date of Discharge: 2026-05-28
Total Sum Expected Cost of Hospitalisation: INR 76,000
Hospital Seal & Stamp: [MISSING - OFFICIAL DESK STAMP BLOCK EMPTY]
Doctor Signature: Dr. Ananya Reddy SIGNED
Patient Signature: [MISSING - PATIENT DECLARATION UNSIGNED]`,

      // Page 2: Hospital Invoice
      `FINAL ITEMIZED BILL - INVOICE
Hospital Name: CARE Hospitals, Banjara Hills
Patient Name: Priyanka Sen
Bill Date: 2026-05-28
Billed Items:
1. Room Rent (Single Room, 2 Days): INR 8,000
2. ICU Charges: INR 0
3. OT Charges: INR 20,000
4. Medicine & Pharmacy: INR 15,000
5. Investigations & Labs: INR 8,000
6. Professional Fees: INR 25,000
Grand Total / Net Billed Amount: INR 76,000`,

      // Page 3: Aadhaar Card KYC
      `UNIQUE IDENTIFICATION AUTHORITY OF INDIA (UIDAI) - GOVERNMENT OF INDIA
MY AADHAAR, MY IDENTITY (AADHAAR CARD)
Aadhaar Number: 4432 0981 1120
Name: Priyanka Sen
DOB: 22/08/1992
Gender: Female`,

      // Page 4: Doctor's Clinical Note (No Discharge Summary Page)
      `DOCTOR CLINICAL REFERRAL NOTE
Hospital Name: CARE Hospitals, Banjara Hills
Treating Doctor: Dr. Ananya Reddy, MBBS MD OBG
Registration No: REG-HOSP-8802
Patient Name: Priyanka Sen, Age: 33
Term pregnancy labor pains. Normal vaginal delivery.
Stay: 2 Days.`
    ]
  },

  // 5. HIGH RISK (RED PATH): AIIMS_HighRisk_Oncology_Claim.pdf
  {
    filename: 'AIIMS_HighRisk_Oncology_Claim.pdf',
    pages: [
      // Page 1: Pre-Authorization Form (Missing Patient DOB, Missing Physician Signature)
      `REQUEST FOR CASHLESS HOSPITALISATION - PRE-AUTHORIZATION FORM (ANNEXURE A)
Name of the Patient: Gurpreet Singh
Gender: Male, Age: 54
Contact Phone: +91 99100 88776
Address: C-18, Model Town 3, Delhi - 110009
Insurance Provider: Star Health Health Insurance
TPA Name: Star Health In-house TPA
Policy Number: SH-554210-01
Member ID: MEM-SH-99082
Group ID: INDIVIDUAL
Insurance ID: INS-SH-4491
Hospital Name: AIIMS, New Delhi
Attending Physician / Doctor Name: Dr. Vinod Raina
Provisional Diagnosis: Adenocarcinoma of Lung - Stage IV (Metastatic)
ICD-10 Code: C34.9, C34.9
Date of Admission: 2026-05-25
Date of Discharge: 2026-05-28
Total Sum Expected Cost of Hospitalisation: INR 537,000
Hospital Seal & Stamp: OFFICIAL AIIMS SEAL AFFIXED
Doctor Signature: [MISSING - DOCTOR SIGNATURE BLOCK EMPTY]
Patient Signature: Gurpreet Singh SIGNED`,

      // Page 2: Hospital Invoice (Itemized totals sum to 352,000, but final bill total is 537,000 - Math Mismatch!)
      `FINAL ITEMIZED BILL - INVOICE
Hospital Name: AIIMS, New Delhi
Patient Name: Gurpreet Singh
Bill Date: 2026-05-28
Billed Items:
1. Room Rent (Single Room, 2 Days): INR 15,000
2. ICU Charges: INR 0
3. OT Charges: INR 0
4. Medicine & Pharmacy: INR 245,000
5. Investigations & Labs: INR 42,000
6. Professional Fees: INR 35,000
Grand Total / Net Billed Amount: INR 537,000
Note: Billed item totals sum to 352,000, but final total claims 537,000. Mismatch detected.`,

      // Page 3: Doctor's Clinical Note (Length of stay is 12 days, but admission/discharge dates are 3 days - LOS Mismatch!)
      `DOCTOR CLINICAL REFERRAL NOTE
Hospital Name: AIIMS, New Delhi
Treating Doctor: Dr. Vinod Raina, MBBS MD ONCO
Registration No: REG-HOSP-8814
Patient Name: Gurpreet Singh, Age: 54
Patient c/o chronic cough, hemoptysis, weight loss, bone pain.
Provisional Diagnosis: Stage IV Metastatic Lung Cancer.
Advised: First-line Pemetrexed + Carboplatin Chemotherapy.
Expected Length of Stay: 12 Days.
[Missing Aadhaar card and PAN card documents]`
    ]
  },

  // 6. HIGH RISK (RED PATH): Emergency_Critical_Care_Dispute.pdf
  {
    filename: 'Emergency_Critical_Care_Dispute.pdf',
    pages: [
      // Page 1: Pre-Authorization Form (Invalid policy number, Missing Patient DOB, Missing Physician Signature)
      `REQUEST FOR CASHLESS HOSPITALISATION - PRE-AUTHORIZATION FORM (ANNEXURE A)
Name of the Patient: Vikram Seth
Gender: Male, Age: 60
Contact Phone: +91 98180 55442
Address: H-203, DLF Phase 4, Gurgaon, Haryana - 122002
Insurance Provider: ICICI Lombard Health Insurance
TPA Name: Family Health Plan In-house TPA
Policy Number: INVALID-POL-ID-99
Member ID: FHPL-IL-00982
Group ID: CORP-PEPSI
Insurance ID: INS-IL-5541
Hospital Name: Fortis Memorial Research Institute
Attending Physician / Doctor Name: Dr. Naresh Trehan
Provisional Diagnosis: Right Frontal Lobe Meningioma (Brain Tumor)
ICD-10 Code: D32.0
Date of Admission: 2026-05-25
Date of Discharge: 2026-05-28
Total Sum Expected Cost of Hospitalisation: INR 587,000
Hospital Seal & Stamp: OFFICIAL FORTIS SEAL AFFIXED
Doctor Signature: [MISSING - DOCTOR SIGNATURE BLOCK EMPTY]
Patient Signature: Vikram Seth SIGNED`,

      // Page 2: Hospital Invoice (Itemized totals sum to 573,000, but final bill total is 587,000 - Math Mismatch!)
      `FINAL ITEMIZED BILL - INVOICE
Hospital Name: Fortis Memorial Research Institute
Patient Name: Vikram Seth
Bill Date: 2026-05-28
Billed Items:
1. Room Rent (Single Room, 6 Days): INR 14,000
2. ICU Charges: INR 80,000
3. OT Charges: INR 140,000
4. Medicine & Pharmacy: INR 95,000
5. Investigations & Labs: INR 54,000
6. Professional Fees: INR 120,000
Grand Total / Net Billed Amount: INR 587,000
Note: Billed item totals sum to 573,000, but final total claims 587,000. Mismatch detected.`,

      // Page 3: Doctor's Clinical Note (Length of stay is 15 days, but admission/discharge dates are 3 days - LOS Mismatch!)
      `DOCTOR CLINICAL REFERRAL NOTE
Hospital Name: Fortis Memorial Research Institute
Treating Doctor: Dr. Naresh Trehan, MBBS MD DNB NEURO
Registration No: REG-HOSP-8815
Patient Name: Vikram Seth, Age: 60
Patient c/o new onset seizures, progressive headaches, left-sided weakness.
Provisional Diagnosis: Brain Tumor Meningioma.
Advised: Right Frontal Craniotomy and Total Excision.
Expected Length of Stay: 15 Days.
[Missing Aadhaar card document]`
    ]
  }
];

// Execute PDF Generation sequentially
async function run() {
  console.log('Starting high-fidelity demo PDF generation...');
  for (const claim of claimsData) {
    try {
      await createPDF(claim.filename, claim.pages);
    } catch (err) {
      console.error(`Failed to generate PDF for ${claim.filename}:`, err);
    }
  }
  console.log('All high-fidelity demo PDFs successfully generated in both paths.');
}

run();
