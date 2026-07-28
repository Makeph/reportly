"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: {
    name?: string;
    color?: string;
    logo?: string;
  };
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function saveSettings(
  _previousState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const logo = String(formData.get("logo") ?? "").trim();
  const errors: NonNullable<SettingsState["errors"]> = {};

  if (!name) {
    errors.name = "Le nom affiché est obligatoire.";
  }
  if (!HEX_COLOR.test(color)) {
    errors.color = "La couleur doit être un code hexadécimal valide, par exemple #1F6BFF.";
  }
  if (logo) {
    try {
      const url = new URL(logo);
      if (url.protocol !== "https:") {
        errors.logo = "L’URL du logo doit commencer par https://.";
      }
    } catch {
      errors.logo = "L’URL du logo doit être une adresse https valide.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      errors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: "error",
      message: "Votre session a expiré. Reconnectez-vous pour enregistrer les réglages.",
    };
  }

  const { data: agency, error: readError } = await supabase
    .from("agency")
    .select("id, branding")
    .limit(1)
    .maybeSingle<{ id: string; branding: Record<string, unknown> | null }>();

  if (readError || !agency) {
    return {
      status: "error",
      message: "Impossible de charger les réglages de l’agence.",
    };
  }

  const currentBranding =
    agency.branding &&
    typeof agency.branding === "object" &&
    !Array.isArray(agency.branding)
      ? agency.branding
      : {};

  const { data: updatedAgency, error: updateError } = await supabase
    .from("agency")
    .update({
      branding: {
        ...currentBranding,
        name,
        color,
        logo,
      },
    })
    .eq("id", agency.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError || !updatedAgency) {
    return {
      status: "error",
      message: "Seul le propriétaire de l’agence peut modifier ces réglages.",
    };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/portal", "layout");

  return {
    status: "success",
    message: "Réglages enregistrés.",
  };
}
