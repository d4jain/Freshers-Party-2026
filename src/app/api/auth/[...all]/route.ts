import { getAuth } from "@/lib/auth";

// Better Auth handles signup, login, logout, verification and password reset.
export async function GET(req: Request) {
  return getAuth().handler(req);
}

export async function POST(req: Request) {
  return getAuth().handler(req);
}
