"use client";

export default function HeroSection() {
  const stats = [
    {
      label: 'Books Available',
      value: '12,543',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      label: 'Active Members',
      value: '2,891',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: 'Daily Checkouts',
      value: '347',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
  ];

  const roles = [
    {
      title: 'Guest',
      description: 'Browse the catalog freely — no account needed.',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      title: 'Student / Faculty',
      description: 'Log in with your @dlsl.edu.ph email to borrow books.',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      ),
    },
    {
      title: 'Librarian',
      description: 'Log in with your @dlsl.edu.ph email to manage the library.',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  const features = [
    {
      label: '24/7 Digital Access',
      icon: (
        <svg className="h-5 w-5 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'AI-Powered Recommendations',
      icon: (
        <svg className="h-5 w-5 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      label: 'Real-time Catalog',
      icon: (
        <svg className="h-5 w-5 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      label: '@dlsl.edu.ph Login Required',
      icon: (
        <svg className="h-5 w-5 shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative flex flex-1 items-center justify-center bg-gradient-to-br from-emerald-700 via-green-800 to-emerald-900 p-6 sm:p-8 lg:p-12">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* All content inside one correctly closed wrapper */}
      <div className="relative z-10 w-full max-w-2xl space-y-8 text-white">

        {/* Logo and Headline */}
        <div className="space-y-4 sm:space-y-6">
          <div className="inline-flex items-center space-x-3">
            <img
              src="/DeLaSalleLipa_Seal.png"
              alt="De La Salle Lipa Logo"
              className="h-24 w-24 object-contain sm:h-32 sm:w-32"
              style={{ mixBlendMode: 'screen' }}
            />
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight sm:text-2xl">Learning Resource Center</span>
              <span className="text-xs font-medium text-emerald-100 tracking-wider">De La Salle Lipa</span>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Welcome to
              <span className="block bg-gradient-to-r from-yellow-200 via-amber-100 to-yellow-200 bg-clip-text text-transparent">
                Lasallia
              </span>
            </h1>
            <p className="border-l-4 border-yellow-200 pl-4 py-1 text-base italic text-emerald-50 sm:py-2 sm:text-lg lg:text-xl">
              "Crescit Gratia Virtuteque" — He grew in grace and virtue
            </p>
            <p className="text-base text-emerald-100 sm:text-xl lg:text-2xl">
              Your AI-Powered Library System for De La Salle Lipa
            </p>
          </div>
        </div>

        {/* Who Can Access */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-200 sm:text-sm">
            Who Can Access
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {roles.map((role, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-2xl bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 hover:scale-105"
              >
                <div className="flex items-start space-x-3 sm:block sm:space-x-0 sm:space-y-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
                    {role.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">{role.title}</p>
                    <p className="text-xs text-emerald-100 leading-relaxed">{role.description}</p>
                  </div>
                </div>
                <div className="absolute inset-0 rounded-2xl border-2 border-white/0 transition-all duration-300 group-hover:border-white/30" />
              </div>
            ))}
          </div>
        </div>

        {/* Live Stats */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-200 sm:text-sm">
            Live Statistics
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-2xl bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 hover:scale-105 sm:p-6"
              >
                <div className="absolute right-3 top-3 text-white opacity-20 transition-all duration-300 group-hover:opacity-40 sm:right-4 sm:top-4">
                  {stat.icon}
                </div>
                <div className="relative space-y-0.5 sm:space-y-1">
                  <p className="text-xs font-medium text-emerald-100 sm:text-sm">{stat.label}</p>
                  <p className="text-xl font-bold sm:text-3xl">{stat.value}</p>
                </div>
                <div className="absolute inset-0 rounded-2xl border-2 border-white/0 transition-all duration-300 group-hover:border-white/30" />
              </div>
            ))}
          </div>
        </div>

        {/* Features — desktop */}
        <div className="hidden flex-wrap gap-4 text-sm sm:flex sm:gap-6">
          {features.map((feature) => (
            <div key={feature.label} className="flex items-center space-x-2">
              {feature.icon}
              <span>{feature.label}</span>
            </div>
          ))}
        </div>

        {/* Features — mobile compact */}
        <div className="grid grid-cols-2 gap-2 text-xs sm:hidden">
          {features.map((feature) => (
            <div key={feature.label} className="flex items-center space-x-1.5">
              <svg className="h-4 w-4 shrink-0 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-emerald-100">{feature.label}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}