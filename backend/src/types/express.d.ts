import "express";

declare global {
  namespace Express {
    interface User {
      id: number;
      role?: string;
      email?: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
