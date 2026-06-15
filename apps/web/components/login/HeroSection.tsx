"use client";

export default function HeroSection() {
  const stats = [
    {
      label: 'Books Available',
      value: '12,543',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      label: 'Active Members',
      value: '2,891',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: 'Daily Checkouts',
      value: '347',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
  ];

  const features = [
    {
      label: '24/7 Digital Access',
      icon: (
        <svg className="h-4 w-4 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'AI Recommendations',
      icon: (
        <svg className="h-4 w-4 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      label: 'Real-time Catalog',
      icon: (
        <svg className="h-4 w-4 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      label: 'DLSL-Only Access',
      icon: (
        <svg className="h-4 w-4 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-linear-to-br from-emerald-700 via-green-800 to-emerald-900 px-4 py-8 sm:px-6 sm:py-6 md:py-3 lg:px-8">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col justify-center gap-3 text-white sm:gap-4">

        {/* Logo and Headline */}
        <div className="space-y-2 sm:space-y-3">
          <div className="inline-flex items-center space-x-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white bg-white sm:h-16 sm:w-16">
              <img
                src="/DeLaSalleLipa_Seal.png"
                alt="De La Salle Lipa Logo"
                className="h-20 w-20 object-contain sm:h-24 sm:w-24"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight sm:text-xl">Learning Resource Center</span>
              <span className="text-2xs font-medium text-emerald-300 tracking-wider uppercase sm:text-xs">De La Salle Lipa</span>
            </div>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">
              Welcome to
              <span className="block bg-linear-to-r from-yellow-200 via-amber-100 to-yellow-200 bg-clip-text text-transparent">
                Lasallia
              </span>
            </h1>
            <p className="border-l-2 border-yellow-200 pl-3 text-xs italic text-emerald-50 sm:text-sm lg:text-base">
              Teaching Minds, Touching Hearts, and Transforming Lives.
            </p>
          </div>
        </div>

        {/* About Lasallia */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
          <p className="text-xs text-emerald-100 leading-snug sm:text-sm">
            <span className="text-yellow-200 font-semibold">Lasallia</span> is the AI-powered smart library system of De La Salle Lipa's LRC — search, reserve, and discover books from any device, anytime.
          </p>
        </div>

        {/* Live Stats */}
        <div className="space-y-1.5 sm:space-y-2">
          <h3 className="text-2xs font-semibold uppercase tracking-widest text-emerald-200 sm:text-xs">
            Live Statistics
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-md transition-all duration-300 hover:bg-white/10 sm:p-3"
              >
                <div className="absolute right-2 top-2 text-white opacity-15 transition-all duration-300 group-hover:opacity-30">
                  {stat.icon}
                </div>
                <div className="relative space-y-0">
                  <p className="text-2xs font-medium text-emerald-100 sm:text-xs">{stat.label}</p>
                  <p className="text-base font-bold text-white sm:text-xl lg:text-2xl">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Features — compact grid, icon + label only */}
        <div className="space-y-1.5 sm:space-y-2">
          <h3 className="text-2xs font-semibold uppercase tracking-widest text-emerald-200 sm:text-xs">
            What Lasallia Offers
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2">
            {features.map((feature) => (
              <div
                key={feature.label}
                className="flex items-center space-x-1.5 rounded-lg border border-white/8 bg-white/5 px-2 py-1.5"
              >
                {feature.icon}
                <span className="text-2xs font-medium text-emerald-100 sm:text-xs">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}