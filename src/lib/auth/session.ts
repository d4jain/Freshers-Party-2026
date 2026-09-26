import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getAuth } from "./index";

export type Role = "user" | "staff" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  role: Role;
};

export async function getSessionUser(reqHeaders?: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: reqHeaders ?? (await headers()) });
  if (!session) return null;
  const u = session.user as typeof session.user & { phone?: string; role?: string };
  const role: Role = u.role === "admin" || u.role === "staff" ? u.role : "user";
  return { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, phone: u.phone ?? "", role };
}

/** Server components: redirect to login (keeping only a safe path) when signed out. */
export async function requireUserPage(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export async function requireRolePage(roles: Role[], nextPath: string): Promise<SessionUser> {
  const user = await requireUserPage(nextPath);
  if (!roles.includes(user.role)) redirect("/account?denied=1");
  return user;
}

/** Route handlers. */
export async function requireUserApi(req: Request): Promise<SessionUser> {
  const user = await getSessionUser(req.headers);
  if (!user) throw new AppError("UNAUTHENTICATED", "Please log in to continue.", 401);
  return user;
}

export async function requireRoleApi(req: Request, roles: Role[]): Promise<SessionUser> {
  const user = await requireUserApi(req);
  if (!roles.includes(user.role)) throw new AppError("FORBIDDEN", "You don’t have access to this.", 403);
  return user;
}

export function hasRole(user: SessionUser | null, roles: Role[]) {
  return Boolean(user && roles.includes(user.role));
}
