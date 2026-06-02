import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { classifyUploadedDocument } from '@/lib/claims';

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  const documentType = String(formData?.get('documentType') || '');

  if (!(file instanceof File)) {
    return jsonError('Upload a valid document file.');
  }

  if (!documentType) {
    return jsonError('Document type is required.');
  }

  return jsonOk({
    document: classifyUploadedDocument(file, documentType),
  });
}
