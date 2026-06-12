"use client";

import HeroSection from '@/components/login/HeroSection';
import LoginSection from '@/components/login/LoginSection';

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <div className="flex-none lg:flex-1">
        <HeroSection />
      </div>
      <LoginSection />
    </main>
  );
}