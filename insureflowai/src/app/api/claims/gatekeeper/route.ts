import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { runGatekeeper, type UploadedDoc } from '@/lib/claims';
import { getDemoModeState } from '@/lib/demoMode';

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const documents = body?.documents as Record<string, UploadedDoc> | undefined;

  if (!documents || typeof documents !== 'object') {
    return jsonError('Uploaded documents are required.');
  }

  const demoMode = await getDemoModeState();
  if (!demoMode.enabled) {
    const docs = Object.values(documents);
    const hasReadableDocument = docs.some(
      (doc) => doc.status === 'passed' || doc.status === 'warning'
    );

    return jsonOk({
      passed: hasReadableDocument,
      detectedName: null,
      confidence: 0,
      checks: [
        { id: 'ocr-pass', status: hasReadableDocument ? 'passed' : 'failed' },
        { id: 'patient-name', status: 'pending' },
        { id: 'doc-type', status: docs.length > 0 ? 'passed' : 'failed' },
        { id: 'readability', status: hasReadableDocument ? 'passed' : 'failed' },
      ],
      source: 'live',
    });
  }

  return jsonOk(runGatekeeper(documents));
}
