import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 remplace la convention `middleware.ts` par `proxy.ts`.
// La logique est inchangée : rafraîchir la session Supabase à chaque requête
// et protéger le préfixe /dashboard (voir lib/supabase/middleware.ts).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Tout sauf assets statiques et fichiers image
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
