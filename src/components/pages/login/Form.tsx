'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
// This hook will now provide the password reset functions
import { useAuth } from '@/contexts/AuthContext';

export const LoginSection = ({ redirectTo = '/' }: { redirectTo?: string }) => {
  // Destructuring the correct functions from the AuthContext
  const { signIn, user, sendPasswordResetEmail } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState('login'); // 'login' or 'forgotPassword'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Mount check and user redirect logic
  useEffect(() => {
    setMounted(true);
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  if (!mounted) {
    return (
      <section className="w-full py-16 md:py-24 lg:py-32">
        <Card className="max-w-md mx-auto bg-transparent border-none">
          <CardContent className="flex justify-center pt-6">
            <h2 className="font-['Hind',Helvetica] font-bold text-[#961c18] text-[28px]">Loading...</h2>
          </CardContent>
        </Card>
      </section>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    setMessage('');
    
    const { error, user: signedInUser } = await signIn(email, password);
    if (error) {
      setErrors({ general: (error as { message?: string }).message || 'Invalid login credentials.' });
    } else if (signedInUser && !signedInUser.emailVerification) {
      router.push('/verify-email');
    } else {
      router.push(redirectTo);
    }
    setIsLoading(false);
  };

  // This function now correctly calls 'sendPasswordResetEmail' from the context
  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrors({ email: 'Please enter your email to receive a reset link.' });
      return;
    }
    
    setIsLoading(true);
    setErrors({});
    setMessage('');

    const { error } = await sendPasswordResetEmail(email); 
    
    if (error) {
      setErrors({ general: (error as { message?: string }).message || 'Failed to send reset instructions.' });
    } else {
      setMessage('Password reset instructions have been sent to your email. Please check your inbox.');
    }
    setIsLoading(false);
  };

  return (
    <section className="w-full py-16 md:py-24 lg:py-32 relative z-10">
      {/* Background Image Elements */}
      <div className="absolute inset-0 z-0 opacity-20">
        {/* Left side - normal image */}
        <div 
            className="absolute top-0 left-0 w-1/2 h-full bg-cover bg-no-repeat bg-center"
            style={{ backgroundImage: "url('/images/Mask Group.png')" }}
        ></div>
        {/* Right side - inverted image */}
        <div 
            className="absolute top-0 right-0 w-1/2 h-full bg-cover bg-no-repeat bg-center transform -scale-x-100"
            style={{ backgroundImage: "url('/images/Mask Group.png')" }}
        ></div>
      </div>
      <Card className="max-w-md mx-auto bg-transparent border-none shadow-none relative z-20">
        <CardContent className="flex flex-col items-center space-y-6 pt-6">
          <h2 className="font-['Hind',Helvetica] font-bold text-[#961c18] text-[28px] text-center tracking-wide leading-tight">
            {view === 'login' && 'WELCOME TO KVE'}
            {view === 'forgotPassword' && 'RESET YOUR PASSWORD'}
          </h2>

          {errors.general && <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm w-full">{errors.general}</div>}
          {message && <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-3 rounded-lg text-sm w-full">{message}</div>}

          {view === 'login' && (
            <form onSubmit={handleLogin} className="w-full space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="font-['Hind',Helvetica] text-[#961c18] text-xl">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full h-10 rounded-lg border-2 bg-black text-white px-3 outline-none ${errors.email ? 'border-red-500' : 'border-[#961c18]'}`} placeholder="Enter your email" disabled={isLoading} />
                {errors.email && <p className="text-red-400 text-sm">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="font-['Hind',Helvetica] text-[#961c18] text-xl">Password</label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full h-10 rounded-lg border-2 bg-black text-white px-3 outline-none ${errors.password ? 'border-red-500' : 'border-[#961c18]'}`} placeholder="Enter your password" disabled={isLoading} />
                {errors.password && <p className="text-red-400 text-sm">{errors.password}</p>}
              </div>
              <Button type="submit" disabled={isLoading} className="w-full h-10 bg-[#961c18] hover:bg-[#7a1714] disabled:bg-gray-600 rounded font-['Hind',Helvetica] font-bold text-white text-xl">{isLoading ? 'SIGNING IN...' : 'LOGIN'}</Button>
              <div className="text-center">
                <p className="text-gray-400 text-sm">Don&apos;t have an account? <Link href="/register" className="text-[#961c18] hover:underline">Sign up here</Link></p>
              </div>
              <div className="text-center">
                <button type="button" onClick={() => { setView('forgotPassword'); setErrors({}); setMessage(''); }} className="text-[#961c18] hover:underline">Forgot password?</button>
              </div>
            </form>
          )}

          {view === 'forgotPassword' && (
            <form onSubmit={handleSendResetLink} className="w-full space-y-4">
              <p className="text-gray-300 text-center">Enter your email address and we&apos;ll send you a link to reset your password.</p>
              <div className="space-y-2">
                <label htmlFor="email-forgot" className="font-['Hind',Helvetica] text-[#961c18] text-xl">Email</label>
                <input id="email-forgot" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full h-10 rounded-lg border-2 bg-black text-white px-3 outline-none ${errors.email ? 'border-red-500' : 'border-[#961c18]'}`} placeholder="Enter your email" disabled={isLoading} />
                {errors.email && <p className="text-red-400 text-sm">{errors.email}</p>}
              </div>
              <Button type="submit" disabled={isLoading} className="w-full h-10 bg-[#961c18] hover:bg-[#7a1714] disabled:bg-gray-600 rounded font-['Hind',Helvetica] font-bold text-white text-xl">{isLoading ? 'SENDING LINK...' : 'SEND RESET LINK'}</Button>
              <div className="text-center">
                <button type="button" onClick={() => { setView('login'); setErrors({}); setMessage(''); }} className="text-[#961c18] hover:underline">Back to Login</button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
