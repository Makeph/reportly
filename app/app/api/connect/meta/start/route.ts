import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

// Démarre le flux OAuth Meta : pose un state anti-CSRF puis redirige vers le dialog.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connect/meta/callback`;
  const state = randomBytes(16).toString("hex");

  (await cookies()).set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const version = process.env.META_API_VERSION || "v21.0";
  const auth = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  auth.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("scope", "ads_read");
  auth.searchParams.set("state", state);
  auth.searchParams.set("response_type", "code");

  return NextResponse.redirect(auth);
}
