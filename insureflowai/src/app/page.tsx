import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AuthScreen from './components/AuthScreen';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const code = Array.isArray(params?.code) ? params?.code[0] : params?.code;

  if (code) {
    const callbackParams = new URLSearchParams({ code });
    const next = Array.isArray(params?.next) ? params?.next[0] : params?.next;
    if (next) callbackParams.set('next', next);
    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/main-dashboard');
  }

  return <AuthScreen />;
}
