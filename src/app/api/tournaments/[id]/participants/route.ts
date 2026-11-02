// src/app/api/tournaments/[id]/participants/route.ts
/**
 * Participant Management API
 * GET: List participants
 * POST: Register new participant
 */

import { NextRequest, NextResponse } from 'next/server';
import { participantManagement } from '@/lib/services/participantManagement';
import { checkRateLimit } from '@/lib/redis-rate-limit';
import { TournamentRegistrationPayloadSchema, createTournamentRegistrationSchema } from '@/components/tournament-registration/schema';
import { sseManager } from '@/lib/realtime/sse-manager';
import { ticketService } from '@/lib/tickets';
import { approveRegistration } from '@/lib/tournaments/approveRegistration';
import { getTournamentForRegistration } from '@/lib/tournaments/registrationTournament';
import { findGameForTournament, getRegistrationAvailability, validateRoster, formatGameSpecificFields, parseTeamPlayers } from '@/lib/tournaments/registrationRules';
import { getSessionClient } from '@/lib/appwrite-server';
import '@/lib/startup'; // Trigger startup initialization

/**
 * GET /api/tournaments/[id]/participants
 * List tournament participants
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    const { searchParams } = new URL(request.url);

    const filters = {
      status: searchParams.get('status') as any,
      search: searchParams.get('search') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)),
    };

    const result = await participantManagement.listByTournament(tournamentId, filters);

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('[Participants API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/participants
 * Register new participant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await checkRateLimit(request, 'AUTHENTICATED');
  if (rateLimitResponse) return rateLimitResponse;

  // --- Authentication check ---
  // Verify the caller has a valid Appwrite session so registrations cannot be
  // submitted anonymously or impersonating another user.
  const sessionToken = request.cookies.get('appwrite-session')?.value;
  let sessionUserId: string | null = null;
  if (sessionToken) {
    try {
      const sessionClient = getSessionClient(sessionToken);
      if (sessionClient) {
        const account = await sessionClient.account.get();
        if (account?.$id) {
          sessionUserId = account.$id;
        }
      }
    } catch {
      // Session invalid → fall through; body userId will be rejected below.
    }
  }

  if (!sessionUserId) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHENTICATED', message: 'Authentication required to register.' },
      { status: 401 }
    );
  }

  try {
    const { id: tournamentId } = await params;
    const body = await request.json();

    // Validate payload using TournamentRegistrationPayloadSchema
    const payload = {
      ...body,
      tournamentId,
      registrationDate: new Date().toISOString(),
      status: 'pending',
      // Use the authenticated session user ID — never trust a client-supplied userId.
      userId: sessionUserId,
      email: body.email,
    };

    const validationResult = TournamentRegistrationPayloadSchema.safeParse(payload);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue: any) => issue.message);
      return NextResponse.json(
        { 
          success: false, 
          error: 'VALIDATION_ERROR', 
          message: 'Invalid request payload',
          details: errorMessages
        },
        { status: 400 }
      );
    }

    const validatedData = validationResult.data;

    // Normalize student ID
    validatedData.studentId = (validatedData.studentId || '').trim();
    if (!validatedData.studentId) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Student ID is required' },
        { status: 400 }
      );
    }

    // Enforce tournament availability, capacity, and roster rules when the
    // tournament document can be loaded. If Appwrite is not configured in this
    // environment, skip these checks to keep existing behaviour.
    const tournamentLookup = await getTournamentForRegistration(tournamentId);
    let game = null as any;

    if (tournamentLookup.configured) {
      if (!tournamentLookup.tournament) {
        return NextResponse.json(
          { success: false, error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' },
          { status: 404 }
        );
      }

      const tournamentDoc = tournamentLookup.tournament as Record<string, unknown>;
      game = findGameForTournament(tournamentDoc);

      const availability = getRegistrationAvailability(tournamentDoc);
      if (!availability.open) {
        return NextResponse.json(
          {
            success: false,
            error: availability.code,
            message: availability.message,
          },
          { status: availability.code === 'REGISTRATION_CLOSED' ? 409 : 403 }
        );
      }

      if (
        typeof tournamentDoc.maxParticipants === 'number' &&
        tournamentDoc.maxParticipants > 0
      ) {
        const activeCount = await (participantManagement as any).getActiveCount?.(tournamentId);
        if (typeof activeCount === 'number' && activeCount >= tournamentDoc.maxParticipants) {
          return NextResponse.json(
            {
              success: false,
              error: 'TOURNAMENT_FULL',
              message: 'This tournament has reached its registration capacity.',
            },
            { status: 409 }
          );
        }
      }

      // Parse and merge game-specific fields into additionalInfo if supplied.
      let additionalInfo = validatedData.additionalInfo || '';
      if (body.gameSpecificFields && typeof body.gameSpecificFields === 'string') {
        try {
          const parsed = JSON.parse(body.gameSpecificFields);
          if (parsed && typeof parsed === 'object') {
            const formatted = formatGameSpecificFields(parsed as Record<string, unknown>);
            if (formatted) {
              additionalInfo = additionalInfo ? `${additionalInfo}\n${formatted}` : formatted;
            }
          }
        } catch {
          // Ignore malformed game-specific fields rather than failing registration.
        }
      }

      // Server-side roster validation against game rules (when resolvable).
      if (game) {
        const rosterPayload = parseTeamPlayers(
          body.players ?? validatedData.players ?? null
        );

        let gameSpecificFieldsObj: Record<string, unknown> = {};
        if (body.gameSpecificFields && typeof body.gameSpecificFields === 'string') {
          try {
            const parsed = JSON.parse(body.gameSpecificFields);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              gameSpecificFieldsObj = parsed;
            }
          } catch {
            // Ignore malformed game-specific fields; validator will flag missing required ones.
          }
        }

        const formValues = {
          tournamentId,
          teamName: validatedData.teamName || '',
          additionalInfo,
          players: rosterPayload.players,
          substitutes: rosterPayload.substitutes,
          gameSpecificFields: gameSpecificFieldsObj,
        };

        const schema = createTournamentRegistrationSchema(game, {
          captainStudentId: validatedData.studentId,
        });
        const rosterCheck = schema.safeParse(formValues);
        if (!rosterCheck.success) {
          const firstIssue = rosterCheck.error.issues[0];
          const details = rosterCheck.error.issues.map((issue: any) => issue.message);
          return NextResponse.json(
            {
              success: false,
              error: 'INVALID_ROSTER',
              message: firstIssue?.message || 'Please review your team roster.',
              details,
            },
            { status: 400 }
          );
        }

        // Also run the shared roster validator for additional guardrails.
        const rosterResult = validateRoster(game, {
          teamName: validatedData.teamName,
          captainStudentId: validatedData.studentId,
          players: body.players ?? validatedData.players ?? null,
        });
        if (!rosterResult.valid) {
          return NextResponse.json(
            {
              success: false,
              error: rosterResult.code || 'INVALID_ROSTER',
              message: rosterResult.message || 'Please review your team roster.',
              details: rosterResult.details,
            },
            { status: 400 }
          );
        }
      }

      // Update validatedData with the possibly enriched additionalInfo.
      (validatedData as any).additionalInfo = additionalInfo || undefined;
    }

    // Check if already registered
    const isRegistered = await participantManagement.isRegistered(
      tournamentId,
      validatedData.email
    );
    if (isRegistered) {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REGISTERED', message: 'Email already registered for this tournament' },
        { status: 409 }
      );
    }

    // Enforce the pay-first rule: when the tournament has ticketing configured,
    // registration is only allowed after a confirmed, fully paid ticket purchase.
    const ticketRequirement = await ticketService.getTicketPurchaseRequirement(tournamentId, {
      email: validatedData.email,
      userId: validatedData.userId,
    });

    if (ticketRequirement.checkFailed) {
      return NextResponse.json(
        {
          success: false,
          error: 'TICKET_CHECK_FAILED',
          message: 'We could not verify your ticket purchase. Please try again.',
        },
        { status: 503 }
      );
    }

    if (ticketRequirement.requiresTicket && !ticketRequirement.hasPaidTicket) {
      const paymentPending = ticketRequirement.hasPendingPurchase;
      return NextResponse.json(
        {
          success: false,
          error: paymentPending ? 'TICKET_PAYMENT_PENDING' : 'TICKET_REQUIRED',
          message: paymentPending
            ? 'Your ticket payment is still being processed. Please wait for the payment to be confirmed before registering.'
            : 'You must purchase a ticket for this tournament before you can register.',
          ticketUrl: `/events/${tournamentId}`,
        },
        { status: paymentPending ? 409 : 403 }
      );
    }

    // Register participant with full payload
    const result = await participantManagement.register(tournamentId, {
      tournamentId,
      playerName: validatedData.playerName,
      email: validatedData.email,
      studentId: validatedData.studentId,
      university: validatedData.university,
      teamName: validatedData.teamName,
      players: validatedData.players, // JSON string containing team members
      additionalInfo: (validatedData as any).additionalInfo ?? validatedData.additionalInfo,
      userId: validatedData.userId,
    });

    if (!result.success) {
      // Handle specific error cases
      if (result.error?.includes('already registered') || result.error?.includes('already exists')) {
        return NextResponse.json(
          { success: false, error: 'CONFLICT', message: result.error },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'REGISTRATION_FAILED', message: result.error },
        { status: 400 }
      );
    }

    // Auto-approve when the player already checked in a ticket for this
    // tournament. The gate scanner records check-ins; a registration arriving
    // afterwards is approved immediately instead of waiting in the pending queue.
    let autoApproved = false;
    if (result.participant) {
      try {
        const checkedIn = await ticketService.hasCheckedInTicketForTournament(tournamentId, {
          email: validatedData.email,
          userId: validatedData.userId,
        });

        if (checkedIn) {
          const approval = await approveRegistration({
            registrationId: result.participant.id,
            status: 'approved',
            registration: {
              tournamentId,
              playerName: validatedData.playerName,
              email: validatedData.email,
              university: validatedData.university,
              teamName: validatedData.teamName,
              players: validatedData.players,
              registrationDate: new Date().toISOString(),
              userId: validatedData.userId,
            },
          });
          autoApproved = approval.success;
          if (autoApproved) {
            console.log(`[Participants API] Auto-approved ${validatedData.email} (ticket already checked in)`);
          }
        }
      } catch (autoApproveError) {
        console.error('[Participants API] Auto-approve after ticket check-in failed:', autoApproveError);
      }
    }

    // Broadcast real-time update via SSE
    sseManager.broadcastToTournament(tournamentId, 'participant_registered', {
      participant: result.participant,
      tournamentId,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: result.participant,
      autoApproved,
    }, { status: 201 });

  } catch (error) {
    console.error('[Participants API] Error:', error);
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError && 'message' in error && error.message.includes('JSON')) {
      return NextResponse.json(
        { success: false, error: 'INVALID_JSON', message: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
