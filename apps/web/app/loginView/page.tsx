"use client";

import HeroSection from '@/components/login/HeroSection';
import LoginSection from '@/components/login/LoginSection';

export default function Page() {
  return (
    <main className="flex h-screen overflow-hidden">
      <HeroSection />
      <LoginSection />
    </main>
  );
}