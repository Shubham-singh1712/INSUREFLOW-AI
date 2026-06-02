import { revalidatePath } from 'next/cache';

const CLAIM_VIEW_PATHS = [
  '/all-claims',
  '/main-dashboard',
  '/validation-queue',
  '/submission-queue',
];

export const revalidateClaimViews = () => {
  for (const path of CLAIM_VIEW_PATHS) {
    revalidatePath(path);
  }
};
