import { redirect } from "next/navigation";

export default function Home() {
  // Redirect root to the polls dashboard
  redirect("/polls");
}
