import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getUser } from "@/lib/auth";

export default async function SignupPage() {
  if (await getUser()) redirect("/app");
  return <AuthForm mode="signup" />;
}
