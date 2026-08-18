import { redirect } from "next/navigation";

export default function HomePage() {
  // The proxy decides where this actually lands based on the auth cookies.
  redirect("/dashboard");
}
