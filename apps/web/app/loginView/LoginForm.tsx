"use client";

import HeroSection from '@/components/login/HeroSection';
import LoginSection from '@/components/login/LoginSection';

export default function Page() {
  return (
    <main className="flex min-h-screen">
      <div className="hidden lg:flex lg:flex-1">
        <HeroSection />
      </div>
      <LoginSection />
    </main>
  );
}