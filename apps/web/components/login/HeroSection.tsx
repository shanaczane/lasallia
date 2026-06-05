export default function HeroSection() {
  const stats = [
    { label: 'Books Available', value: '12,543', icon: '📚' },
    { label: 'Active Members', value: '2,891', icon: '👥' },
    { label: 'Daily Checkouts', value: '347', icon: '📖' },
  ];

  const roles = [
    {
      icon: '👤',
      title: 'Guest',
      description: 'Browse the catalog freely — no account needed.',
    },
    {
      icon: '🎓',
      title: 'Student / Faculty',
      description: 'Log in with your @dlsl.edu.ph email to borrow books.',
    },
    {
      icon: '🗂️',
      title: 'Librarian',
      description: 'Log in with your @dlsl.edu.ph email to manage the library.',
    },
  ];

  return (
    <div className="relative flex flex-1 items-center justify-center bg-gradient-to-br from-emerald-700 via-green-800 to-emerald-900 p-8 lg:p-12">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
      </div>

      <div className="relative z-10 max-w-2xl space-y-10 text-white">
        {/* Logo and Headline */}
        <div className="space-y-6">
          <div className="inline-flex items-center space-x-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/90 backdrop-blur-sm">
              <span className="text-3xl">🐎</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight">DLSL Library</span>
              <span className="text-xs font-medium text-emerald-100 tracking-wider">De La Salle Lipa</span>
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-5xl font-bold leading-tight lg:text-6xl">
              Welcome to
              <span className="block bg-gradient-to-r from-yellow-200 via-amber-100 to-yellow-200 bg-clip-text text-transparent">
                Lasallia
              </span>
            </h1>
            <p className="border-l-4 border-yellow-200 pl-4 py-2 text-lg italic text-emerald-50 lg:text-xl">
              "Crescit Gratia Virtuteque" — He grew in grace and virtue
            </p>
            <p className="text-xl text-emerald-100 lg:text-2xl">
              Your AI-Powered Library System for De La Salle Lipa
            </p>
          </div>
        </div>

        {/* Who Can Sign In */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-200">
            Who Can Access
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {roles.map((role, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-2xl bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 hover:scale-105"
              >
                <div className="space-y-1">
                  <div className="text-2xl">{role.icon}</div>
                  <p className="font-semibold text-sm text-white">{role.title}</p>
                  <p className="text-xs text-emerald-100 leading-relaxed">{role.description}</p>
                </div>
                {/* Animated border */}
                <div className="absolute inset-0 rounded-2xl border-2 border-white/0 transition-all duration-300 group-hover:border-white/30"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Stats */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-200">
            Live Statistics
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-2xl bg-white/10 p-6 backdrop-blur-md transition-all duration-300 hover:bg-white/20 hover:scale-105"
              >
                <div className="absolute right-4 top-4 text-4xl opacity-20 transition-all duration-300 group-hover:opacity-40">
                  {stat.icon}
                </div>
                <div className="relative space-y-1">
                  <p className="text-sm font-medium text-emerald-100">{stat.label}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
                {/* Animated border */}
                <div className="absolute inset-0 rounded-2xl border-2 border-white/0 transition-all duration-300 group-hover:border-white/30"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-6 text-sm">
          {[
            '24/7 Digital Access',
            'AI-Powered Recommendations',
            'Real-time Catalog',
            '@dlsl.edu.ph Login Required',
          ].map((feature) => (
            <div key={feature} className="flex items-center space-x-2">
              <svg className="h-5 w-5 shrink-0 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}