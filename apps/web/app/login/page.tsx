// apps/web/app/login/page.tsx
"use client";

import { Suspense } from 'react';
import LoginSection from '@/components/login/LoginSection';

export default function Page() {
  return (
    <main>
      <Suspense fallback={null}>
        <LoginSection />
      </Suspense>
    </main>
  );
}