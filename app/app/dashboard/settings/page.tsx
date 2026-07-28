import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./settings-form";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agency } = await supabase
    .from("agency")
    .select("name, branding")
    .limit(1)
    .maybeSingle<{
      name: string | null;
      branding: Record<string, unknown> | null;
    }>();

  if (!agency) redirect("/dashboard");

  const branding = agency.branding ?? {};
  const brandedColor =
    typeof branding.color === "string" && HEX_COLOR.test(branding.color)
      ? branding.color
      : "#1F6BFF";

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>Réglages</h1>
        <Link className="btn sec" href="/dashboard">
          ← Tableau de bord
        </Link>
      </header>

      <SettingsForm
        initialName={
          typeof branding.name === "string"
            ? branding.name
            : agency.name ?? "Agence"
        }
        initialColor={brandedColor}
        initialLogo={
          typeof branding.logo === "string" ? branding.logo : ""
        }
      />
    </div>
  );
}
