/**
 * Shared TypeScript types for book-related data
 */

export interface Book {
  id: number;
  title: string;
  author?: string;
  description?: string;
  description_tfidf?: string | null;
  publisher?: string;
  cover_image?: string | null;
  buy_link?: string;
  categories?: string[];
  rating_avg?: number;
  reviews_count?: number;
  favorites_count?: number;
  views?: number;
  updated_at?: string;
  created_at?: string;
}

export interface Review {
  id: number;
  user_id: number;
  username: string;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at?: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  role: "user" | "admin";
  category_count?: number;
}

