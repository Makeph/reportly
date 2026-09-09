import LoginForm from "./login-form";

// /auth/callback renvoie ici avec ?error=auth quand l'échange du lien échoue.
// Sans ce message, un lien périmé ramène au formulaire sans rien expliquer —
// l'utilisateur redemande un lien et retombe sur le même mur.
const CALLBACK_ERROR =
  "Ce lien de connexion n’est plus valable : il a déjà servi ou il a expiré. Demandez-en un nouveau ci-dessous.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm initialError={error === "auth" ? CALLBACK_ERROR : null} />;
}
