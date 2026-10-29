'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from '@/contexts/AuthContext';
import { validateStudentId } from '@/lib/validation/studentId';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { listmonkClientService } from "@/lib/listmonk-client";

export const RegistrationFormSection = () => {
  const { signUp, user, resendVerificationEmail } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    dob: '',
    gender: '',
    username: '',
    email: '',
    password: '',
    repeatPassword: '',
    university: '',
    studentId: '',
    phoneNumber: '',
    acceptTerms: false,
    acceptMarketing: false,
    subscribeNewsletter: false,
    user_type: 'visitor' as 'participant' | 'visitor'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const genderOptions = ["Male", "Female", "Other", "Prefer not to say"];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only redirect verified users away from the registration page. New
    // registrations must be allowed to reach /verify-email.
    if (user?.emailVerification) {
      router.push('/');
    }
  }, [user, router]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };
  
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.repeatPassword) newErrors.repeatPassword = 'Passwords do not match';
    
    // Conditional validation based on user type
    if (formData.user_type === 'participant') {
      if (!formData.university.trim()) {
        newErrors.university = 'University or institution is required for participants';
      }

      const studentIdValidation = validateStudentId(formData.studentId);
      if (!studentIdValidation.valid) {
        newErrors.studentId = studentIdValidation.error || 'Please enter a valid student ID';
      }
    }
    
    if (!formData.username.trim()) newErrors.username = 'Username/Gamertag is required';
    if (!formData.dob.trim()) newErrors.dob = 'Date of birth is required';
    if (!formData.acceptTerms) newErrors.acceptTerms = 'You must accept the terms and conditions';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const { error, user } = await signUp(
        formData.email,
        formData.password,
        {
          fullname: formData.fullName,
          email: formData.email,
          username: formData.username,
          dob: formData.dob,
          gender: formData.gender,
          university: formData.university.trim(),
          student_id: formData.studentId.trim(),
          phone_number: formData.phoneNumber,
          user_type: formData.user_type
        }
      );

      if (error) {
        const typedError = error as Error & { code?: string; field?: string };
        const errorMessage = typedError?.message || 'Registration failed. Please try again.';

        if (typedError.code === 'STUDENT_ID_INVALID' || typedError.code === 'STUDENT_ID_TAKEN') {
          setErrors({ studentId: errorMessage });
        } else if (
          typedError.code === 'ACCOUNT_EXISTS' ||
          errorMessage.includes('User already registered') ||
          errorMessage.includes('already exists')
        ) {
          setErrors({ general: 'An account with this email already exists. Please sign in instead.' });
        } else {
          setErrors({ general: errorMessage });
        }
      } else if (user) {
        // Sync to Listmonk only if user subscribed to newsletter
        if (formData.subscribeNewsletter) {
          try {
            await listmonkClientService.addContact({
              email: formData.email,
              fullname: formData.fullName,
              university: formData.university.trim() || 'Not specified',
              student_id: formData.studentId,
              phone_number: formData.phoneNumber,
              subscribeNewsletter: true
            });
          } catch (newsletterError) {
            console.error('⚠️ Failed to sync to newsletter:', newsletterError);
            // Don't result in error for user, just log it
          }
        }

        // Send verification email
        try {
          await resendVerificationEmail();
        } catch (emailError) {
          console.error('⚠️ Failed to send verification email:', emailError);
        }

        setIsLoading(false);
        router.push('/verify-email?new=true');
      }
    } catch (error) {
      setErrors({ general: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted) {
    return (
      <section className="w-full py-12 relative bg-black">
        <div className="max-w-[577px] mx-auto">
          <h2 className="text-center font-['Hind',Helvetica] font-bold text-[#961c18] text-[32px] mb-8">
            Loading...
          </h2>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full py-8 md:py-12 relative bg-black overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute top-0 left-0 w-1/2 h-full bg-cover bg-no-repeat bg-center" style={{ backgroundImage: "url('/images/Mask Group.png')" }}></div>
        <div className="absolute top-0 right-0 w-1/2 h-full bg-cover bg-no-repeat bg-center transform -scale-x-100" style={{ backgroundImage: "url('/images/Mask Group.png')" }}></div>
      </div>

      <div className="max-w-[577px] mx-auto px-4 md:px-0 relative z-10">
        <h2 className="text-center font-['Hind',Helvetica] font-bold text-[#961c18] text-2xl md:text-[32px] mb-6 md:mb-8">
          CREATE A NEW ACCOUNT
        </h2>

        {errors.general && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm mb-6">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="font-['Hind',Helvetica] font-medium text-[#961c18] text-base">Full Name</Label>
            <input id="fullName" type="text" value={formData.fullName} onChange={(e) => handleInputChange('fullName', e.target.value)} style={{ width: '100%', height: '36px', borderRadius: '8px', border: `2px solid ${errors.fullName ? '#ef4444' : '#961c18'}`, backgroundColor: 'black', color: 'white', padding: '0 12px', outline: 'none' }} placeholder="Enter your full name" disabled={isLoading} />
            {errors.fullName && (<p className="text-red-400 text-sm">{errors.fullName}</p>)}
          </div>
          
          {/* D.O.B and Gender */}
          <div className="flex gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="dob" className="font-['Hind',Helvetica] font-medium text-[#961c18] text-base">D.O.B</Label>
                <DatePicker
                        id="dob"
                        selected={formData.dob ? new Date(formData.dob) : null}
                        onChange={(date) => handleInputChange("dob", date ? date.toISOString().split("T")[0] : "")}
                        dateFormat="yyyy-MM-dd"
                        maxDate={new Date()}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select" // makes year/month selectable via dropdown
                        placeholderText="Select your date of birth"
                        className="w-full h-9 rounded-lg border-2 border-[#961c18] bg-black text-white px-3 outline-none"
                        calendarClassName="bg-black text-white border-[#961c18]"
                        wrapperClassName="w-full"
                        />
                        {errors.dob && <p className="text-red-400 text-sm">{errors.dob}</p>}


              {errors.dob && (<p className="text-red-400 text-sm">{errors.dob}</p>)}
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="gender" className="font-['Hind',Helvetica] font-medium text-[#961c18] text-base">Gender</Label>
              <select id="gender" value={formData.gender} onChange={(e) => handleInputChange('gender', e.target.value)} style={{ width: '100%', height: '36px', borderRadius: '8px', border: '2px solid #961c18', backgroundColor: 'black', color: 'white', padding: '0 12px', outline: 'none' }}>
                <option value="">Select gender</option>
                {genderOptions.map((option) => (<option key={option} value={option.toLowerCase()}>{option}</option>))}
              </select>
            </div>
          </div>

          {/* Username/Gamertag */}
          <div className="space-y-1">
            <Label htmlFor="username" className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xl">Username/Gamertag*</Label>
            <input id="username" type="text" value={formData.username} onChange={(e) => handleInputChange('username', e.target.value)} maxLength={12} style={{ width: '100%', height: '36px', borderRadius: '8px', border: `2px solid ${errors.username ? '#ef4444' : '#961c18'}`, backgroundColor: 'black', color: 'white', padding: '0 12px', outline: 'none' }} placeholder="Enter username" disabled={isLoading} />
            <p className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xs">(Max. 12 characters) - {formData.username.length}/12</p>
            {errors.username && (<p className="text-red-400 text-sm">{errors.username}</p>)}
          </div>

          {/* Email, Password, Repeat Password... */}
          <div className="space-y-2">
            <Label htmlFor="email" className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xl">Email Address*</Label>
            <input id="email" type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} style={{ width: '100%', height: '36px', borderRadius: '8px', border: `2px solid ${errors.email ? '#ef4444' : '#961c18'}`, backgroundColor: 'black', color: 'white', padding: '0 12px', outline: 'none' }} placeholder="you@email.com" disabled={isLoading} />
            {errors.email && (<p className="text-red-400 text-sm">{errors.email}</p>)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xl">Password*</Label>
            <input id="password" type="password" value={formData.password} onChange={(e) => handleInputChange('password', e.target.value)} style={{ width: '100%', height: '36px', borderRadius: '8px', border: `2px solid ${errors.password ? '#ef4444' : '#961c18'}`, backgroundColor: 'black', color: 'white', padding: '0 12px', outline: 'none' }} placeholder="Enter password" disabled={isLoading} />
            {errors.password && (<p className="text-red-400 text-sm">{errors.password}</p>)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="repeatPassword" className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xl">Repeat Password*</Label>
            <input id="repeatPassword" type="password" value={formData.repeatPassword} onChange={(e) => handleInputChange('repeatPassword', e.target.value)} style={{ width: '100%', height: '36px', borderRadius: '8px', border: `2px solid ${errors.repeatPassword ? '#ef4444' : '#961c18'}`, backgroundColor: 'black', color: 'white', padding: '0 12px', outline: 'none' }} placeholder="Repeat password" disabled={isLoading} />
            {errors.repeatPassword && (<p className="text-red-400 text-sm">{errors.repeatPassword}</p>)}
          </div>

          {/* User Type Selection */}
          <div className="space-y-4 pt-2">
            <Label className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xl">I am registering as a:</Label>
            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="type-participant"
                  name="user_type"
                  value="participant"
                  checked={formData.user_type === 'participant'}
                  onChange={() => handleInputChange('user_type', 'participant')}
                  className="h-4 w-4 accent-[#961c18]"
                  disabled={isLoading}
                />
                <Label htmlFor="type-participant" className="text-white cursor-pointer">Participant</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="type-visitor"
                  name="user_type"
                  value="visitor"
                  checked={formData.user_type === 'visitor'}
                  onChange={() => handleInputChange('user_type', 'visitor')}
                  className="h-4 w-4 accent-[#961c18]"
                  disabled={isLoading}
                />
                <Label htmlFor="type-visitor" className="text-white cursor-pointer">Visitor</Label>
              </div>
            </div>
            {formData.user_type === 'participant' && (
              <p className="text-sm text-yellow-500/80 italic">
                * Participant accounts are approved automatically once your student ID is validated. You will need to provide your institution details.
              </p>
            )}
          </div>

          {/* Conditional University/Institution Section */}
          {formData.user_type === 'participant' && (
            <div className="space-y-4 border-l-2 border-[#961c18] pl-4 my-4">
              {/* Institution Input for Participant */}
               <div className="space-y-2">
                <Label htmlFor="university" className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xl">Institution Name*</Label>
                <input 
                  id="university" // reusing university field ID for state mapping
                  type="text" 
                  value={formData.university} 
                  onChange={(e) => handleInputChange('university', e.target.value)} 
                  style={{ width: '100%', height: '36px', borderRadius: '8px', border: `2px solid ${errors.university ? '#ef4444' : '#961c18'}`, backgroundColor: 'black', color: 'white', padding: '0 12px', outline: 'none' }} 
                  placeholder="Enter your university or college name" 
                  disabled={isLoading} 
                />
                {errors.university && (<p className="text-red-400 text-sm">{errors.university}</p>)}
              </div>

              {/* Student ID */}
              <div className="space-y-2">
                <Label htmlFor="studentId" className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xl">Student ID*</Label>
                <input 
                  id="studentId" 
                  type="text" 
                  value={formData.studentId} 
                  onChange={(e) => handleInputChange('studentId', e.target.value)} 
                  style={{ 
                    width: '100%', 
                    height: '36px', 
                    borderRadius: '8px', 
                    border: `2px solid ${errors.studentId ? '#ef4444' : '#961c18'}`, 
                    backgroundColor: 'black', 
                    color: 'white', 
                    padding: '0 12px', 
                    outline: 'none' 
                  }} 
                  placeholder="e.g. EMME/02052/2021"
                  maxLength={30}
                  disabled={isLoading}
                />
                <p className="font-['Hind',Helvetica] font-normal text-[#961c18] text-xs">
                  Use the student ID issued by your institution. It must be unique to your account.
                </p>
                {errors.studentId && (<p className="text-red-400 text-sm">{errors.studentId}</p>)}
              </div>
            </div>
          )}

          {/* Terms and Conditions */}
          <div className="space-y-2 pt-4">
            <div className="flex items-start space-x-2">
              <Checkbox id="terms" className="mt-1 border-[#961c18]" checked={formData.acceptTerms} onCheckedChange={(checked) => handleInputChange('acceptTerms', checked as boolean)} />
              <Label htmlFor="terms" className="font-['Hind',Helvetica] font-normal text-white text-sm">When you register you confirm that you have read and accept the terms of the terms and conditions, privacy policy and cookie policy.</Label>
            </div>
            {errors.acceptTerms && (<p className="text-red-400 text-sm">{errors.acceptTerms}</p>)}
            
            {/* Newsletter Subscription */}
            <div className="flex items-start space-x-2">
              <Checkbox id="newsletter" className="mt-1 border-[#961c18]" checked={formData.subscribeNewsletter} onCheckedChange={(checked) => handleInputChange('subscribeNewsletter', checked as boolean)} />
              <Label htmlFor="newsletter" className="font-['Hind',Helvetica] font-normal text-white text-sm">
                I would like to receive esports news, tournament updates, and exclusive offers via email (optional)
              </Label>
            </div>
            
            <div className="flex items-start space-x-2">
              <Checkbox id="marketing" className="mt-1 border-[#961c18]" checked={formData.acceptMarketing} onCheckedChange={(checked) => handleInputChange('acceptMarketing', checked as boolean)} />
              <Label htmlFor="marketing" className="font-['Hind',Helvetica] font-normal text-white text-sm">Would you like to receive information of interest and commercial information?</Label>
            </div>
          </div>

          {/* Register Button */}
          <div className="flex justify-center pt-6">
            <Button type="submit" disabled={isLoading} className="w-full max-w-[574px] h-12 bg-[#961c18] hover:bg-[#7a1514] disabled:bg-gray-600 rounded text-white font-bold text-2xl font-['Hind',Helvetica]">
              {isLoading ? 'CREATING ACCOUNT...' : 'REGISTER'}
            </Button>
          </div>

          {/* Login Link */}
          <div className="text-center pt-4">
            <p className="text-gray-400 text-sm">
              Already have an account?{' '}
              <Link href="/login" className="text-[#961c18] hover:text-[#7a1514]">
                Sign in here
              </Link>
            </p>
          </div>
        </form>
      </div>
    </section>
  );
};
