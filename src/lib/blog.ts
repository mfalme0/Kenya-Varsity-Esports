import { Databases, ID, Query } from 'node-appwrite';
import { getAdminClient } from './appwrite-server';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID || '';
const BLOG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_BLOG_POSTS_COLLECTION_ID || '';

if (!BLOG_COLLECTION_ID) {
  console.warn('NEXT_PUBLIC_APPWRITE_BLOG_POSTS_COLLECTION_ID environment variable is not set. Blog features will be disabled.');
}

export interface BlogPost {
  $id: string;
  id: string;
  title: string;
  description: string;
  content: string;
  slug: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  featured: boolean;
  category: string;
  game: string;
  author: string;
  authorAvatar?: string;
  authorBio?: string;
  authorTwitter?: string;
  authorLinkedIn?: string;
  authorInstagram?: string;
  authorTikTok?: string;
  authorYouTube?: string;
  authorFacebook?: string;
  tags: string[];
  imageUrl?: string;
  image?: any;
  published: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

function validateSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

function mapDocument(doc: any): BlogPost {
  return {
    $id: doc.$id,
    id: doc.id || doc.$id,
    title: doc.title,
    description: doc.description,
    content: doc.content,
    slug: doc.slug,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    featured: doc.featured || false,
    category: doc.category || 'General',
    game: doc.game || '',
    author: doc.author || 'KVE Team',
    authorAvatar: doc.authorAvatar,
    authorBio: doc.authorBio,
    authorTwitter: doc.authorTwitter,
    authorLinkedIn: doc.authorLinkedIn,
    authorInstagram: doc.authorInstagram,
    authorTikTok: doc.authorTikTok,
    authorYouTube: doc.authorYouTube,
    authorFacebook: doc.authorFacebook,
    tags: doc.tags || [],
    imageUrl: doc.imageUrl,
    image: doc.image,
    published: doc.published !== false,
  };
}

async function getDatabases(): Promise<Databases> {
  const client = await getAdminClient();
  return new Databases(client);
}

export async function getAllPosts(params?: {
  page?: number;
  pageSize?: number;
  category?: string;
  game?: string;
  search?: string;
  featured?: boolean;
  includeDrafts?: boolean;
}): Promise<PaginatedResponse<BlogPost>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 10;
  const includeDrafts = params?.includeDrafts || false;

  const databases = await getDatabases();
  const queries = [
    Query.orderDesc('publishedAt'),
    Query.limit(pageSize),
    Query.offset((page - 1) * pageSize),
  ];

  if (!includeDrafts) {
    queries.push(Query.equal('published', true));
  }

  if (params?.category) {
    queries.push(Query.equal('category', params.category));
  }
  if (params?.game) {
    queries.push(Query.equal('game', params.game));
  }
  if (params?.search) {
    queries.push(Query.search('title', params.search));
  }
  if (params?.featured !== undefined) {
    queries.push(Query.equal('featured', params.featured));
  }

  const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, queries);
  
  const posts = result.documents.map(mapDocument);
  const total = result.total;
  const pageCount = Math.ceil(total / pageSize);

  return {
    data: posts,
    meta: {
      pagination: {
        page,
        pageSize,
        pageCount,
        total,
      },
    },
  };
}

export async function getPostBySlug(slug: string, includeDrafts = false): Promise<BlogPost | null> {
  if (!validateSlug(slug)) return null;

  try {
    const databases = await getDatabases();
    const queries = [Query.equal('slug', slug)];
    if (!includeDrafts) {
      queries.push(Query.equal('published', true));
    }
    const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, queries);
    if (result.documents.length === 0) return null;
    return mapDocument(result.documents[0]);
  } catch (error) {
    console.error('Error fetching post by slug:', error);
    return null;
  }
}

export async function getFeaturedArticles(limit = 3, includeDrafts = false): Promise<BlogPost[]> {
  const databases = await getDatabases();
  const queries = [
    Query.equal('featured', true),
    Query.orderDesc('publishedAt'),
    Query.limit(limit),
  ];
  if (!includeDrafts) {
    queries.push(Query.equal('published', true));
  }
  const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, queries);
  return result.documents.map(mapDocument);
}

export async function getCategories(): Promise<string[]> {
  const databases = await getDatabases();
  const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, [Query.limit(1000)]);
  const categories = new Set(result.documents.map(d => d.category).filter(Boolean));
  return Array.from(categories).sort();
}

export async function getGames(): Promise<string[]> {
  const databases = await getDatabases();
  const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, [Query.limit(1000)]);
  const games = new Set(result.documents.map(d => d.game).filter(Boolean));
  return Array.from(games).sort();
}

export async function getAuthors(): Promise<string[]> {
  const databases = await getDatabases();
  const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, [Query.limit(1000)]);
  const authors = new Set(result.documents.map(d => d.author).filter(Boolean));
  return Array.from(authors).sort();
}

export async function savePost(post: BlogPost): Promise<BlogPost> {
  if (!validateSlug(post.slug)) {
    throw new Error('Invalid slug. Use only lowercase letters, numbers, and hyphens.');
  }

  const databases = await getDatabases();
  const now = new Date().toISOString();
  const isNew = !post.$id;

  const data = {
    id: post.id || post.slug,
    title: post.title,
    description: post.description,
    slug: post.slug,
    content: post.content,
    publishedAt: post.publishedAt || (isNew ? now : undefined),
    createdAt: post.createdAt || (isNew ? now : undefined),
    updatedAt: now,
    featured: post.featured || false,
    category: post.category || 'General',
    game: post.game || '',
    author: post.author || 'KVE Team',
    authorAvatar: post.authorAvatar,
    authorBio: post.authorBio,
    authorTwitter: post.authorTwitter,
    authorLinkedIn: post.authorLinkedIn,
    authorInstagram: post.authorInstagram,
    authorTikTok: post.authorTikTok,
    authorYouTube: post.authorYouTube,
    authorFacebook: post.authorFacebook,
    tags: post.tags || [],
    imageUrl: post.imageUrl,
    image: typeof post.image === 'string' ? post.image : post.image ? JSON.stringify(post.image) : undefined,
    published: post.published !== false,
  };

  // Remove undefined values
  Object.keys(data).forEach(key => {
    if (data[key as keyof typeof data] === undefined) {
      delete data[key as keyof typeof data];
    }
  });

  let doc;
  if (isNew) {
    doc = await databases.createDocument(DB_ID, BLOG_COLLECTION_ID, ID.unique(), data);
  } else {
    doc = await databases.updateDocument(DB_ID, BLOG_COLLECTION_ID, post.$id, data);
  }

  return mapDocument(doc);
}

export async function deletePost(slug: string): Promise<void> {
  if (!validateSlug(slug)) {
    throw new Error('Invalid slug');
  }

  const databases = await getDatabases();
  const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, [Query.equal('slug', slug)]);
  if (result.documents.length > 0) {
    await databases.deleteDocument(DB_ID, BLOG_COLLECTION_ID, result.documents[0].$id);
  }
}

export async function getAllSlugs(includeDrafts = false): Promise<string[]> {
  const databases = await getDatabases();
  const queries = [Query.limit(1000), Query.select(['slug'])];
  if (!includeDrafts) {
    queries.push(Query.equal('published', true));
  }
  const result = await databases.listDocuments(DB_ID, BLOG_COLLECTION_ID, queries);
  return result.documents.map(d => d.slug);
}