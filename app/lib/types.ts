export type Role = "pending" | "member" | "admin" | "denied";

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  classmateId: number | null;
  /** True when an admin is previewing the site as a member (role is then "member"). */
  previewing?: boolean;
}

export const isMember = (u: SessionUser | null): boolean => !!u && (u.role === "member" || u.role === "admin");

export const isAdmin = (u: SessionUser | null): boolean => !!u && u.role === "admin";
