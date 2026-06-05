"use client";

import { useState } from 'react';

type UserRole = 'guest' | 'student' | 'librarian';

export default function LoginSection() {
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
    // Must end with @dlsl.edu.ph and have a non-empty local part
    const pattern = /^[^\s@]+@dlsl\.edu\.ph$/i;
    return pattern.test(value);
  };

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    // Clear errors and form when switching roles
    setErrors({ email: '', password: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Guest just proceeds — no credentials needed
    if (selectedRole === 'guest') {
      alert('Continuing as Guest. You can browse the catalog.');
      return;
    }

    // Reset errors
    setErrors({ email: '', password: '' });

    // Validate DLSL email
    if (!validateDLSLEmail(formData.email)) {
      setErrors(prev => ({
        ...prev,
        email: 'Please enter a valid DLSL email address (e.g., juandelacruz@dlsl.edu.ph)',
      }));
      return;
    }

    // Validate password
    if (formData.password.length < 6) {
      setErrors(prev => ({
        ...prev,
        password: 'Password must be at least 6 characters long.',
      }));
      return;
    }

    console.log('Login attempted:', { ...formData, role: selectedRole });
    alert(`Login validation passed!\nEmail: ${formData.email}\nRole: ${selectedRole}`);
  };

  const isGuest = selectedRole === 'guest';

  return (
    <div className="flex flex-1 items-center justify-center p-8 lg:p-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Sign In</h2>
          <p className="mt-2 text-sm text-gray-600">
            Access your library account to get started
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-700">Select Your Role</label>
          <div className="grid grid-cols-3 gap-3">
            {/* Guest Card */}
            <button
              type="button"
              onClick={() => handleRoleChange('guest')}
              className={`group relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                selectedRole === 'guest'
                  ? 'border-gray-600 bg-gray-50 shadow-lg shadow-gray-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <div className="space-y-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  selectedRole === 'guest' ? 'bg-gray-600' : 'bg-gray-100 group-hover:bg-gray-200'
                } transition-colors`}>
                  <svg className={`h-5 w-5 ${selectedRole === 'guest' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-gray-900">Guest</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Browse catalog</p>
                </div>
              </div>
              {selectedRole === 'guest' && (
                <div className="absolute right-2 top-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-600">
                    <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </button>

            {/* Student / Faculty Card */}
            <button
              type="button"
              onClick={() => handleRoleChange('student')}
              className={`group relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                selectedRole === 'student'
                  ? 'border-emerald-600 bg-emerald-50 shadow-lg shadow-emerald-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <div className="space-y-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  selectedRole === 'student' ? 'bg-emerald-600' : 'bg-gray-100 group-hover:bg-gray-200'
                } transition-colors`}>
                  <svg className={`h-5 w-5 ${selectedRole === 'student' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <h3 className={`font-semibold text-sm ${selectedRole === 'student' ? 'text-emerald-900' : 'text-gray-900'}`}>
                    Student
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Browse & borrow</p>
                </div>
              </div>
              {selectedRole === 'student' && (
                <div className="absolute right-2 top-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
                    <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </button>

            {/* Librarian Card */}
            <button
              type="button"
              onClick={() => handleRoleChange('librarian')}
              className={`group relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                selectedRole === 'librarian'
                  ? 'border-amber-500 bg-amber-50 shadow-lg shadow-amber-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <div className="space-y-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  selectedRole === 'librarian' ? 'bg-amber-500' : 'bg-gray-100 group-hover:bg-gray-200'
                } transition-colors`}>
                  <svg className={`h-5 w-5 ${selectedRole === 'librarian' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`font-semibold text-sm ${selectedRole === 'librarian' ? 'text-amber-900' : 'text-gray-900'}`}>
                    Librarian
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Manage library</p>
                </div>
              </div>
              {selectedRole === 'librarian' && (
                <div className="absolute right-2 top-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500">
                    <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
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
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            👋 As a guest, you can browse the catalog without signing in. No credentials required.
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email + Password — hidden for guest */}
          {!isGuest && (
            <div className="space-y-4">
              {/* DLSL Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  DLSL Email Address
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
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
                    } py-3 pl-10 pr-3 text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 ${
                      errors.email ? 'focus:ring-red-500/20' : 'focus:ring-emerald-600/20'
                    } transition-all`}
                    required
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <svg className="h-4 w-4 mr-1 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.email}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  💚 Must be a valid <span className="font-medium">@dlsl.edu.ph</span> email address
                </p>
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      if (errors.password) setErrors({ ...errors, password: '' });
                    }}
                    className={`block w-full rounded-lg border ${
                      errors.password ? 'border-red-500' : 'border-gray-300'
                    } py-3 pl-10 pr-3 text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 ${
                      errors.password ? 'focus:ring-red-500/20' : 'focus:ring-emerald-600/20'
                    } transition-all`}
                    required
                    minLength={6}
                  />
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <svg className="h-4 w-4 mr-1 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.password}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Remember Me & Forgot Password — only for logged-in roles */}
          {!isGuest && (
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>
              <button type="button" className="text-sm font-medium text-emerald-700 hover:text-emerald-600 transition-colors">
                Forgot password?
              </button>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className={`w-full rounded-lg py-3 px-4 font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] ${
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
        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-4 text-gray-500">Need help?</span>
            </div>
          </div>
          <div className="flex justify-center space-x-6 text-sm">
            <button type="button" className="text-gray-600 hover:text-gray-900 transition-colors">
              Contact Support
            </button>
            <span className="text-gray-300">|</span>
            <button type="button" className="text-gray-600 hover:text-gray-900 transition-colors">
              System Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}