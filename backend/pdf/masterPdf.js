const PDFDocument = require('pdfkit');

const writeMasterPacket = ({ claim, documents, aiResult }) =>
  new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({ autoFirstPage: true, margin: 48 });

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(22).text('InsureFlow AI Master Claim Packet', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Claim ID: ${claim.uniqueClaimId}`);
    doc.text(`Patient: ${claim.patientName}`);
    doc.text(`Insurance Provider: ${claim.insuranceProvider}`);
    doc.text(`Diagnosis: ${claim.diagnosis}`);
    doc.text(`Procedure: ${claim.procedure}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);

    doc.addPage();
    doc.fontSize(18).text('Claim Summary');
    doc.moveDown();
    doc.fontSize(11).text(claim.aiSummary || 'AI summary pending.');
    doc.moveDown();
    doc.text(`Risk Score: ${claim.riskScore}`);
    doc.text(`Readiness Score: ${claim.submissionReadiness?.score || 0}`);

    doc.addPage();
    doc.fontSize(18).text('AI Verification Page');
    doc.moveDown();
    doc.fontSize(11).text(JSON.stringify(aiResult || {}, null, 2));

    doc.addPage();
    doc.fontSize(18).text('Document Index');
    doc.moveDown();
    documents.forEach((document, index) => {
      doc.fontSize(11).text(`${index + 1}. ${document.documentType} - ${document.originalName}`);
      doc.text(`   URL: ${document.url}`);
      doc.text(`   OCR Status: ${document.ocrStatus}`);
      doc.moveDown(0.5);
    });

    doc.end();
  });

module.exports = { writeMasterPacket };
