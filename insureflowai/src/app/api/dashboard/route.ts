import { jsonOk, requireUser } from '@/lib/api';

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  return jsonOk({
    user,
    metrics: {
      claimsValidatedToday: 1247,
      rejectionRateReduction: 68,
      aiAccuracyScore: 97.3,
      pendingAttention: 5,
    },
    submissionWindow: {
      closesAt: '17:00',
      timezone: 'Asia/Kolkata',
    },
  });
}
