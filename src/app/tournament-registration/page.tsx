'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { isAuthorizedTeamCaptain } from '@/lib/teamCaptains';
import { TournamentRegistrationForm } from '@/components/tournament-registration/TournamentRegistrationForm';
import { TournamentRegistrationFormData, PlayerInfo } from '@/components/tournament-registration/schema';
import { motion } from 'framer-motion';

interface Tournament {
  id: string;
  gameName: string;
  title?: string;
  description?: string;
  tournamentStatus?: 'upcoming' | 'registration_open' | 'registration_closed' | 'ongoing' | 'completed';
  registrationDeadline?: string;
  maxParticipants?: number;
  currentParticipants?: number;
  category?: string;
  slug?: string;
  enableTickets?: boolean;
  /** Set by the API when `?includeTickets=true` — entry-fee ticket config exists. */
  hasTickets?: boolean;
  /** Starting ticket price (base, before tax/service fee). */
  ticketStartingPrice?: number;
  ticketCurrency?: string;
  ticketTaxRate?: number;
}

interface TicketNotice {
  tournamentId: string;
  paymentPending: boolean;
}

export default function TournamentRegistrationPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [isTeamCaptain, setIsTeamCaptain] = useState<boolean | null>(null);
  const [checkingCaptainStatus, setCheckingCaptainStatus] = useState(true);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [ticketNotice, setTicketNotice] = useState<TicketNotice | null>(null);
  const [preselectedTournamentId, setPreselectedTournamentId] = useState<string | null>(null);

  // Read ?tournament=<id> so links from event pages pre-select a tournament.
  useEffect(() => {
    const id = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('tournament')
      : null;
    setPreselectedTournamentId(id);
  }, []);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Check if user is a team captain based on their student ID
  useEffect(() => {
    if (profile?.student_id) {
      const isCaptain = isAuthorizedTeamCaptain(profile.student_id);
      setIsTeamCaptain(isCaptain);
      setCheckingCaptainStatus(false);
    } else if (!loading && profile) {
      // Profile loaded but no student_id
      setIsTeamCaptain(false);
      setCheckingCaptainStatus(false);
    }
  }, [profile, loading]);

  // Fetch available tournaments via API
  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        // Fetch both registration_open tournaments AND upcoming ones
        // This allows showing upcoming tournaments that are available for registration
        const [regOpenRes, upcomingRes] = await Promise.all([
          fetch('/api/tournaments?tournamentStatus=registration_open&includeTickets=true'),
          fetch('/api/tournaments?tournamentStatus=upcoming&includeTickets=true')
        ]);
        
        const regOpenResult = await regOpenRes.json();
        const upcomingResult = await upcomingRes.json();
        
        // Combine and deduplicate tournaments
        const allTournaments = [
          ...(regOpenResult.success ? regOpenResult.data : []),
          ...(upcomingResult.success ? upcomingResult.data : [])
        ];
        
        // Dedupe by id
        const uniqueTournaments = allTournaments.reduce((acc: Tournament[], curr: Tournament) => {
          if (!acc.find(t => t.id === curr.id)) {
            acc.push(curr);
          }
          return acc;
        }, []);
        
        setTournaments(uniqueTournaments);

        if (!regOpenResult.success && !upcomingResult.success) {
          console.error('Failed to fetch tournaments');
          setMessage({ type: 'error', text: 'Failed to load tournaments' });
        }
      } catch (error) {
        console.error('Error fetching tournaments:', error);
        setMessage({ type: 'error', text: 'Failed to load tournaments' });
      } finally {
        setLoadingTournaments(false);
      }
    };

    if (user) {
      fetchTournaments();
    }
  }, [user]);

  const ticketPriceLabel = (tournament: Tournament | null) => {
    if (!tournament) return null;
    const price = tournament.ticketStartingPrice;
    if (price == null) return null;
    const currency = tournament.ticketCurrency || 'KES';
    const tax = tournament.ticketTaxRate ? ` + ${tournament.ticketTaxRate}% tax` : '';
    return `${currency} ${price.toLocaleString()}${tax}`;
  };

  // Handle form submission via API
  const handleFormSubmit = async (formData: TournamentRegistrationFormData) => {
    if (!user || !profile) {
      setMessage({ type: 'error', text: 'Please ensure you are logged in' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      // Find the tournament to get its ID
      const tournament = tournaments.find(t => 
        t.gameName.toLowerCase().includes(formData.tournamentId.toLowerCase()) || 
        t.id === formData.tournamentId
      );
      
      if (!tournament) {
        setMessage({ type: 'error', text: 'Selected tournament not found' });
        return;
      }

      // Prepare API payload - the backend expects JSON strings for the roster
      // and game-specific fields.
      const apiPayload = {
        tournamentId: tournament.id,
        playerName: profile.fullname,
        email: user.email,
        studentId: profile.student_id || '',
        university: profile.university || '',
        teamName: formData.teamName || undefined,
        players: JSON.stringify({
          players: formData.players || [],
          substitutes: formData.substitutes || [],
        }),
        gameSpecificFields: JSON.stringify(formData.gameSpecificFields || {}),
        additionalInfo: formData.additionalInfo || undefined,
        userId: user.$id,
      };

      const response = await fetch(`/api/tournaments/${tournament.id}/participants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error === 'ALREADY_REGISTERED') {
          setMessage({ type: 'error', text: 'You have already registered for this tournament' });
        } else {
          setMessage({ type: 'error', text: result.message || 'Failed to submit registration' });
        }

        if (result.error === 'TICKET_REQUIRED' || result.error === 'TICKET_PAYMENT_PENDING') {
          setTicketNotice({
            tournamentId: tournament.id,
            paymentPending: result.error === 'TICKET_PAYMENT_PENDING',
          });
        }
        return;
      }

      setTicketNotice(null);
      setMessage({ 
        type: 'success', 
        text: result.autoApproved
          ? 'Registration submitted and approved! Your ticket check-in confirmed your spot.'
          : 'Registration submitted successfully! Your registration is pending approval.' 
      });

    } catch (error) {
      console.error('Registration error:', error);
      setMessage({ type: 'error', text: 'Failed to submit registration. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-4 border-[#961c18] border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div 
      className="min-h-screen bg-black text-white py-8"
      style={{ 
        backgroundImage: "url('/images/Mask Group.png')",
        backgroundSize: "500px 700px",
        backgroundPosition: "left",
        backgroundRepeat: "no-repeat"
      }}
    >
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#961c18] to-red-600 bg-clip-text text-transparent">
            Tournament Registration
          </h1>
          <p className="text-gray-300 text-lg">
            Join the competition and showcase your gaming skills
          </p>
        </div>

        {/* User Info Display */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-black bg-opacity-50 backdrop-blur-sm rounded-none p-6 mb-8 border border-gray-800"
        >
          <h2 className="text-xl font-semibold mb-4 text-white">Your Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Name</p>
              <p className="font-medium text-white">{profile?.fullname}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Student ID</p>
              <p className="font-medium text-white">{profile?.student_id || 'Not provided'}</p>
            </div>
            {profile?.university && (
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-1">University</p>
                <p className="font-medium text-white">{profile.university}</p>
              </div>
            )}
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Email</p>
              <p className="font-medium text-white text-sm truncate">{user.email}</p>
            </div>
          </div>
          
          {isTeamCaptain !== null && (
            <div className="mt-4">
              <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                isTeamCaptain 
                  ? 'bg-green-500 bg-opacity-20 text-green-400 border border-green-500' 
                  : 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500'
              }`}>
                {isTeamCaptain ? '✓ Team Captain' : 'Player'}
              </div>
            </div>
          )}
        </motion.div>

        {/* Message Display */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-8 p-4 rounded-xl border ${
              message.type === 'success' 
                ? 'bg-green-500 bg-opacity-20 border-green-500 text-green-300' 
                : 'bg-red-500 bg-opacity-20 border-red-500 text-red-300'
            }`}
          >
            <p className="font-medium">{message.text}</p>
          </motion.div>
        )}

        {/* Ticket Requirement Notice */}
        {(ticketNotice || selectedTournament?.enableTickets) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 rounded-xl border border-amber-500/60 bg-amber-500/10 text-amber-200"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-semibold text-amber-300">
                  {ticketNotice?.paymentPending ? 'Ticket payment pending' : 'Ticket required'}
                </p>
                <p className="text-sm text-amber-100/80 mt-1">
                  {ticketNotice?.paymentPending
                    ? 'We are still waiting for your payment to be confirmed. Registration opens once your ticket is paid.'
                    : ticketNotice
                      ? `You must purchase a ticket for this tournament before your registration can be submitted. ${ticketPriceLabel(selectedTournament) ? `Entry fee: ${ticketPriceLabel(selectedTournament)}.` : ''} Already bought one? You can continue below.`
                      : `This tournament requires a ticket. Purchase yours before submitting your registration. ${ticketPriceLabel(selectedTournament) ? `Entry fee: ${ticketPriceLabel(selectedTournament)}.` : ''} Already bought one? You can continue below.`}
                </p>
              </div>
              <Link
                href={`/events/${ticketNotice?.tournamentId || selectedTournament?.id}`}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-lg transition-colors whitespace-nowrap"
              >
                {ticketNotice?.paymentPending ? 'View my ticket' : 'Buy ticket'}
              </Link>
            </div>
          </motion.div>
        )}

        {/* Tournament Registration Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {loadingTournaments ? (
            <div className="text-center py-16">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-[#961c18] border-t-transparent rounded-full mx-auto mb-4"
              />
              <p className="text-xl text-gray-300">Loading available tournaments...</p>
            </div>
          ) : tournaments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-black bg-opacity-50 backdrop-blur-sm rounded-none p-12 text-center border border-gray-800"
            >
              <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">No Tournaments Available</h3>
              <p className="text-gray-400 mb-6">There are no tournaments currently open for registration.</p>
              <Link
                href="/"
                className="inline-flex items-center px-6 py-3 bg-[#961c18] hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Return to Homepage
              </Link>
            </motion.div>
          ) : (
            <div className="relative">
              <div className="bg-transparent rounded-3xl shadow-2xl overflow-hidden">
                <TournamentRegistrationForm
                  onSubmit={handleFormSubmit}
                  tournaments={tournaments}
                  initialTournamentId={preselectedTournamentId}
                  captainStudentId={profile?.student_id || undefined}
                  onTournamentChange={(tournament) => {
                    setSelectedTournament(tournament);
                    setTicketNotice(null);
                  }}
                  initialData={{
                    tournamentId: '',
                    teamName: '',
                    additionalInfo: '',
                    players: [],
                    substitutes: [],
                  }}
                />
              </div>
              
              {/* Submit Loading Overlay */}
              {isSubmitting && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 rounded-3xl">
                  <div className="text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"
                    />
                    <p className="text-white text-lg">Submitting registration...</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Important Notes */}
        {!loadingTournaments && tournaments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 bg-gray-900 bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 border border-gray-800"
          >
            <h3 className="font-semibold mb-4 text-white">Important Notes:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-[#961c18] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-300 text-sm">Your registration will be reviewed by administrators</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-[#961c18] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-300 text-sm">You will be notified via email about your registration status</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-[#961c18] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-300 text-sm">Make sure your profile information is up to date</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-[#961c18] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-300 text-sm">Registration deadlines are strictly enforced</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}