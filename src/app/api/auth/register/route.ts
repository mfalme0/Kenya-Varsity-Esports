import { NextRequest, NextResponse } from 'next/server';
import { Account, Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { normalizeStudentId, validateStudentId } from '@/lib/validation/studentId';

/**
 * Atomic participant/visitor registration.
 *
 * Account and profile are created together. If profile creation fails, the
 * freshly created Appwrite account is deleted so the user can retry instead of
 * being left with an orphaned account that reports "already registered".
 */

const RegistrationSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  fullname: z.string().trim().min(1, 'Full name is required.').max(255),
  username: z.string().trim().max(100).optional().default(''),
  dob: z.string().trim().max(50).optional().default(''),
  gender: z.string().trim().max(50).optional().default(''),
  university: z.string().trim().max(255).optional().default(''),
  student_id: z.string().trim().max(100).optional().default(''),
  phone_number: z.string().trim().max(20).optional().default(''),
  user_type: z.enum(['participant', 'visitor']).default('visitor'),
});

type RegistrationInput = z.infer<typeof RegistrationSchema>;

interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
  profileCollectionId: string;
}

const getConfig = (): AppwriteConfig | null => {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DB_ID;
  const profileCollectionId = process.env.NEXT_PUBLIC_APPWRITE_PROFILE_COLLECTION_ID;

  if (!endpoint || !projectId || !apiKey || !databaseId || !profileCollectionId) {
    return null;
  }

  return { endpoint, projectId, apiKey, databaseId, profileCollectionId };
};

const createAdminClient = (config: AppwriteConfig) => {
  const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);

  return {
    client,
    users: new Users(client),
    databases: new Databases(client),
  };
};

const isNotFound = (error: unknown): boolean =>
  (error as { code?: number })?.code === 404;

const isConflict = (error: unknown): boolean =>
  (error as { code?: number })?.code === 409;

/**
 * Verify that an existing account belongs to the person submitting the form.
 * A temporary session is created and immediately removed.
 */
const verifyAccountPassword = async (
  config: AppwriteConfig,
  users: Users,
  userId: string,
  email: string,
  password: string
): Promise<boolean> => {
  const authClient = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId);
  const account = new Account(authClient);

  try {
    const session = await account.createEmailPasswordSession({ email, password });

    try {
      await users.deleteSession({ userId, sessionId: session.$id });
    } catch {
      // Session cleanup is best-effort; it expires on its own.
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Find a profile already using this student ID. Appwrite string equality is
 * case-sensitive, so paginate through profiles and compare normalized values.
 */
const findStudentIdConflict = async (
  databases: Databases,
  databaseId: string,
  collectionId: string,
  studentId: string
) => {
  const target = normalizeStudentId(studentId);
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const page = await databases.listDocuments({
      databaseId,
      collectionId,
      queries: [Query.limit(pageSize), Query.offset(offset)],
    });

    for (const document of page.documents) {
      const existing = (document as Record<string, unknown>).student_id;
      if (typeof existing === 'string' && normalizeStudentId(existing) === target) {
        return document;
      }
    }

    if (page.documents.length < pageSize) break;
    offset += pageSize;
  }

  return null;
};

const buildProfileData = (input: RegistrationInput) => {
  const isParticipant = input.user_type === 'participant';

  return {
    fullname: input.fullname.trim(),
    email: input.email.trim(),
    username: input.username.trim(),
    dob: input.dob.trim(),
    gender: input.gender.trim(),
    university: isParticipant ? input.university.trim() : '',
    student_id: isParticipant ? input.student_id.trim() : '',
    phone_number: input.phone_number.trim(),
    isAdmin: false,
    isTeamCaptain: false,
    user_type: input.user_type,
    // Participants are approved automatically once their student ID is valid.
    status: 'approved',
  };
};

const createProfile = async (
  databases: Databases,
  config: AppwriteConfig,
  userId: string,
  data: ReturnType<typeof buildProfileData>
) => {
  return databases.createDocument({
    databaseId: config.databaseId,
    collectionId: config.profileCollectionId,
    documentId: userId,
    data,
    permissions: [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  });
};

const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ success: false, error: code, code, message, ...extra }, { status });

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, 'REGISTRATION');
  if (rateLimitResponse) return rateLimitResponse;

  const config = getConfig();
  if (!config) {
    console.error('[Auth Register] Appwrite server configuration missing');
    return fail(500, 'SERVER_CONFIG_ERROR', 'Registration is temporarily unavailable. Please try again later.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'INVALID_JSON', 'Invalid registration request.');
  }

  const parsed = RegistrationSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return fail(400, 'VALIDATION_ERROR', firstIssue?.message || 'Invalid registration details.', {
      field: firstIssue?.path?.[0],
      details: parsed.error.issues.map((issue) => ({
        field: issue.path[0],
        message: issue.message,
      })),
    });
  }

  const input = parsed.data;
  const isParticipant = input.user_type === 'participant';

  // Validate participant-specific fields before touching Appwrite.
  if (isParticipant) {
    if (!input.university.trim()) {
      return fail(400, 'VALIDATION_ERROR', 'University or institution is required for participants.', {
        field: 'university',
      });
    }

    const studentIdValidation = validateStudentId(input.student_id);
    if (!studentIdValidation.valid) {
      return fail(400, 'STUDENT_ID_INVALID', studentIdValidation.error || 'Invalid student ID.', {
        field: 'student_id',
      });
    }
  }

  const { users, databases } = createAdminClient(config);

  try {
    // Is there already an account with this email?
    const existingUsers = await users.list({
      queries: [Query.equal('email', input.email.trim()), Query.limit(1)],
    });
    const existingUser = existingUsers.users[0];

    if (existingUser) {
      let existingProfile: unknown = null;
      try {
        existingProfile = await databases.getDocument({
          databaseId: config.databaseId,
          collectionId: config.profileCollectionId,
          documentId: existingUser.$id,
        });
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }

      if (existingProfile) {
        return fail(
          409,
          'ACCOUNT_EXISTS',
          'An account with this email already exists. Please sign in instead.'
        );
      }

      // The account was created previously but its profile was never saved.
      // Only repair it if the caller proves ownership with the password.
      const ownsAccount = await verifyAccountPassword(
        config,
        users,
        existingUser.$id,
        input.email.trim(),
        input.password
      );

      if (!ownsAccount) {
        return fail(
          409,
          'ACCOUNT_EXISTS',
          'An account with this email already exists. Please sign in instead.'
        );
      }
    }

    // A student ID may only belong to one participant account.
    if (isParticipant) {
      const conflict = await findStudentIdConflict(
        databases,
        config.databaseId,
        config.profileCollectionId,
        input.student_id
      );

      if (conflict && conflict.$id !== existingUser?.$id) {
        return fail(
          409,
          'STUDENT_ID_TAKEN',
          'This student ID is already registered to another account.',
          { field: 'student_id' }
        );
      }
    }

    if (existingUser) {
      await createProfile(databases, config, existingUser.$id, buildProfileData(input));

      return NextResponse.json({
        success: true,
        userId: existingUser.$id,
        repaired: true,
        participantApproved: isParticipant,
      });
    }

    let user;
    try {
      user = await users.create({
        userId: ID.unique(),
        email: input.email.trim(),
        password: input.password,
        name: input.fullname.trim().slice(0, 128),
      });
    } catch (error) {
      if (isConflict(error)) {
        return fail(
          409,
          'ACCOUNT_EXISTS',
          'An account with this email already exists. Please sign in instead.'
        );
      }
      throw error;
    }

    try {
      await createProfile(databases, config, user.$id, buildProfileData(input));
    } catch (profileError) {
      console.error('[Auth Register] Profile creation failed, rolling back account:', profileError);

      try {
        await users.delete({ userId: user.$id });
      } catch (rollbackError) {
        console.error('[Auth Register] Account rollback failed:', rollbackError);
      }

      return fail(
        500,
        'REGISTRATION_FAILED',
        'We could not finish creating your account. Please try again.'
      );
    }

    return NextResponse.json(
      {
        success: true,
        userId: user.$id,
        repaired: false,
        participantApproved: isParticipant,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Auth Register] Unexpected error:', error);
    return fail(500, 'REGISTRATION_FAILED', 'Registration failed. Please try again.');
  }
}
