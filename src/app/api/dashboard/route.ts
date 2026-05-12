import { jsonOk, requireUser } from '@/lib/api';
import { demoDashboardClaims, demoDashboardMetrics, emptyDashboardMetrics } from '@/lib/demoData';
import { getDemoModeState } from '@/lib/demoMode';
import { buildLiveDashboardMetrics, listLiveClaims, toDashboardClaims } from '@/lib/liveClaims';
import { APP_TIME_ZONE, getTimeOfDayGreeting, getUserDisplayName } from '@/lib/serverGreeting';

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const demoMode = await getDemoModeState();
  const liveClaims = await listLiveClaims(user.id);
  const claims = demoMode.enabled ? demoDashboardClaims : toDashboardClaims(liveClaims);

  return jsonOk({
    user,
    demoMode,
    serverTime: {
      iso: new Date().toISOString(),
      timeZone: APP_TIME_ZONE,
      greeting: getTimeOfDayGreeting(),
      displayName: getUserDisplayName(user),
    },
    metrics: demoMode.enabled
      ? demoDashboardMetrics
      : liveClaims.length > 0
        ? buildLiveDashboardMetrics(liveClaims)
        : emptyDashboardMetrics,
    claims,
    submissionWindow: {
      closesAt: '17:00',
      timezone: 'Asia/Kolkata',
    },
  });
}
