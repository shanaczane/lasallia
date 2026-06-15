"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type UserRole = 'guest' | 'student' | 'librarian';

export default function LoginSection() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState({
    email: '',
    password: '',
  });

  const validateDLSLEmail = (value: string): boolean => {
    const pattern = /^[^\s@]+@dlsl\.edu\.ph$/i;
    return pattern.test(value);
  };

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setErrors({ email: '', password: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedRole === 'guest') {
      router.push('/guest/dashboard');
      return;
    }

    setErrors({ email: '', password: '' });

    if (!validateDLSLEmail(formData.email)) {
      setErrors(prev => ({
        ...prev,
        email: 'Please enter a valid DLSL email address (e.g., juandelacruz@dlsl.edu.ph)',
      }));
      return;
    }

    if (formData.password.length < 6) {
      setErrors(prev => ({
        ...prev,
        password: 'Password must be at least 6 characters long.',
      }));
      return;
    }

    router.push(selectedRole === 'student' ? '/student/dashboard' : '/librarian/dashboard');
  };
  const [showPassword, setShowPassword] = useState(false);

  const isGuest = selectedRole === 'guest';

  return (
    /* Outer container: background image + dark overlay, locked to parent height */
    <div
      className="relative flex h-full flex-1 items-center justify-center overflow-hidden px-4 py-3 sm:px-6 sm:py-4 lg:px-8"
      style={{
        backgroundImage: `url('/DeLaSalleLip_LRC Banner.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay so the form stays readable */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Form card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="max-h-full overflow-y-auto rounded-2xl border border-white/20 bg-white/95 p-4 shadow-2xl backdrop-blur-md sm:p-6">

          {/* Header */}
          <div className="mb-3 text-center sm:mb-4">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Sign In</h2>
            <p className="mt-1 text-xs text-gray-600 sm:text-sm">
              Access your library account to get started
            </p>
          </div>

          {/* Role Selection Cards */}
          <div className="mb-3 space-y-1.5 sm:mb-4 sm:space-y-2">
            <label className="text-xs font-semibold text-gray-700 sm:text-sm">Select Your Role</label>
            <div className="grid grid-cols-3 gap-2">
              {/* Guest Card */}
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => handleRoleChange('guest')}
                className={`group relative overflow-hidden rounded-lg border-2 p-2 text-left transition-all duration-200 sm:p-3 ${
                  selectedRole === 'guest'
                    ? 'border-gray-600 bg-gray-50 shadow-md shadow-gray-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="space-y-1">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md sm:h-8 sm:w-8 ${
                    selectedRole === 'guest' ? 'bg-gray-600' : 'bg-gray-100 group-hover:bg-gray-200'
                  } transition-colors`}>
                    <svg className={`h-4 w-4 ${selectedRole === 'guest' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-xs text-gray-900 sm:text-sm">Guest</h3>
                    <p className="text-[10px] text-gray-500 sm:text-xs">Browse catalog</p>
                  </div>
                </div>
                {selectedRole === 'guest' && (
                  <div className="absolute right-1.5 top-1.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-600">
                      <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>

              {/* Student Card */}
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => handleRoleChange('student')}
                className={`group relative overflow-hidden rounded-lg border-2 p-2 text-left transition-all duration-200 sm:p-3 ${
                  selectedRole === 'student'
                    ? 'border-emerald-600 bg-emerald-50 shadow-md shadow-emerald-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="space-y-1">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md sm:h-8 sm:w-8 ${
                    selectedRole === 'student' ? 'bg-emerald-600' : 'bg-gray-100 group-hover:bg-gray-200'
                  } transition-colors`}>
                    <svg className={`h-4 w-4 ${selectedRole === 'student' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div>
                    <h3 className={`font-semibold text-xs sm:text-sm ${selectedRole === 'student' ? 'text-emerald-900' : 'text-gray-900'}`}>
                      Student
                    </h3>
                    <p className="text-[10px] text-gray-500 sm:text-xs">Browse & borrow</p>
                  </div>
                </div>
                {selectedRole === 'student' && (
                  <div className="absolute right-1.5 top-1.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600">
                      <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>

              {/* Librarian Card */}
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => handleRoleChange('librarian')}
                className={`group relative overflow-hidden rounded-lg border-2 p-2 text-left transition-all duration-200 sm:p-3 ${
                  selectedRole === 'librarian'
                    ? 'border-amber-500 bg-amber-50 shadow-md shadow-amber-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="space-y-1">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md sm:h-8 sm:w-8 ${
                    selectedRole === 'librarian' ? 'bg-amber-500' : 'bg-gray-100 group-hover:bg-gray-200'
                  } transition-colors`}>
                    <svg className={`h-4 w-4 ${selectedRole === 'librarian' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className={`font-semibold text-xs sm:text-sm ${selectedRole === 'librarian' ? 'text-amber-900' : 'text-gray-900'}`}>
                      Librarian
                    </h3>
                    <p className="text-[10px] text-gray-500 sm:text-xs">Manage library</p>
                  </div>
                </div>
                {selectedRole === 'librarian' && (
                  <div className="absolute right-1.5 top-1.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500">
                      <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Guest notice */}
          {isGuest && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 sm:text-sm">
              As a guest, you can browse the catalog without signing in. No credentials required.
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {!isGuest && (
              <div className="space-y-2.5 sm:space-y-3">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-gray-700 sm:text-sm">
                    De La Salle Lipa Email Address
                  </label>
                  <div className="relative mt-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg className="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      suppressHydrationWarning
                      id="email"
                      name="email"
                      type="email"
                      placeholder="juandelacruz@dlsl.edu.ph"
                      value={formData.email}
                      onChange={(e) => {
                        setFormData({ ...formData, email: e.target.value });
                        if (errors.email) setErrors({ ...errors, email: '' });
                      }}
                      className={`block w-full rounded-lg border ${
                        errors.email ? 'border-red-500' : 'border-gray-300'
                      } py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 sm:py-2.5 sm:pl-10 ${
                        errors.email ? 'focus:ring-red-500/20' : 'focus:ring-emerald-600/20'
                      } transition-all`}
                      required
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-600 flex items-center">
                      <svg className="h-3.5 w-3.5 mr-1 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {errors.email}
                    </p>
                  )}
                </div>

               {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-gray-700 sm:text-sm">
                    Password
                  </label>
                  <div className="relative mt-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg className="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      suppressHydrationWarning
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => {
                        setFormData({ ...formData, password: e.target.value });
                        if (errors.password) setErrors({ ...errors, password: '' });
                      }}
                      className={`block w-full rounded-lg border ${
                        errors.password ? 'border-red-500' : 'border-gray-300'
                      } py-2 pl-9 pr-11 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 sm:py-2.5 sm:pl-10 sm:pr-12 transition-all`}
                      required
                      minLength={6}
                    />

                    {/* Password Toggle Button (Eye Icon) */}
                    <button
                      type="button"
                      suppressHydrationWarning
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                    >
                      {showPassword ? (
                        // Open Eye
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5 16.477 5 20.268 7.943 21.542 12 20.268 16.057 16.477 19 12 19 7.523 19 3.732 16.057 2.458 12z" />
                        </svg>
                      ) : (
                        // Closed Eye with Slash
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908l3.42 3.42M3 3l18 18" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5 16.477 5 20.268 7.943 21.542 12" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {errors.password && (
                    <p className="mt-1 text-xs text-red-600 flex items-center">
                      <svg className="h-3.5 w-3.5 mr-1 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {errors.password}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Remember Me & Forgot Password */}
            {!isGuest && (
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 sm:h-4 sm:w-4"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-gray-700">
                    Remember me
                  </label>
                </div>
                <button type="button" suppressHydrationWarning className="font-medium text-emerald-700 hover:text-emerald-600 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              suppressHydrationWarning
              type="submit"
              className={`w-full rounded-lg py-2.5 px-4 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] sm:py-3 sm:text-base ${
                selectedRole === 'guest'
                  ? 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800'
                  : selectedRole === 'student'
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
              }`}
            >
              {isGuest
                ? 'Continue as Guest'
                : `Sign In as ${selectedRole === 'student' ? 'Student / Faculty' : 'Librarian'}`}
            </button>
          </form>

          {/* Additional Links */}
          <div className="mt-3 space-y-2 sm:mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs sm:text-sm">
                <span className="bg-white px-3 text-gray-500">Need help?</span>
              </div>
            </div>
            <div className="flex justify-center space-x-4 text-xs sm:space-x-6 sm:text-sm">
              <button type="button" suppressHydrationWarning className="text-gray-600 hover:text-gray-900 transition-colors">
                Contact Support
              </button>
              <span className="text-gray-300">|</span>
              <button type="button" suppressHydrationWarning className="text-gray-600 hover:text-gray-900 transition-colors">
                System Status
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}