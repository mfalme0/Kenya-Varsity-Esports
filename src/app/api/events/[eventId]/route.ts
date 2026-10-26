import { NextResponse } from "next/server";
import { Client, Databases, Query } from "node-appwrite";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lazy init
let client: Client | null = null;
let databases: Databases | null = null;

const initializeAppwrite = () => {
  if (!client) {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    if (!endpoint || !projectId || !apiKey) return null;
    try {
      client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
      databases = new Databases(client);
    } catch { return null; }
  }
  return databases;
};

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID || "";
const TOURNAMENTS_COLLECTION = "tournaments";
const EXTERNAL_EVENTS_COLLECTION = "external_events";
const EVENT_TICKETS_COLLECTION = "event_tickets";
const EVENT_TICKET_TYPES_COLLECTION = "event_ticket_types";

// Check if event has active tickets
async function checkEventTickets(eventId: string, eventSlug: string): Promise<{
  hasTickets: boolean;
  startingPrice?: number;
  currency?: string;
}> {
  try {
    const db = initializeAppwrite();
    if (!db) return { hasTickets: false };

    const response = await db.listDocuments(DB_ID, EVENT_TICKETS_COLLECTION, [
      Query.equal("eventId", eventId),
      Query.equal("isActive", true),
      Query.limit(1),
    ]);

    if (response.documents.length === 0) {
      // Try by slug
      const slugResponse = await db.listDocuments(DB_ID, EVENT_TICKETS_COLLECTION, [
        Query.equal("eventSlug", eventSlug),
        Query.equal("isActive", true),
        Query.limit(1),
      ]);
      if (slugResponse.documents.length === 0) {
        return { hasTickets: false };
      }
      return checkTicketTypes(slugResponse.documents[0].$id);
    }

    return checkTicketTypes(response.documents[0].$id);
  } catch {
    return { hasTickets: false };
  }
}

async function checkTicketTypes(eventTicketId: string): Promise<{
  hasTickets: boolean;
  startingPrice?: number;
  currency?: string;
}> {
  try {
    const db = initializeAppwrite();
    if (!db) return { hasTickets: false };

    const response = await db.listDocuments(DB_ID, EVENT_TICKET_TYPES_COLLECTION, [
      Query.equal("eventTicketId", eventTicketId),
      Query.equal("isActive", true),
      Query.orderAsc("price"),
      Query.limit(1),
    ]);

    if (response.documents.length === 0) {
      return { hasTickets: false };
    }

    const ticketType = response.documents[0];
    const available = ticketType.quantityTotal - ticketType.quantitySold - ticketType.quantityReserved;
    
    if (available <= 0) {
      return { hasTickets: false };
    }

    // Get event ticket for currency
    const eventTicketResponse = await db.getDocument(DB_ID, EVENT_TICKETS_COLLECTION, eventTicketId);
    const eventTicket = eventTicketResponse as unknown as { currency: string };

    return {
      hasTickets: true,
      startingPrice: ticketType.price,
      currency: eventTicket.currency,
    };
  } catch {
    return { hasTickets: false };
  }
}

function toEvent(t: any) {
  const prizeStr = t.prizePool
    ? `${t.currency || "KES"} ${Number(t.prizePool).toLocaleString()}`
    : "TBD";

  let dateStr = "";
  if (t.startDate) {
    const d = new Date(t.startDate);
    dateStr = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Africa/Nairobi" }).toUpperCase();
  }

  let timeStr = "";
  if (t.startDate) {
    const d = new Date(t.startDate);
    timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Nairobi" });
  }

  let status: "OPEN" | "LEAGUE" | "PRO" = "OPEN";
  if (t.tournamentStatus === "registration_open") status = "OPEN";
  else if (t.tournamentStatus === "ongoing") status = "LEAGUE";
  else if (t.tournamentStatus === "completed") status = "PRO";

  return {
    $id: t.$id,
    title: t.title || t.gameName,
    gameSlug: t.slug,
    image: t.featuredImageUrl || "/images/hero-bg.jpg",
    date: dateStr,
    time: timeStr,
    prizePool: prizeStr,
    entryFee: "KES 5,000",
    status,
    tags: [t.gameName?.toUpperCase(), t.category?.toUpperCase()].filter(Boolean),
    registrationLink: `/tournament-registration`,
    detailsLink: `/games/${t.slug}/information`,
    isActive: true,
    isFeatured: t.isFeatured || false,
    isExternal: false,
    venue: t.format || "Online",
    description: t.description,
  };
}

function toExternalEvent(e: any) {
  let dateStr = "";
  let timeStr = "";
  if (e.eventDate) {
    const d = new Date(e.eventDate);
    dateStr = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Africa/Nairobi" }).toUpperCase();
    timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Nairobi" });
  }

  return {
    $id: e.$id,
    title: e.title,
    gameSlug: "",
    image: e.imageUrl || "/images/hero-bg.jpg",
    date: dateStr,
    time: timeStr,
    prizePool: e.prizePool || e.venue || "",
    entryFee: "",
    status: "OPEN" as const,
    tags: (e.tags || []).map((t: string) => t.toUpperCase()),
    registrationLink: `/shop`,
    detailsLink: `/events/${e.$id}`,
    isActive: true,
    isFeatured: e.isFeatured || false,
    isExternal: true,
    venue: e.venue,
    description: e.description,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const db = initializeAppwrite();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 });
    }

    const { eventId } = await params;

    // Try tournament first
    let event = null;
    let isExternal = false;

    try {
      const tournamentResponse = await db.listDocuments(DB_ID, TOURNAMENTS_COLLECTION, [
        Query.equal("$id", eventId),
        Query.limit(1),
      ]);

      if (tournamentResponse.documents.length > 0) {
        const t = tournamentResponse.documents[0];
        const ticketInfo = await checkEventTickets(t.$id, t.slug);
        event = {
          ...toEvent(t),
          ...ticketInfo,
          ticketStartingPrice: ticketInfo.startingPrice,
        };
        isExternal = false;
      }
    } catch (err) {
      console.warn("Tournament fetch error:", err);
    }

    // If not found, try external events
    if (!event) {
      try {
        const externalResponse = await db.listDocuments(DB_ID, EXTERNAL_EVENTS_COLLECTION, [
          Query.equal("$id", eventId),
          Query.limit(1),
        ]);

        if (externalResponse.documents.length > 0) {
          const e = externalResponse.documents[0];
          const ticketInfo = await checkEventTickets(e.$id, "");
          event = {
            ...toExternalEvent(e),
            ...ticketInfo,
            ticketStartingPrice: ticketInfo.startingPrice,
          };
          isExternal = true;
        }
      } catch (err) {
        console.warn("External event fetch error:", err);
      }
    }

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    console.error("Event Detail API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch event" },
      { status: 500 }
    );
  }
}