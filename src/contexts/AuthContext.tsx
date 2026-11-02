'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Account, Client, Databases, Models, ID, Permission, Role } from 'appwrite';

// --- Appwrite Client Setup with lazy initialization ---
let client: Client | null = null;
let account: Account | null = null;
let databases: Databases | null = null;

const initializeAppwrite = (): { account: Account; databases: Databases } | null => {
  // Check if we're in fallback mode
  if (process.env.NEXT_PUBLIC_FALLBACK_MODE === 'true') {
    return null;
  }

  if (!client) {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

    if (!endpoint || !projectId) {
      console.warn('Appwrite configuration missing for auth, authentication will not work');
      return null;
    }

    if (typeof endpoint !== 'string' || endpoint.trim() === '') {
      console.warn('Appwrite endpoint is invalid for auth, authentication will not work');
      return null;
    }

    try {
      client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId);

      account = new Account(client);
      databases = new Databases(client);
    } catch (error) {
      console.error('Failed to initialize Appwrite client for auth:', error);
      return null;
    }
  }
  
  // Ensure both account and databases are initialized
  if (!account || !databases) {
    return null;
  }
  
  return { account, databases };
};

// --- Types ---
export type AppwriteProfile = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  $collectionId: string;
  $permissions: string[];
  fullname: string;
  email: string;
  username?: string;
  dob?: string;
  gender?: string;
  university?: string;
  student_id?: string;
  phone_number?: string;
  isAdmin?: boolean; // optional admin flag
  isTeamCaptain?: boolean; // team captain flag
  user_type?: string; // user type
  status?: string; // user status
  cookieBlocked?: boolean; // flag for third-party cookie blocking
};

export interface AuthContextType {
  user: Models.User<Record<string, unknown>> | null;
  profile: AppwriteProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: unknown; user?: Models.User<Record<string, unknown>>; warning?: string }>;
  signUp: (
    email: string,
    password: string,
    userData: Omit<AppwriteProfile, '$id' | '$createdAt' | '$updatedAt' | '$collectionId' | '$permissions'>
  ) => Promise<{ error?: unknown; user?: Models.User<Record<string, unknown>> }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<AppwriteProfile>) => Promise<{ error?: unknown }>;
  sendPasswordResetEmail: (email: string) => Promise<{ error?: unknown }>;
  resendVerificationEmail: () => Promise<{ error?: unknown }>;
  verifyEmail: (userId: string, secret: string) => Promise<{ error?: unknown }>;
}

// --- Context ---
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Provider ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Models.User<Record<string, unknown>> | null>(null);
  const [profile, setProfile] = useState<AppwriteProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Fetch Profile ---
  const getProfile = async (userId: string): Promise<AppwriteProfile | null> => {
    try {
      const appwrite = initializeAppwrite();
      if (!appwrite) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Appwrite not configured, cannot fetch profile');
        }
        return null;
      }

      const doc = await appwrite.databases.getDocument(
        process.env.NEXT_PUBLIC_APPWRITE_DB_ID!,
        process.env.NEXT_PUBLIC_APPWRITE_PROFILE_COLLECTION_ID!,
        userId
      );
      
      // Force boolean if missing
      const profile = {
        ...(doc as unknown as AppwriteProfile),
        isAdmin: (doc as Record<string, unknown>).isAdmin as boolean ?? false
      };
      return profile;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching profile:', error);
      }
      
      // Handle archived project error
      if ((error as any)?.message?.includes('Project is archived')) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Appwrite project is archived, using fallback profile');
        }
        return {
          $id: userId,
          $createdAt: new Date().toISOString(),
          $updatedAt: new Date().toISOString(),
          $collectionId: 'fallback',
          $permissions: [],
          fullname: 'Demo User',
          email: 'demo@kuer.com',
          university: 'Demo University',
          isAdmin: true, // Grant admin access for demo
          isTeamCaptain: false,
          user_type: 'visitor',
          status: 'approved'
        };
      }
      
      // If it's a permission error, try to create a basic profile
      if ((error as { code?: number }).code === 401) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Permission error - user may need to re-authenticate');
        }
      }
      return null;
    }
  };


  // --- Initialize User ---
  useEffect(() => {
    let isMounted = true;
    
    const init = async () => {
      // Check for third-party cookie support
      if (typeof window !== 'undefined' && !navigator.cookieEnabled) {
        console.warn('Cookies are disabled in this browser');
        if (isMounted) setLoading(false);
        return;
      }
      
      try {
        const appwrite = initializeAppwrite();
        if (!appwrite) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Appwrite not configured, using demo mode');
          }
          
          // In fallback mode, provide a demo user with admin privileges
          if (process.env.NEXT_PUBLIC_FALLBACK_MODE === 'true') {
            const demoUser = {
              $id: 'demo-user-id',
              email: 'demo@kuer.com',
              name: 'Demo User',
              emailVerification: true,
              phoneVerification: false,
              phone: '',
              passwordUpdate: new Date().toISOString(),
              prefs: {},
              registration: new Date().toISOString(),
              status: true,
              labels: [],
              accessedAt: new Date().toISOString(),
              $createdAt: new Date().toISOString(),
              $updatedAt: new Date().toISOString(),
              mfa: false,
              targets: []
            } as Models.User<Record<string, unknown>>;
            
            const demoProfile: AppwriteProfile = {
              $id: 'demo-user-id',
              $createdAt: new Date().toISOString(),
              $updatedAt: new Date().toISOString(),
              $collectionId: 'fallback',
              $permissions: [],
              fullname: 'Demo User',
              email: 'demo@kuer.com',
              university: 'Demo University',
              isAdmin: true, // Grant admin access for demo
              isTeamCaptain: false,
              user_type: 'visitor',
              status: 'approved'
            };
            
            if (isMounted) {
              setUser(demoUser);
              setProfile(demoProfile);
            }
          }
          
          if (isMounted) setLoading(false);
          return;
        }

        let currentUser: Models.User<Record<string, unknown>> | null = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        // Check if user has an active session before calling account.get()
        // Implement retry logic for timing issues
        while (!currentUser && retryCount < maxRetries) {
          try {
            currentUser = await appwrite.account.get();
            if (isMounted && currentUser) {
              setUser(currentUser);
              break; // Success, exit retry loop
            }
          } catch (sessionError: any) {
            retryCount++;
            
            if (process.env.NODE_ENV === 'development') {
              console.log(`Account.get() attempt ${retryCount} failed:`, sessionError.message);
            }

            // Network-level failures (offline, CORS-blocked origin, DNS) will never
            // succeed on retry - bail out quietly and continue as a guest.
            if (
              sessionError instanceof TypeError ||
              /failed to fetch|networkerror|load failed|network request failed/i.test(sessionError?.message || '')
            ) {
              if (process.env.NODE_ENV === 'development') {
                console.info(
                  `Account check could not reach Appwrite from ${typeof window !== 'undefined' ? window.location.origin : 'this origin'} ` +
                  '(blocked or offline). Continuing as guest. If this is a tunnel/dev URL, add it under Appwrite Console > Overview > Platforms.'
                );
              }
              if (isMounted) {
                setUser(null);
                setProfile(null);
              }
              return;
            }
            
            // Handle scope errors for guest users
            if (sessionError?.code === 401 || sessionError?.message?.includes('missing scopes')) {
              if (process.env.NODE_ENV === 'development') {
                console.log('No active session or guest user without account scopes');
              }
              if (isMounted) {
                setUser(null);
                setProfile(null);
              }
              return;
            }
            
            // If we've exhausted retries, handle gracefully
            if (retryCount >= maxRetries) {
              if (process.env.NODE_ENV === 'development') {
                console.error('Max retries reached for account.get(), session may be blocked');
              }
              if (isMounted) {
                setUser(null);
                setProfile(null);
              }
              return;
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
          }
        }
        
        // Also ensure the bridge cookie is set after a refresh if we have a session
        // We use a JWT because the actual session secret is hidden from the browser
        try {
          const jwtResponse = await appwrite.account.createJWT();
          if (jwtResponse && jwtResponse.jwt) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔑 Refreshed JWT bridge cookie (Length: ${jwtResponse.jwt.length})...`);
            }
          const domain = typeof window !== 'undefined' ? window.location.hostname : '';
          document.cookie = `appwrite-session=${jwtResponse.jwt}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax;${domain ? ` domain=${domain};` : ''}`;
          }
        } catch (e) {
          // No active session, ignore
        }

        if (currentUser) {
          const userProfile = await getProfile(currentUser.$id);
          if (isMounted) setProfile(userProfile);
        }
      } catch (err) {
        // Expected when no active session exists (401 Unauthorized)
        // This is normal behavior, not an error
        if (isMounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    init();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // --- Auto-refresh JWT cookie ---
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const refreshJWT = async () => {
      if (!isMounted) return;
      
      try {
        const appwrite = initializeAppwrite();
        if (!appwrite) return;
        
        const jwtResponse = await appwrite.account.createJWT();
        if (jwtResponse && jwtResponse.jwt) {
          document.cookie = `appwrite-session=${jwtResponse.jwt}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
        }
      } catch (e) {
        // failed to refresh jwt
      }
    };

    // Refresh every 10 minutes (Appwrite JWTs usually expire in 15)
    const interval = setInterval(refreshJWT, 10 * 60 * 1000);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  // --- Auth Actions ---
  const signIn = async (email: string, password: string) => {
    try {
      const appwrite = initializeAppwrite();
      if (!appwrite) {
        return { error: new Error('Appwrite not configured') };
      }

      // Email/Password authentication
      const session = await appwrite.account.createEmailPasswordSession(email, password);
      console.log('✅ Session created:', session);
      
      // Validate session was actually created and stored
      if (!session || !session.userId) {
        throw new Error('Session creation failed - no user ID returned');
      }
      
      // Wait a moment for session to be stored in localStorage
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Try to get user details with the established session
      let currentUser: Models.User<Record<string, unknown>> | null = null;
      
      try {
        currentUser = await appwrite.account.get();
        console.log('✅ User retrieved after session:', currentUser);
        
        setUser(currentUser);
        const userProfile = await getProfile(currentUser.$id);
        setProfile(userProfile);
        
        // Create JWT for server bridge now that we have a valid session
        try {
          const jwtResponse = await appwrite.account.createJWT();
          console.log(`🔑 Setting JWT bridge cookie...`);
          const domain = typeof window !== 'undefined' ? window.location.hostname : '';
          document.cookie = `appwrite-session=${jwtResponse.jwt}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax;${domain ? ` domain=${domain};` : ''}`;
        } catch (e) {
          console.error('❌ Failed to create JWT for session bridge:', e);
          // Don't fail sign-in if JWT creation fails
        }
        
        return { user: currentUser };
        
      } catch (accountError: any) {
        console.error('Failed to get user account after sign-in:', accountError);
        
        // Check if the error is about missing scopes despite having a session
        if (accountError?.message?.includes('missing scopes') && session?.userId) {
          console.warn('⚠️ Session exists but user has guest scopes - third-party cookies likely blocked');
          
          // Create a local session fallback user
          const fallbackUser = {
            $id: session.userId,
            email: email,
            name: email.split('@')[0],
            emailVerification: true,
            phoneVerification: false,
            phone: '',
            passwordUpdate: new Date().toISOString(),
            prefs: {},
            registration: new Date().toISOString(),
            status: true,
            labels: ['authenticated'], // Mark as authenticated locally
            accessedAt: new Date().toISOString(),
            $createdAt: new Date().toISOString(),
            $updatedAt: new Date().toISOString(),
            mfa: false,
            targets: []
          } as Models.User<Record<string, unknown>>;
          
          // Create fallback profile
          const fallbackProfile: AppwriteProfile = {
            $id: session.userId,
            $createdAt: new Date().toISOString(),
            $updatedAt: new Date().toISOString(),
            $collectionId: 'fallback',
            $permissions: [],
            fullname: email.split('@')[0],
            email: email,
            university: 'Unknown',
            isAdmin: false,
            isTeamCaptain: false,
            user_type: 'visitor',
            status: 'pending',
            cookieBlocked: true // Flag for UI to show cookie warning
          };
          
          setUser(fallbackUser);
          setProfile(fallbackProfile);
          
          // Return with warning for user
          return { 
            user: fallbackUser, 
            warning: 'Authentication succeeded but browser may be blocking some cookies. Some features may be limited.' 
          };
        }
        
        throw accountError;
      }
      
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Sign in error:', error);
      }

      // Check for Third-Party Cookie blocking (successful session create but failed get())
      if (error?.message?.includes('missing scopes') && error?.message?.includes('guest')) {
        return { 
          error: new Error('Login failed due to browser cookie blocking. Please try:\n1. Disabling "Block Third-Party Cookies"\n2. Using a Custom Domain in Appwrite Console\n3. Using a different browser') 
        };
      }
      
      // Handle archived project error with demo login
      if (error?.message?.includes('Project is archived')) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Appwrite project is archived, using demo login');
        }
        const demoUser = {
          $id: 'demo-user-id',
          email: email,
          name: 'Demo User',
          emailVerification: true,
          phoneVerification: false,
          phone: '',
          passwordUpdate: new Date().toISOString(),
          prefs: {},
          registration: new Date().toISOString(),
          status: true,
          labels: [],
          accessedAt: new Date().toISOString(),
          $createdAt: new Date().toISOString(),
          $updatedAt: new Date().toISOString(),
          mfa: false,
          targets: []
        } as Models.User<Record<string, unknown>>;
        
        const demoProfile = await getProfile('demo-user-id');
        setUser(demoUser);
        setProfile(demoProfile);
        return { user: demoUser };
      }
      
      return { error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    userData: Omit<AppwriteProfile, '$id' | '$createdAt' | '$updatedAt' | '$collectionId' | '$permissions'>
  ) => {
    try {
      const appwrite = initializeAppwrite();
      if (!appwrite) {
        return { error: new Error('Appwrite not configured') };
      }

      // First create the user account
      const newUser = await appwrite.account.create(ID.unique(), email, password);
      
      // Create a session for the new user so they can create their profile
      await appwrite.account.createEmailPasswordSession(email, password);

      // Set session cookie via JWT
      try {
        const jwtResponse = await appwrite.account.createJWT();
        document.cookie = `appwrite-session=${jwtResponse.jwt}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
      } catch (e) {
        // ignore
      }

      // Create the profile document (permissions will be handled by collection settings)
      const profileDoc = await appwrite.databases.createDocument(
        process.env.NEXT_PUBLIC_APPWRITE_DB_ID!,
        process.env.NEXT_PUBLIC_APPWRITE_PROFILE_COLLECTION_ID!,
        newUser.$id,
        {
          ...userData,
          isAdmin: false, // Default to non-admin
          user_type: userData.user_type || 'visitor',
          status: userData.user_type === 'participant' ? 'pending' : 'approved'
        }
      );

      setUser(newUser);
      setProfile(profileDoc as unknown as AppwriteProfile);

      return { user: newUser };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Sign up error:', error);
      }
      return { error };
    }
  };

  const signOut = async () => {
    try {
      // Only attempt to delete session if user is actually signed in
      if (user) {
        const appwrite = initializeAppwrite();
        if (appwrite) {
          await appwrite.account.deleteSession('current');
        }
      }
    } catch (error) {
      // Ignore errors when user is already signed out or has no active session
      // This can happen if the session expired or user is already a guest
    } finally {
      // Clear the local session cookie
      console.log('🗑️ Clearing local session bridge cookie...');
      document.cookie = 'appwrite-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      // Always clear local state regardless of API call success
      setUser(null);
      setProfile(null);
    }
  };

  const updateProfile = async (updates: Partial<AppwriteProfile>) => {
    if (!profile) return { error: new Error('No profile to update') };
    try {
      const appwrite = initializeAppwrite();
      if (!appwrite) {
        return { error: new Error('Appwrite not configured') };
      }

      const updated = await appwrite.databases.updateDocument(
        process.env.NEXT_PUBLIC_APPWRITE_DB_ID!,
        process.env.NEXT_PUBLIC_APPWRITE_PROFILE_COLLECTION_ID!,
        profile.$id,
        updates
      );
      setProfile(updated as unknown as AppwriteProfile);
      return {};
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Update profile error:', error);
      }
      return { error };
    }
  };

  const sendPasswordResetEmail = async (email: string) => {
    try {
      const appwrite = initializeAppwrite();
      if (!appwrite) {
        return { error: new Error('Appwrite not configured') };
      }

      await appwrite.account.createRecovery(email, `${window.location.origin}/reset-password`);
      return {};
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Password reset error:', error);
      }
      return { error };
    }
  };

  const resendVerificationEmail = async () => {
    try {
      const appwrite = initializeAppwrite();
      if (!appwrite) {
        return { error: new Error('Appwrite not configured') };
      }

      await appwrite.account.createVerification(`${window.location.origin}/verify-email`); 
      return {};
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Verification email error:', error);
      }
      return { error };
    }
  };


  const verifyEmail = async (userId: string, secret: string) => {
    try {
      const appwrite = initializeAppwrite();
      if (!appwrite) {
        return { error: new Error('Appwrite not configured') };
      }

      await appwrite.account.updateVerification(userId, secret);
      return {};
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Verify email error:', error);
      }
      return { error };
    }
  };


  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, updateProfile, sendPasswordResetEmail, resendVerificationEmail, verifyEmail }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Hook ---
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};