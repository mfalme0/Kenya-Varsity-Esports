import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple rate limiter with Redis support
 * Falls back to in-memory when Redis is not available
 */
class SimpleRateLimiter {
  private static instance: SimpleRateLimiter;
  private redis: any = null;
  private memory: Map<string, { count: number; resetTime: number }> = new Map();

  static getInstance(): SimpleRateLimiter {
    if (!SimpleRateLimiter.instance) {
      SimpleRateLimiter.instance = new SimpleRateLimiter();
    }
    return SimpleRateLimiter.instance;
  }

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      
      if (redisUrl && redisToken) {
        // Use Upstash Redis REST API
        this.redis = {
          async get(key: string) {
            const response = await fetch(`${redisUrl}/get/${key}`, {
              headers: {
                'Authorization': `Bearer ${redisToken}`,
              },
            });
            const data = await response.json();
            return data.result;
          },
          async incr(key: string) {
            const response = await fetch(`${redisUrl}/incr/${key}`, {
              headers: {
                'Authorization': `Bearer ${redisToken}`,
              },
            });
            const data = await response.json();
            return data.result;
          },
          async expire(key: string, seconds: number) {
            const response = await fetch(`${redisUrl}/expire/${key}/${seconds}`, {
              headers: {
                'Authorization': `Bearer ${redisToken}`,
              },
            });
            const data = await response.json();
            return data.result;
          },
          async pipeline() {
            // For Upstash, we'll handle operations individually
            return {
              commands: [] as Array<{method: string, key: string, args?: any[]}>,
              get(key: string) {
                this.commands.push({ method: 'get', key });
                return this;
              },
              incr(key: string) {
                this.commands.push({ method: 'incr', key });
                return this;
              },
              expire(key: string, seconds: number) {
                this.commands.push({ method: 'expire', key, args: [seconds] });
                return this;
              },
              async exec() {
                const results = [];
                for (const cmd of this.commands) {
                  try {
                    if (cmd.method === 'get') {
                      const response = await fetch(`${redisUrl}/get/${cmd.key}`, {
                        headers: { 'Authorization': `Bearer ${redisToken}` },
                      });
                      const data = await response.json();
                      results.push([null, data.result]);
                    } else if (cmd.method === 'incr') {
                      const response = await fetch(`${redisUrl}/incr/${cmd.key}`, {
                        headers: { 'Authorization': `Bearer ${redisToken}` },
                      });
                      const data = await response.json();
                      results.push([null, data.result]);
                    } else if (cmd.method === 'expire') {
                      const response = await fetch(`${redisUrl}/expire/${cmd.key}/${cmd.args?.[0] || 0}`, {
                        headers: { 'Authorization': `Bearer ${redisToken}` },
                      });
                      const data = await response.json();
                      results.push([null, data.result]);
                    }
                  } catch (error) {
                    results.push([error, null]);
                  }
                }
                return results;
              }
            };
          }
        };
        console.log('Upstash Redis rate limiter initialized');
      } else if (process.env.REDIS_URL) {
        // Fallback to ioredis for traditional Redis
        const Redis = await import('ioredis');
        this.redis = new Redis.default(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          keepAlive: 30000,
          connectTimeout: 10000,
          commandTimeout: 5000,
        });
        console.log('Traditional Redis rate limiter initialized');
      } else {
        console.warn('Redis not configured, using in-memory rate limiting');
      }
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      console.warn('Falling back to in-memory rate limiting');
      this.redis = null;
    }
  }

  async isAllowed(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const key = `rate_limit:${identifier}`;
    const resetTime = now + windowMs;

    try {
      if (this.redis) {
        // Redis implementation for Upstash REST API
        try {
          // Get current count
          const currentCountResponse = await this.redis.get(key);
          const currentCount = currentCountResponse ? parseInt(currentCountResponse) : 0;
          
          // Increment count
          const newCountResponse = await this.redis.incr(key);
          const newCount = newCountResponse ? parseInt(newCountResponse) : 1;
          
          // Set expiry
          await this.redis.expire(key, Math.ceil(windowMs / 1000));

          if (newCount > limit) {
            return { allowed: false, remaining: 0, resetTime };
          }

          return {
            allowed: true,
            remaining: limit - newCount,
            resetTime
          };
        } catch (error) {
          console.error('Redis rate limiting error:', error);
          // Fallback to in-memory on Redis errors
          return this.isAllowedInMemory(identifier, limit, windowMs);
        }
      } else {
        // In-memory fallback
        return this.isAllowedInMemory(identifier, limit, windowMs);
      }
    } catch (error) {
      console.error('Rate limiting error:', error);
      return this.isAllowedInMemory(identifier, limit, windowMs);
    }
  }

  private isAllowedInMemory(
    identifier: string,
    limit: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.memory.get(identifier);

    if (entry && now > entry.resetTime) {
      this.memory.delete(identifier);
    }

    const currentEntry = this.memory.get(identifier);

    if (!currentEntry) {
      this.memory.set(identifier, {
        count: 1,
        resetTime: now + windowMs
      });
      
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: now + windowMs
      };
    }

    if (currentEntry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: currentEntry.resetTime
      };
    }

    currentEntry.count++;
    
    return {
      allowed: true,
      remaining: limit - currentEntry.count,
      resetTime: currentEntry.resetTime
    };
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.memory.entries()) {
      if (now > entry.resetTime) {
        this.memory.delete(key);
      }
    }
  }
}

export const RATE_LIMITS = {
  PUBLIC: { limit: 30, windowMs: 60 * 1000 },
  CONTACT: { limit: 10, windowMs: 60 * 1000 },
  NEWSLETTER: { limit: 5, windowMs: 60 * 1000 },
  REGISTRATION: { limit: 10, windowMs: 60 * 1000 },
  AUTHENTICATED: { limit: 100, windowMs: 60 * 1000 },
  ADMIN: { limit: 200, windowMs: 60 * 1000 },
  UPLOAD: { limit: 10, windowMs: 60 * 1000 }
};

function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return '127.0.0.1';
}

export async function checkRateLimit(
  request: NextRequest,
  limitType: keyof typeof RATE_LIMITS
): Promise<NextResponse | null> {
  const config = RATE_LIMITS[limitType];
  const rateLimiter = SimpleRateLimiter.getInstance();
  const identifier = getClientIP(request);
  const userId = request.headers.get('x-user-id');
  const finalIdentifier = userId ? `user:${userId}` : `ip:${identifier}`;
  
  const result = await rateLimiter.isAllowed(finalIdentifier, config.limit, config.windowMs);
  
  if (!result.allowed) {
    return NextResponse.json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Please try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
    }, { 
      status: 429,
      headers: {
        'X-RateLimit-Limit': config.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
        'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString()
      }
    });
  }
  
  return null;
}

export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  limitType: keyof typeof RATE_LIMITS
) {
  return async (request: NextRequest) => {
    const rateLimitError = await checkRateLimit(request, limitType);
    if (rateLimitError) return rateLimitError;
    
    const response = await handler(request);
    
    const config = RATE_LIMITS[limitType];
    const rateLimiter = SimpleRateLimiter.getInstance();
    const identifier = getClientIP(request);
    const userId = request.headers.get('x-user-id');
    const finalIdentifier = userId ? `user:${userId}` : `ip:${identifier}`;
    const result = await rateLimiter.isAllowed(finalIdentifier, config.limit, config.windowMs);
    
    response.headers.set('X-RateLimit-Limit', config.limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    
    return response;
  };
}

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    SimpleRateLimiter.getInstance().cleanup();
  }, 5 * 60 * 1000);
}