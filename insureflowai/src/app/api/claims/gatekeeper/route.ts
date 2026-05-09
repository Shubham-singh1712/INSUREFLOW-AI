import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { runGatekeeper, type UploadedDoc } from '@/lib/claims';

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const documents = body?.documents as Record<string, UploadedDoc> | undefined;

  if (!documents || typeof documents !== 'object') {
    return jsonError('Uploaded documents are required.');
  }

  return jsonOk(runGatekeeper(documents));
}
