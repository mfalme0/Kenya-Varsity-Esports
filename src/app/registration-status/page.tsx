'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Registration {
  id: string;
  tournamentId: string;
  tournamentTitle?: string;
  playerName: string;
  email: string;
  university?: string;
  teamName?: string;
  status: 'pending' | 'registered' | 'approved' | 'rejected';
  registrationDate?: string;
  userId?: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending Review', color: 'text-amber-400', bg: 'bg-amber-900/20 border border-amber-700/30' },
  registered: { label: 'Registered', color: 'text-blue-400', bg: 'bg-blue-900/20 border border-blue-700/30' },
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-900/20 border border-green-700/30' },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-900/20 border border-red-700/30' },
};

export default function RegistrationStatusPage() {
  const router = useRouter();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchRegistrations = async () => {
      try {
        const res = await fetch('/api/registrations/my', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login?redirect=/registration-status');
            return;
          }
          throw new Error('Failed to load registrations');
        }
        const data = await res.json();
        if (!cancelled && data.success) {
          setRegistrations(data.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load registrations');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRegistrations();
    return () => { cancelled = true; };
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center py-12 px-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#961c18] border-t-transparent rounded-full mx-auto mb-4 animate-spin" />
          <p className="text-gray-400">Loading your registrations...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white py-12 px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-red-900/30 border border-red-700 rounded-2xl p-6 mb-6">
            <p className="text-red-400 font-medium">{error}</p>
          </div>
          <Link
            href="/login?redirect=/registration-status"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#961c18] hover:bg-[#b91c17] text-white font-bold rounded-xl transition-colors"
          >
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="font-bold text-[#961c18] text-3xl mb-2">Registration Status</h1>
          <p className="text-gray-400">
            Track your tournament applications and their review status.
          </p>
        </div>

        {registrations.length === 0 ? (
          <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-white mb-2">No Registrations Yet</h3>
            <p className="text-gray-400 mb-6">
              You haven't registered for any tournaments yet.
            </p>
            <Link
              href="/tournaments"
              className="inline-flex items-center justify-center px-6 py-3 bg-[#961c18] hover:bg-[#b91c17] text-white font-bold rounded-xl transition-colors"
            >
              Browse Tournaments
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {registrations.map((reg) => {
              const status = STATUS_LABEL[reg.status] || STATUS_LABEL.pending;
              return (
                <div
                  key={reg.id}
                  className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full">
                    <div className="font-semibold text-white">{reg.tournamentTitle || reg.tournamentId}</div>
                    <div className="text-sm text-gray-400">
                      {reg.teamName ? `Team: ${reg.teamName}` : `Player: ${reg.playerName}`}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 sm:mt-0">
                      Registered {new Date(reg.registrationDate || 0).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${status.color} ${status.bg}`}
                    >
                      {status.label}
                    </span>
                    {reg.status === 'rejected' && (
                      <Link
                        href="/tournaments"
                        className="text-xs text-[#961c18] hover:underline hover:text-[#b91c17]"
                      >
                        Apply to another
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
