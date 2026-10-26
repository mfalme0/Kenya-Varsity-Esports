// src/app/api/registrations/my/route.ts
/**
 * GET /api/registrations/my
 * List the current user's tournament registrations (status page data).
 * Requires a valid Appwrite session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { participantManagement } from '@/lib/services/participantManagement';
import { getSessionClient } from '@/lib/appwrite-server';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication via session cookie
    const sessionToken = request.cookies.get('appwrite-session')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHENTICATED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    let sessionUserId: string | null = null;
    try {
      const sessionClient = getSessionClient(sessionToken);
      if (sessionClient) {
        const account = await sessionClient.account.get();
        if (account?.$id) {
          sessionUserId = account.$id;
        }
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'UNAUTHENTICATED', message: 'Invalid session' },
        { status: 401 }
      );
    }

    if (!sessionUserId) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHENTICATED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Fetch all registrations and filter to this user.
    const all = await participantManagement.getAllRegistrations();
    const myRegistrations = all
      .filter((r) => r.userId === sessionUserId)
      .sort(
        (a, b) =>
          new Date(b.registrationDate || 0).getTime() -
          new Date(a.registrationDate || 0).getTime()
      );

    return NextResponse.json({
      success: true,
      data: myRegistrations,
      total: myRegistrations.length,
    });
  } catch (error) {
    console.error('[Registrations:my] Error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
