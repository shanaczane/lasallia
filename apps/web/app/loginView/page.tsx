"use client";

import HeroSection from '@/components/login/HeroSection';
import LoginSection from '@/components/login/LoginSection';

export default function Page() {
  return (
    <main className="flex flex-col md:flex-row md:h-screen">
      <HeroSection />
      <LoginSection />
    </main>
  );
}