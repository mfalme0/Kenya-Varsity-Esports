"use client";

import React, { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { FooterSection } from "@/components/Footer";
import Link from "next/link";
import { PurchaseTicketButton } from "@/components/events/tickets";
import { useAuth } from "@/contexts/AuthContext";
import { Ticket, Calendar, Clock, MapPin, AlertCircle } from "lucide-react";

interface EventDetail {
  $id: string;
  title: string;
  image: string;
  date: string;
  time: string;
  prizePool: number;
  gameSlug: string;
  registrationLink?: string;
  detailsLink?: string;
  isExternal: boolean;
  externalUrl?: string;
  hasTickets: boolean;
  ticketStartingPrice?: number;
  ticketCurrency?: string;
  venue?: string;
  tags?: string[];
  status: string;
  description?: string;
  isFeatured?: boolean;
}

export default function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { user, profile } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvent();
  }, []);

  const fetchEvent = async () => {
    try {
      const { eventId } = await params;
      const response = await fetch("/api/events/" + eventId);
      const data = await response.json();
      
      if (data.success) {
        setEvent(data.data);
      } else {
        setError(data.error || "Event not found");
      }
    } catch {
      setError("Failed to load event");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
    }).format(price);
  };

  if (loading) {
    return (
      <main className="bg-black min-h-screen font-hind">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-12 h-12 border-2 border-[#8c110d] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-gray-400 font-black text-sm uppercase tracking-wider">Loading event...</p>
        </div>
        <FooterSection />
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="bg-black min-h-screen font-hind">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="relative inline-block mb-6">
            <div className="absolute -inset-3 border border-[#8c110d]/20 transform rotate-1" />
            <div className="relative border-2 border-gray-800 p-12 bg-black">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#8c110d]" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#8c110d]" />
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <p className="text-gray-400 font-black text-lg uppercase tracking-tight mb-2">Event Not Found</p>
              <p className="text-gray-500 text-sm">{error || "This event could not be found."}</p>
            </div>
          </div>
        </div>
        <FooterSection />
      </main>
    );
  }

  const formattedPrice = formatPrice(event.ticketStartingPrice || 0, event.ticketCurrency || "KES");

  return (
    <main className="bg-black min-h-screen font-hind">
      <Navigation />
      
      <section className="relative bg-[#080808] w-full py-16 px-4 md:px-8 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-2 h-28 bg-[#8c110d] opacity-50 transform rotate-12" />
          <div className="absolute bottom-20 right-10 w-2 h-28 bg-[#8c110d] opacity-40 transform -rotate-6" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#8c110d] text-white text-xs font-black uppercase tracking-[0.3em]">
                {event.isExternal ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    External Event
                  </>
                ) : (
                  <>
                    <Ticket className="w-4 h-4" />
                    Tournament
                  </>
                )}
              </span>
              {event.isFeatured && (
                <span className="px-3 py-1 bg-yellow-600 text-white text-xs font-black uppercase">Featured</span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white leading-tight">
              {event.title}
            </h1>
          </div>

          {/* Image */}
          <div className="relative aspect-video mb-8 rounded-lg overflow-hidden">
            <div 
              className="w-full h-full bg-cover bg-center"
              style={{ backgroundImage: "url('" + event.image + "')" }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            </div>
          </div>

          {/* Event Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800">
              <div className="w-12 h-12 bg-[#8c110d]/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-[#8c110d]" />
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Date</p>
                <p className="text-white font-black">{formatDate(event.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800">
              <div className="w-12 h-12 bg-[#8c110d]/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-[#8c110d]" />
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Time</p>
                <p className="text-white font-black">{event.time || "TBA"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800">
              <div className="w-12 h-12 bg-[#8c110d]/20 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-[#8c110d]" />
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Venue</p>
                <p className="text-white font-black">{event.venue || "Online"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800">
              <div className="w-12 h-12 bg-[#8c110d]/20 flex items-center justify-center">
                <Ticket className="w-6 h-6 text-[#8c110d]" />
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Prize Pool</p>
                <p className="text-white font-black">{event.prizePool}</p>
              </div>
            </div>
            {event.hasTickets && (
              <div className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 bg-[#8c110d]/10 border-[#8c110d]/30">
                <div className="w-12 h-12 bg-[#8c110d]/20 flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-[#8c110d]" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider">Starting Price</p>
                  <p className="text-white font-black text-[#8c110d]">{formattedPrice}</p>
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {event.tags.map((tag) => (
                <span key={tag} className="px-3 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-xs font-black uppercase tracking-wider">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="mb-8 p-6 bg-gray-900 border border-gray-800">
              <h3 className="text-xl font-black uppercase text-white mb-4">About This Event</h3>
              <p className="text-gray-300 leading-relaxed">{event.description}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Ticket purchase button - shown for ALL events with tickets */}
            {event.hasTickets && (
              <PurchaseTicketButton
                eventId={event.$id}
                eventTitle={event.title}
                eventSlug={event.gameSlug || "external"}
                userId={user?.$id}
                userEmail={user?.email}
                userName={profile?.fullname || user?.name}
                variant="primary"
                size="lg"
                className="flex-1"
              />
            )}

            {/* External link for external events - now links to shop for ticket purchase */}
            {event.isExternal && event.externalUrl && event.hasTickets && (
              <Link 
                href="/shop" 
                className="flex-1 py-4 bg-gray-800 border-2 border-gray-700 hover:border-[#8c110d] text-gray-400 hover:text-white font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
              >
                Visit Shop
              </Link>
            )}

            {/* Tournament actions */}
            {!event.isExternal && (
              <>
                <Link href={event.registrationLink ? `${event.registrationLink}?tournament=${event.$id}` : `/tournament-registration?tournament=${event.$id}`} className="flex-1">
                  <div className="w-full text-center py-4 bg-gradient-to-r from-[#8c110d] to-[#b91c17] hover:from-[#b91c17] hover:to-[#8c110d] text-white text-xs font-black uppercase tracking-wider transition-all duration-300 transform hover:shadow-lg hover:shadow-[#8c110d]/50">
                    Register Now
                  </div>
                </Link>
                <Link href={event.detailsLink || "#"} className="flex-1">
                  <div className="w-full text-center py-4 bg-black border-2 border-gray-700 hover:border-[#8c110d] text-gray-300 hover:text-white text-xs font-black uppercase tracking-wider transition-all duration-300">
                    View Details
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
