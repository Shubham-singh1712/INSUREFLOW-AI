import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.join(__dirname, '..', 'src', 'demo-data');
const healthyDir = path.join(baseDir, 'healthy');
const reviewDir = path.join(baseDir, 'review');
const highRiskDir = path.join(baseDir, 'high-risk');

const pdfSourceDir = path.join(__dirname, '..', 'sample-pdfs');
const pdfSourceFile = path.join(pdfSourceDir, '01-intake-form-ramesh-iyer.pdf');

// Ensure target directories exist
[healthyDir, reviewDir, highRiskDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper to construct a TraceableField
function buildField(value, page = 1, docType = 'preauth', confidence = 95) {
  return {
    value,
    confidence,
    page,
    docType,
    method: 'pdf_text',
    raw: value !== null && value !== undefined ? `${docType === 'preauth' ? 'Patient' : 'Document'} Details: ${value}` : null
  };
}

// 20 Case Definitions
const cases = [
  // --- HEALTHY PATH (1-7) -> folder: healthy ---
  {
    filename: 'Apollo_Cashless_Cardiology_PreAuth.json',
    hospitalName: 'Apollo Hospitals, Greams Road',
    doctorName: 'Dr. Sanjay Kapoor',
    patientName: 'Aditya Sharma',
    dob: '1974-05-15',
    age: 52,
    phone: '+91 98400 12345',
    address: 'Flat 4B, Shanti Apartments, Alwarpet, Chennai - 600018',
    providerName: 'Apollo Munich Health Insurance',
    tpaName: 'Medi Assist TPA',
    policyNumber: 'AP-55421-90',
    memberId: 'MED-7782109',
    groupId: 'CORP-CTS-2026',
    insuranceId: 'INS-AP-9922',
    diagnosis: 'Coronary Artery Disease - Acute Coronary Syndrome (LAD Stenosis)',
    icd10: ['I25.1', 'I21.4'],
    symptoms: 'Angina pectoris, dyspnea on exertion, diaphoresis',
    surgery: 'Percutaneous Transluminal Coronary Angioplasty (PTCA) with Drug Eluting Stent',
    procedure: 'Coronary Angioplasty + Stenting',
    stay: 3,
    roomRent: 12000,
    icuCharges: 45000,
    otCharges: 60000,
    medicine: 38000,
    investigations: 18000,
    profFees: 50000,
    finalBill: 223000,
    path: 'healthy',
    pdfName: 'Apollo_Cashless_Cardiology_PreAuth.pdf'
  },
  {
    filename: 'Fortis_General_Surgery_Claim.json',
    hospitalName: 'Fortis Hospital, Bannerghatta Road',
    doctorName: 'Dr. Vivek Murthy',
    patientName: 'Amitabh Verma',
    dob: '1968-04-19',
    age: 58,
    phone: '+91 98860 67543',
    address: '88/1, 4th Main, JP Nagar 3rd Phase, Bangalore - 560078',
    providerName: 'HDFC ERGO Health Insurance',
    tpaName: 'Paramount Health Services',
    policyNumber: 'HE-6672391',
    memberId: 'PAR-HE-90823',
    groupId: 'CORP-TCS-01',
    insuranceId: 'INS-HE-5511',
    diagnosis: 'Acute Calculus Cholecystitis (Gallstones)',
    icd10: ['K80.20'],
    symptoms: 'Severe right upper quadrant pain, vomiting, fever',
    surgery: 'Laparoscopic Cholecystectomy',
    procedure: 'Gallbladder Removal Surgery',
    stay: 3,
    roomRent: 9500,
    icuCharges: 0,
    otCharges: 35000,
    medicine: 28000,
    investigations: 15000,
    profFees: 40000,
    finalBill: 146500,
    path: 'healthy',
    pdfName: 'Fortis_General_Surgery_Claim.pdf'
  },
  {
    filename: 'CARE_Maternity_Claim.json',
    hospitalName: 'CARE Hospitals, Banjara Hills',
    doctorName: 'Dr. Ananya Reddy',
    patientName: 'Priyanka Sen',
    dob: '1992-08-22',
    age: 33,
    phone: '+91 99890 54321',
    address: 'H.No. 12-2-416/A, Gagan Mahal, Hyderabad - 500029',
    providerName: 'Star Health Health Insurance',
    tpaName: 'Star Health In-house TPA',
    policyNumber: 'SH-884712-01',
    memberId: 'MEM-SH-09321',
    groupId: 'CORP-INFY-99',
    insuranceId: 'INS-SH-1102',
    diagnosis: 'Single spontaneous delivery (Maternity - Pregnancy Term)',
    icd10: ['O80', 'Z37.0'],
    symptoms: 'Labor pains, term pregnancy',
    surgery: 'Normal Vaginal Delivery',
    procedure: 'Obstetric Delivery Support',
    stay: 2,
    roomRent: 8000,
    icuCharges: 0,
    otCharges: 20000,
    medicine: 15000,
    investigations: 8000,
    profFees: 25000,
    finalBill: 76000,
    path: 'healthy'
  },
  {
    filename: 'Star_Health_Pediatrics_Claim.json',
    hospitalName: 'Rainbow Childrens Hospital',
    doctorName: 'Dr. Ramesh Chandran',
    patientName: 'Kavya Nair',
    dob: '2019-11-04',
    age: 6,
    phone: '+91 94440 98765',
    address: 'Old No. 42, New No. 18, 10th Cross Street, Indiranagar, Bangalore - 560038',
    providerName: 'Star Health Health Insurance',
    tpaName: 'Star Health In-house TPA',
    policyNumber: 'SH-992837-12',
    memberId: 'MEM-SH-11245',
    groupId: 'INDIVIDUAL',
    insuranceId: 'INS-SH-4492',
    diagnosis: 'Acute Bronchopneumonia with Respiratory Distress',
    icd10: ['J18.0', 'R06.0'],
    symptoms: 'High grade fever, productive cough, wheezing, tachypnea',
    surgery: 'None',
    procedure: 'Pediatric Nebulization, IV Antibiotics, Oxygen Support',
    stay: 4,
    roomRent: 6000,
    icuCharges: 18000,
    otCharges: 0,
    medicine: 22000,
    investigations: 12000,
    profFees: 15000,
    finalBill: 91000,
    path: 'healthy'
  },
  {
    filename: 'ICICI_Lombard_Gastroenterology_Claim.json',
    hospitalName: 'Asian Institute of Gastroenterology',
    doctorName: 'Dr. D. Nageshwar Reddy',
    patientName: 'Rajesh Kumar',
    dob: '1981-09-30',
    age: 44,
    phone: '+91 90001 22334',
    address: 'Plot 18, Mindspace Road, Gachibowli, Hyderabad - 500032',
    providerName: 'ICICI Lombard Health Insurance',
    tpaName: 'Family Health Plan Insurance TPA',
    policyNumber: 'IL-0098321-MX',
    memberId: 'FHPL-IL-77621',
    groupId: 'CORP-ACCENTURE',
    insuranceId: 'INS-IL-8371',
    diagnosis: 'Severe Acute Pancreatitis (Biliary etiology)',
    icd10: ['K85.10'],
    symptoms: 'Epigastric pain radiating to back, nausea, elevated amylase',
    surgery: 'None',
    procedure: 'Conservative Medical Management, IV fluids, Enzyme inhibitors',
    stay: 5,
    roomRent: 10000,
    icuCharges: 25000,
    otCharges: 0,
    medicine: 48000,
    investigations: 26000,
    profFees: 28000,
    finalBill: 177000,
    path: 'healthy'
  },
  {
    filename: 'Max_Bupa_Dermatology_Claim.json',
    hospitalName: 'Max Super Speciality Hospital, Saket',
    doctorName: 'Dr. Sheela Gupta',
    patientName: 'Sunita Mehra',
    dob: '1985-02-12',
    age: 41,
    phone: '+91 98111 22334',
    address: 'C-42, Panchsheel Enclave, New Delhi - 110017',
    providerName: 'Max Bupa Health Insurance',
    tpaName: 'Max Bupa In-house TPA',
    policyNumber: 'MB-112244-09',
    memberId: 'MEM-MB-99212',
    groupId: 'FAMILY-FLOATER',
    insuranceId: 'INS-MB-6671',
    diagnosis: 'Severe Psoriatic Erythroderma',
    icd10: ['L40.8'],
    symptoms: 'Generalized skin redness, scaling, severe itching, joint pains',
    surgery: 'None',
    procedure: 'Systemic Biological Therapy, topical applications',
    stay: 3,
    roomRent: 8500,
    icuCharges: 0,
    otCharges: 0,
    medicine: 65000,
    investigations: 12000,
    profFees: 18000,
    finalBill: 120500,
    path: 'healthy'
  },
  {
    filename: 'HDFC_Ergo_Hernia_Claim.json',
    hospitalName: 'Manipal Hospital, Old Airport Road',
    doctorName: 'Dr. Arvind Patel',
    patientName: 'Sanjay Dutt',
    dob: '1970-07-29',
    age: 55,
    phone: '+91 98450 44332',
    address: '22, Rustam Bagh, HAL 3rd Stage, Bangalore - 560017',
    providerName: 'HDFC ERGO Health Insurance',
    tpaName: 'Medi Assist TPA',
    policyNumber: 'HE-8890213',
    memberId: 'MED-HE-00219',
    groupId: 'CORP-INFOSYS',
    insuranceId: 'INS-HE-7712',
    diagnosis: 'Unilateral Inguinal Hernia without Obstruction',
    icd10: ['K40.90'],
    symptoms: 'Painful swelling in right groin, increases on straining',
    surgery: 'Laparoscopic Hernioplasty with Mesh Placement',
    procedure: 'Hernia Repair Surgery',
    stay: 2,
    roomRent: 9000,
    icuCharges: 0,
    otCharges: 40000,
    medicine: 18000,
    investigations: 10000,
    profFees: 35000,
    finalBill: 121000,
    path: 'healthy'
  },

  // --- YELLOW PATH (8-14) -> folder: review ---
  {
    filename: 'KIMS_Orthopedic_Review_Case.json',
    hospitalName: 'KIMS Hospitals, Secunderabad',
    doctorName: 'Dr. C. S. Ranawat',
    patientName: 'Devendra Gowda',
    dob: '1961-03-10',
    age: 65,
    phone: '+91 99000 88776',
    address: 'Flat 502, Orchid Residency, Gachibowli, Hyderabad - 500032',
    providerName: 'Star Health Health Insurance',
    tpaName: 'Star Health In-house TPA',
    policyNumber: 'SH-776210-99',
    memberId: 'MEM-SH-88762',
    groupId: 'INDIVIDUAL',
    insuranceId: 'INS-SH-0982',
    diagnosis: 'Severe Osteoarthritis of Right Knee',
    icd10: ['M17.11'],
    symptoms: 'Severe pain, joint stiffness, restricted mobility',
    surgery: 'Total Knee Arthroplasty (Right Knee Replacement)',
    procedure: 'Joint Replacement Surgery',
    stay: 4,
    roomRent: 11000,
    icuCharges: 0,
    otCharges: 55000,
    medicine: 45000,
    investigations: 15000,
    profFees: 60000,
    finalBill: 219000,
    path: 'review',
    pdfName: 'KIMS_Orthopedic_Review_Case.pdf'
  },
  {
    filename: 'CARE_Maternity_Pending_Claim.json',
    hospitalName: 'CARE Hospitals, Banjara Hills',
    doctorName: 'Dr. Ananya Reddy',
    patientName: 'Priyanka Sen',
    dob: '1992-08-22',
    age: 33,
    phone: '+91 99890 54321',
    address: 'H.No. 12-2-416/A, Gagan Mahal, Hyderabad - 500029',
    providerName: 'Star Health Health Insurance',
    tpaName: 'Star Health In-house TPA',
    policyNumber: 'SH-884712-01',
    memberId: 'MEM-SH-09321',
    groupId: 'CORP-INFY-99',
    insuranceId: 'INS-SH-1102',
    diagnosis: 'Single spontaneous delivery (Maternity - Pregnancy Term)',
    icd10: ['O80', 'Z37.0'],
    symptoms: 'Labor pains, term pregnancy',
    surgery: 'Normal Vaginal Delivery',
    procedure: 'Obstetric Delivery Support',
    stay: 2,
    roomRent: 8000,
    icuCharges: 0,
    otCharges: 20000,
    medicine: 15000,
    investigations: 8000,
    profFees: 25000,
    finalBill: 76000,
    path: 'review',
    pdfName: 'CARE_Maternity_Pending_Claim.pdf'
  },
  {
    filename: 'AIIMS_Pneumonia_Claim.json',
    hospitalName: 'AIIMS, New Delhi',
    doctorName: 'Dr. Randeep Guleria',
    patientName: 'Harish Chandra',
    dob: '1959-12-05',
    age: 66,
    phone: '+91 98100 99887',
    address: 'Qtr No. 12, Sector 3, RK Puram, New Delhi - 110022',
    providerName: 'Apollo Munich Health Insurance',
    tpaName: 'Medi Assist TPA',
    policyNumber: 'AP-22119-08',
    memberId: 'MED-AP-44310',
    groupId: 'GOVT-CGHS-99',
    insuranceId: 'INS-AP-1144',
    diagnosis: 'Lobar Pneumonia - Streptococcus pneumoniae',
    icd10: ['J13'],
    symptoms: 'High fever, shaking chills, productive rusty sputum, pleuritic chest pain',
    surgery: 'None',
    procedure: 'Intensive antibiotic therapy, bronchodilators, nebulization',
    stay: 5,
    roomRent: 5000,
    icuCharges: 20000,
    otCharges: 0,
    medicine: 32000,
    investigations: 18000,
    profFees: 12000,
    finalBill: 92000,
    path: 'review'
  },
  {
    filename: 'Max_Healthcare_Appendectomy_Claim.json',
    hospitalName: 'Max Hospital, Noida',
    doctorName: 'Dr. Sandeep Kapoor',
    patientName: 'Rohan Mehra',
    dob: '1995-10-18',
    age: 30,
    phone: '+91 99100 55443',
    address: 'K-18, Sector 41, Noida, Uttar Pradesh - 201301',
    providerName: 'HDFC ERGO Health Insurance',
    tpaName: 'Paramount Health Services',
    policyNumber: 'HE-9081273',
    memberId: 'PAR-HE-55122',
    groupId: 'CORP-WIPRO',
    insuranceId: 'INS-HE-0021',
    diagnosis: 'Acute Appendicitis with Localized Peritonitis',
    icd10: ['K35.30'],
    symptoms: 'Periumbilical pain migrating to right lower quadrant, fever, guarding',
    surgery: 'Laparoscopic Appendectomy',
    procedure: 'Appendix Removal Surgery',
    stay: 2,
    roomRent: 8000,
    icuCharges: 0,
    otCharges: 30000,
    medicine: 22000,
    investigations: 9000,
    profFees: 28000,
    finalBill: 97000,
    path: 'review'
  },
  {
    filename: 'Manipal_Urology_Claim.json',
    hospitalName: 'Manipal Hospital, Whitefield',
    doctorName: 'Dr. Deepak Gowda',
    patientName: 'Vijay Mallya',
    dob: '1963-06-14',
    age: 62,
    phone: '+91 98450 11223',
    address: '42, Lavelle Road, Bangalore - 560001',
    providerName: 'ICICI Lombard Health Insurance',
    tpaName: 'Family Health Plan In-house TPA',
    policyNumber: 'IL-556102-PP',
    memberId: 'FHPL-IL-11234',
    groupId: 'INDIVIDUAL-PLATINUM',
    insuranceId: 'INS-IL-9002',
    diagnosis: 'Ureteric Calculus (Kidney Stone 8mm)',
    icd10: ['N20.1'],
    symptoms: 'Excruciating left flank pain radiating to groin, hematuria, vomiting',
    surgery: 'Laser Lithotripsy + DJ Stenting',
    procedure: 'URSL (Ureteroscopic Retrograde Stone Surgery)',
    stay: 1,
    roomRent: 12000,
    icuCharges: 0,
    otCharges: 45000,
    medicine: 15000,
    investigations: 12000,
    profFees: 35000,
    finalBill: 119000,
    path: 'review'
  },
  {
    filename: 'Star_Health_Dental_Claim.json',
    hospitalName: 'Fortis Hospital, Mulund',
    doctorName: 'Dr. Suresh Nair',
    patientName: 'Anitha Nair',
    dob: '1978-03-21',
    age: 48,
    phone: '+91 98200 44332',
    address: 'B-22, Godrej Hill, Kalyan West, Mumbai - 421301',
    providerName: 'Star Health Health Insurance',
    tpaName: 'Star Health In-house TPA',
    policyNumber: 'SH-887711-23',
    memberId: 'MEM-SH-00921',
    groupId: 'FAMILY-FLOATER',
    insuranceId: 'INS-SH-8812',
    diagnosis: 'Impacted Mandibular Third Molar (Wisdom Tooth) with Pericoronitis',
    icd10: ['K01.1', 'K05.22'],
    symptoms: 'Severe pain in lower jaw, difficulty in opening mouth, facial swelling',
    surgery: 'Surgical Extraction of Impacted Tooth under Local Anesthesia',
    procedure: 'Dental Surgical Extraction',
    stay: 1,
    roomRent: 0,
    icuCharges: 0,
    otCharges: 12000,
    medicine: 4500,
    investigations: 3500,
    profFees: 15000,
    finalBill: 35000,
    path: 'review'
  },
  {
    filename: 'Narayana_Nephrology_Claim.json',
    hospitalName: 'Narayana Health, HSR Layout',
    doctorName: 'Dr. Lloyd Vincent',
    patientName: 'Kishore Kumar',
    dob: '1966-08-04',
    age: 59,
    phone: '+91 99800 11223',
    address: '55, 14th Main, HSR Layout Sector 3, Bangalore - 560102',
    providerName: 'Apollo Munich Health Insurance',
    tpaName: 'Medi Assist TPA',
    policyNumber: 'AP-77610-88',
    memberId: 'MED-AP-99081',
    groupId: 'CORP-GENPACT',
    insuranceId: 'INS-AP-0082',
    diagnosis: 'End Stage Renal Disease on Maintenance Hemodialysis',
    icd10: ['N18.6'],
    symptoms: 'Uremic symptoms, fluid overload, severe anemia',
    surgery: 'AV Fistula Creation (Left Forearm)',
    procedure: 'Arteriovenous Fistula Surgery',
    stay: 2,
    roomRent: 7500,
    icuCharges: 0,
    otCharges: 25000,
    medicine: 12000,
    investigations: 8500,
    profFees: 20000,
    finalBill: 80500,
    path: 'review'
  },

  // --- HIGH RISK PATH (15-20) -> folder: high-risk ---
  {
    filename: 'AIIMS_HighRisk_Oncology_Claim.json',
    hospitalName: 'AIIMS, New Delhi',
    doctorName: 'Dr. Vinod Raina',
    patientName: 'Gurpreet Singh',
    dob: '1972-04-03',
    age: 54,
    phone: '+91 99100 88776',
    address: 'C-18, Model Town 3, Delhi - 110009',
    providerName: 'Star Health Health Insurance',
    tpaName: 'Star Health In-house TPA',
    policyNumber: 'SH-554210-01',
    memberId: 'MEM-SH-99082',
    groupId: 'INDIVIDUAL',
    insuranceId: 'INS-SH-4491',
    diagnosis: 'Adenocarcinoma of Lung - Stage IV (Metastatic)',
    icd10: ['C34.9', 'C34.9'], // Duplicate ICD code!
    symptoms: 'Chronic cough, hemoptysis, weight loss, bone pain',
    surgery: 'None',
    procedure: 'First-line Pemetrexed + Carboplatin Chemotherapy + Immunotherapy infusion',
    stay: 12, // stay is 12, but admission date is 25th May to 28th May (LOS mismatch!)
    roomRent: 15000,
    icuCharges: 0,
    otCharges: 0,
    medicine: 245000,
    investigations: 42000,
    profFees: 35000,
    finalBill: 537000, // math mismatch! (15000*2 + 245000 + 42000 + 35000 = 352000, but finalBill is 537000)
    path: 'high-risk',
    pdfName: 'AIIMS_HighRisk_Oncology_Claim.pdf'
  },
  {
    filename: 'Emergency_Critical_Care_Dispute.json',
    hospitalName: 'Fortis Memorial Research Institute',
    doctorName: 'Dr. Naresh Trehan',
    patientName: 'Vikram Seth',
    dob: '1965-11-12',
    age: 60,
    phone: '+91 98180 55442',
    address: 'H-203, DLF Phase 4, Gurgaon, Haryana - 122002',
    providerName: 'ICICI Lombard Health Insurance',
    tpaName: 'Family Health Plan In-house TPA',
    policyNumber: 'INVALID-POL-ID-99', // Invalid policy identifier!
    memberId: 'FHPL-IL-00982',
    groupId: 'CORP-PEPSI',
    insuranceId: 'INS-IL-5541',
    diagnosis: 'Right Frontal Lobe Meningioma (Brain Tumor)',
    icd10: ['D32.0'],
    symptoms: 'New onset seizures, progressive morning headaches, left-sided weakness',
    surgery: 'Right Frontal Craniotomy and Total Excision of Meningioma',
    procedure: 'Brain Tumor Craniotomy Surgery',
    stay: 6,
    roomRent: 14000,
    icuCharges: 80000,
    otCharges: 140000,
    medicine: 95000,
    investigations: 54000,
    profFees: 120000,
    finalBill: 587000,
    path: 'high-risk',
    pdfName: 'Emergency_Critical_Care_Dispute.pdf'
  },
  {
    filename: 'Kokilaben_Neurology_Claim.json',
    hospitalName: 'Kokilaben Dhirubhai Ambani Hospital',
    doctorName: 'Dr. Mohit Bhatt',
    patientName: 'Ramesh Tendulkar',
    dob: '1955-04-24',
    age: 71,
    phone: '+91 98200 88776',
    address: 'Perry Cross Road, Bandra West, Mumbai - 400050',
    providerName: 'HDFC ERGO Health Insurance',
    tpaName: 'Paramount Health Services',
    policyNumber: 'HE-0092182',
    memberId: 'PAR-HE-77610',
    groupId: 'INDIVIDUAL-SENIOR',
    insuranceId: 'INS-HE-1142',
    diagnosis: 'Acute Ischemic Stroke - Right MCA Territory',
    icd10: ['I63.9', 'R47.01'],
    symptoms: 'Sudden left-sided hemiplegia, facial deviation, slurred speech',
    surgery: 'None',
    procedure: 'Intravenous Thrombolysis (Tissue Plasminogen Activator), MRI stroke protocol',
    stay: 5,
    roomRent: 12000,
    icuCharges: 48000,
    otCharges: 0,
    medicine: 115000,
    investigations: 34000,
    profFees: 50000,
    finalBill: 307000,
    path: 'high-risk'
  },
  {
    filename: 'Apollo_Glaucoma_HighRisk_Claim.json',
    hospitalName: 'Apollo Hospitals, Jubilee Hills',
    doctorName: 'Dr. C. Shekhar',
    patientName: 'Subbarami Reddy',
    dob: '1949-08-18',
    age: 76,
    phone: '+91 98490 22110',
    address: 'Road No. 12, Banjara Hills, Hyderabad - 500034',
    providerName: 'Apollo Munich Health Insurance',
    tpaName: 'Medi Assist TPA',
    policyNumber: 'AP-55410-09',
    memberId: 'MED-AP-11902',
    groupId: 'VIP-GOLD',
    insuranceId: 'INS-AP-9908',
    diagnosis: 'Advanced Primary Open Angle Glaucoma (Bilateral)',
    icd10: ['H40.113'],
    symptoms: 'Progressive loss of peripheral vision, elevated intraocular pressure',
    surgery: 'Trabeculectomy with MMC (Mitomycin-C) in Right Eye',
    procedure: 'Glaucoma Filtering Surgery',
    stay: 2,
    roomRent: 15000,
    icuCharges: 0,
    otCharges: 45000,
    medicine: 18000,
    investigations: 15000,
    profFees: 40000,
    finalBill: 148000,
    path: 'high-risk'
  },
  {
    filename: 'Global_Hospitals_Trauma_Claim.json',
    hospitalName: 'Global Hospitals, Parel',
    doctorName: 'Dr. K. R. Prasad',
    patientName: 'Rahul Deshmukh',
    dob: '1988-12-05',
    age: 37,
    phone: '+91 99300 22114',
    address: 'Shivaji Park, Dadar West, Mumbai - 400028',
    providerName: 'Star Health Health Insurance',
    tpaName: 'Star Health In-house TPA',
    policyNumber: 'SH-990822-11',
    memberId: 'MEM-SH-44312',
    groupId: 'CORP-MAHINDRA',
    insuranceId: 'INS-SH-1109',
    diagnosis: 'Polytrauma - Closed Fracture Femur Shaft + Left Rib Fractures',
    icd10: ['S72.301A', 'S22.42XA'],
    symptoms: 'Severe pain, swelling, deformity in right thigh, pleuritic chest pain',
    surgery: 'Closed Reduction and Internal Fixation (CRIF) with Interlocking Nail',
    procedure: 'Femur Fracture Nail Orthopedic Surgery',
    stay: 5,
    roomRent: 9500,
    icuCharges: 35000,
    otCharges: 65000,
    medicine: 42000,
    investigations: 28000,
    profFees: 60000,
    finalBill: 277500,
    path: 'high-risk'
  },
  {
    filename: 'Fortis_Orthopedics_HighRisk_Claim.json',
    hospitalName: 'Fortis Hospital, Anandapur',
    doctorName: 'Dr. Ronen Roy',
    patientName: 'Subhas Bose',
    dob: '1952-01-23',
    age: 74,
    phone: '+91 98300 12345',
    address: '12/1, Elgin Road, Kolkata - 700020',
    providerName: 'HDFC ERGO Health Insurance',
    tpaName: 'Paramount Health Services',
    policyNumber: 'HE-9908231',
    memberId: 'PAR-HE-22119',
    groupId: 'INDIVIDUAL-SENIOR',
    insuranceId: 'INS-HE-9908',
    diagnosis: 'Avascular Necrosis of Femoral Head (Bilateral)',
    icd10: ['M87.051'],
    symptoms: 'Severe hip pain, inability to bear weight, limp',
    surgery: 'Total Hip Arthroplasty (Left Hip Replacement)',
    procedure: 'Total Hip Replacement Surgery',
    stay: 5,
    roomRent: 11000,
    icuCharges: 0,
    otCharges: 65000,
    medicine: 54000,
    investigations: 18000,
    profFees: 75000,
    finalBill: 267000,
    path: 'high-risk'
  }
];

// Generate each JSON file
cases.forEach((item, index) => {
  const claimId = `CLM-${2852 + index}`;

  // Target directory determined by path
  const subDir = item.path === 'healthy' ? healthyDir : item.path === 'review' ? reviewDir : highRiskDir;

  // Initialize ClassifiedPages
  const classifiedPages = [
    { page: 1, type: 'preauth', confidence: 98 },
    { page: 2, type: 'hospital invoice', confidence: 95 }
  ];
  if (item.path !== 'review') {
    classifiedPages.push({ page: 3, type: 'discharge summary', confidence: 94 });
  }
  classifiedPages.push({ page: 4, type: 'clinical note', confidence: 92 });
  
  if (item.path === 'healthy') {
    classifiedPages.push({ page: 5, type: 'aadhaar_card', confidence: 96 });
    classifiedPages.push({ page: 6, type: 'pan_card', confidence: 95 });
  } else if (item.path === 'review') {
    classifiedPages.push({ page: 5, type: 'aadhaar_card', confidence: 96 });
  }

  // Initialize ExtractedFields
  const extractedFields = {
    patient: {
      full_name: buildField(item.patientName, 1, 'preauth', 98),
      dob: buildField(item.dob, 1, 'preauth', 95),
      gender: buildField(item.age > 45 ? 'Male' : 'Female', 1, 'preauth', 96),
      age: buildField(item.age, 1, 'preauth', 96),
      phone: buildField(item.phone, 1, 'preauth', 94),
      address: buildField(item.address, 1, 'preauth', 92)
    },
    insurance: {
      provider_name: buildField(item.providerName, 1, 'preauth', 95),
      tpa_name: buildField(item.tpaName, 1, 'preauth', 95),
      policy_number: buildField(item.policyNumber, 1, 'preauth', 96),
      member_id: buildField(item.memberId, 1, 'preauth', 97),
      corporate_or_group_id: buildField(item.groupId, 1, 'preauth', 94),
      insurance_id: buildField(item.insuranceId, 1, 'preauth', 92)
    },
    hospital: {
      facility_name: buildField(item.hospitalName, 1, 'preauth', 97),
      doctor_name: buildField(item.doctorName, 1, 'preauth', 96),
      registration_number: buildField(`REG-HOSP-${8800 + index}`, 1, 'preauth', 90),
      admission_date: buildField('2026-05-25', 1, 'preauth', 95),
      discharge_date: buildField('2026-05-28', 1, 'preauth', 95)
    },
    clinical: {
      diagnosis: buildField(item.diagnosis, 1, 'preauth', 97),
      icd10_codes: buildField(item.icd10, 1, 'preauth', 96),
      symptoms: buildField(item.symptoms, 4, 'clinical note', 92),
      surgery: buildField(item.surgery, 4, 'clinical note', 93),
      procedure: buildField(item.procedure, 4, 'clinical note', 93),
      length_of_stay: buildField(item.stay, 4, 'clinical note', 95),
      emergency_case: buildField(false, 1, 'preauth', 90)
    },
    financial: {
      room_rent: buildField(item.roomRent, 2, 'invoice', 97),
      icu_charges: buildField(item.icuCharges, 2, 'invoice', 97),
      ot_charges: buildField(item.otCharges, 2, 'invoice', 97),
      medicine: buildField(item.medicine, 2, 'invoice', 96),
      investigations: buildField(item.investigations, 2, 'invoice', 96),
      professional_fees: buildField(item.profFees, 2, 'invoice', 96),
      final_bill: buildField(item.finalBill, 2, 'invoice', 98),
      total_claimed: buildField(item.finalBill, 1, 'preauth', 98)
    },
    authorization: {
      patient_signature: buildField(true, 1, 'preauth', 95),
      doctor_signature: buildField(true, 1, 'preauth', 95),
      hospital_seal: buildField(item.path !== 'review', 1, 'preauth', 95),
      approval_stamp: buildField(true, 1, 'preauth', 95)
    }
  };

  // Scenarios Configurations
  let claimHealth = 92;
  let readiness = 96;
  let rejectionRisk = 'low';
  let state = 'READY';
  const validationErrors = [];
  const repairSuggestions = [];

  const items = [
    { id: 'preauth_form', label: 'Pre-Authorization Form', required: true, present: true, page: 1, confidence: 98 },
    { id: 'insurance_card_member', label: 'Insurance / TPA Membership Card', required: true, present: true, page: 1, confidence: 97 },
    { id: 'aadhaar_card', label: 'Aadhaar Card', required: true, present: true, page: 5, confidence: 96 },
    { id: 'pan_card', label: 'PAN Card', required: true, present: item.path === 'healthy', page: item.path === 'healthy' ? 6 : null, confidence: item.path === 'healthy' ? 95 : 0 },
    { id: 'clinical_note_doctor', label: "Doctor's Clinical Note", required: true, present: true, page: 4, confidence: 92 },
    { id: 'policy_schedule', label: 'Insurance Policy Schedule', required: false, present: true, page: 4, confidence: 90 }
  ];

  if (item.path === 'healthy') {
    claimHealth = 95;
    readiness = 98;
    rejectionRisk = 'low';
    state = 'READY';
  } else if (item.path === 'review') {
    claimHealth = 71;
    readiness = 68;
    rejectionRisk = 'medium';
    state = 'REVIEW_REQUIRED';
    
    // Add specific yellow path issues (missing hospital stamp / discharge summary)
    extractedFields.authorization.hospital_seal.value = false;
    extractedFields.authorization.hospital_seal.confidence = 0;
    
    validationErrors.push({
      field: 'authorization.hospital_seal',
      issue: 'Hospital seal or stamp was not detected on page 1 of Preauth form',
      severity: 'high',
      pages: [1],
      suggestedAction: 'Affix the official hospital stamp and signature in Part B, then re-upload or mark verified if physically checked.'
    });
    
    validationErrors.push({
      field: 'documents.discharge_summary',
      issue: 'Missing required document: Discharge Summary. The hospital relief and billing summary was not detected in the document stream.',
      severity: 'high',
      pages: [],
      suggestedAction: 'Upload the treating doctor\'s signed Discharge Summary showing final outcomes and discharge vitals.'
    });

    repairSuggestions.push({
      fieldId: 'authorization.hospital_seal',
      suggestion: 'Hospital Seal missing. Mark Verified if verified offline.',
      confidence: 80,
      reason: 'The seal block is empty. Hospital desk seal validation required.'
    });

    repairSuggestions.push({
      fieldId: 'documents.discharge_summary',
      suggestion: 'Upload a signed Discharge Summary.',
      confidence: 85,
      reason: 'A signed summary must confirm final recovery status before cashless adjudication.'
    });
    
    // Set checklist status
    items[3].present = false; // PAN card missing
  } else if (item.path === 'high-risk') {
    claimHealth = 35;
    readiness = 30;
    rejectionRisk = 'high';
    state = 'REVIEW_REQUIRED';

    // Add multiple red path issues (missing Aadhaar, PAN card, invalid dates, billing math mismatches)
    extractedFields.patient.dob.value = null;
    extractedFields.patient.dob.confidence = 0;
    extractedFields.authorization.doctor_signature.value = false;
    extractedFields.authorization.doctor_signature.confidence = 0;

    validationErrors.push({
      field: 'patient.dob',
      issue: 'Patient Date of Birth is missing from demographics',
      severity: 'critical',
      pages: [1],
      suggestedAction: 'Please enter patient\'s Date of Birth from Aadhaar or policy schedule.'
    });

    validationErrors.push({
      field: 'clinical.length_of_stay',
      issue: 'Chronological inconsistency: Length of Stay (12 days) exceeds the duration between Admission and Discharge dates (3 days)',
      severity: 'critical',
      pages: [1, 4],
      suggestedAction: 'Resolve length of stay discrepancy in clinical summary.'
    });

    validationErrors.push({
      field: 'documents.aadhaar_card',
      issue: 'Missing required document: Aadhaar Card. Govt-mandated KYC ID proof not detected.',
      severity: 'critical',
      pages: [],
      suggestedAction: 'Upload the patient\'s Aadhaar card (front and back) to resolve the KYC check.'
    });

    validationErrors.push({
      field: 'financial.final_bill',
      issue: `Math validation failed: Billed item totals sum to INR 352,000, which does not match final bill INR 537,000`,
      severity: 'high',
      pages: [2],
      suggestedAction: 'Correct the itemized charges to match the total final bill amount.'
    });

    validationErrors.push({
      field: 'authorization.doctor_signature',
      issue: 'Treating Physician signature missing on page 4 clinical report',
      severity: 'critical',
      pages: [4],
      suggestedAction: 'Obtain doctor\'s digital or physical signature on the clinical note.'
    });

    repairSuggestions.push({
      fieldId: 'patient.dob',
      suggestion: 'Manually input DOB from policy certificate.',
      confidence: 90,
      reason: 'Demographics block is incomplete.'
    });

    repairSuggestions.push({
      fieldId: 'authorization.doctor_signature',
      suggestion: 'Upload signed doctor clinical referral sheet.',
      confidence: 65,
      reason: 'Signature line is blank.'
    });

    // Checklist issues
    items[2].present = false; // Aadhaar missing
    items[3].present = false; // PAN card missing
  }

  // Construct DocumentChecklist
  const missingRequired = items.filter(i => i.required && !i.present).map(i => i.id);
  const documentChecklist = {
    items,
    allRequiredPresent: missingRequired.length === 0,
    missingRequired
  };

  // Audit trail logs
  const auditLogs = [
    { stage: 'UPLOADED', timestamp: new Date(Date.now() - 3000 * 60).toISOString(), message: `PDF document uploaded: ${item.pdfName || item.filename.replace('.json', '.pdf')}` },
    { stage: 'PROCESSING', timestamp: new Date(Date.now() - 2800 * 60).toISOString(), message: 'OCR process initiated. Running Tesseract layout analysis.' },
    { stage: 'OCR_COMPLETE', timestamp: new Date(Date.now() - 2500 * 60).toISOString(), message: `OCR extraction complete. Text layers identified. Confidence: ${extractedFields.patient.full_name.confidence}%` },
    { stage: 'CLASSIFIED', timestamp: new Date(Date.now() - 2000 * 60).toISOString(), message: `Classified pages: ${classifiedPages.map(p => `${p.type} (p.${p.page})`).join(', ')}` },
    { stage: 'EXTRACTED', timestamp: new Date(Date.now() - 1500 * 60).toISOString(), message: `Entities extracted. Found patient ${item.patientName}, provider ${item.providerName}, hospital ${item.hospitalName}` }
  ];

  if (state === 'READY') {
    auditLogs.push({ stage: 'READY', timestamp: new Date(Date.now() - 1000 * 60).toISOString(), message: 'Validation complete. No errors flagged. Ready to submit.' });
  } else {
    auditLogs.push({ stage: 'REVIEW_REQUIRED', timestamp: new Date(Date.now() - 1000 * 60).toISOString(), message: `Validation flagged ${validationErrors.length} errors. Review & repair required.` });
  }

  const packet = {
    success: true,
    extractionMethod: 'mixed',
    claimId,
    uploadSessionId: '',
    pageCount: classifiedPages.length,
    classifiedPages,
    extractedFields,
    validationErrors,
    claimHealth,
    readiness,
    ocrConfidence: extractedFields.patient.full_name.confidence,
    extractionConfidence: extractedFields.patient.full_name.confidence - 3,
    rejectionRisk,
    repairSuggestions,
    pdfType: 'text_layer',
    state,
    documentChecklist,
    auditLogs
  };

  fs.writeFileSync(
    path.join(subDir, item.filename),
    JSON.stringify(packet, null, 2),
    'utf8'
  );
  
  // Copy PDF file if pdfName is defined
  if (item.pdfName) {
    try {
      const pdfDestFile = path.join(pdfSourceDir, item.pdfName);
      fs.copyFileSync(pdfSourceFile, pdfDestFile);
      console.log(`Copied PDF: ${item.pdfName}`);
    } catch (pdfErr) {
      console.error(`Failed to copy PDF for ${item.pdfName}:`, pdfErr.message);
    }
  }

  console.log(`Generated: ${item.path.toUpperCase()}/${item.filename} (ClaimId: ${claimId})`);
});

console.log('Successfully generated categorized claim packets and PDFs.');
