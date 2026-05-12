'use client';
import React from 'react';
import dynamic from 'next/dynamic';

const ValidationTrendChart = dynamic(() => import('./ValidationTrendChart'), { ssr: false });
const ClaimsStatusChart = dynamic(() => import('./ClaimsStatusChart'), { ssr: false });

export default function DashboardChartsRow() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5 gap-6">
      <div className="lg:col-span-3 xl:col-span-3 2xl:col-span-3">
        <ValidationTrendChart />
      </div>
      <div className="lg:col-span-2 xl:col-span-2 2xl:col-span-2">
        <ClaimsStatusChart />
      </div>
    </div>
  );
}