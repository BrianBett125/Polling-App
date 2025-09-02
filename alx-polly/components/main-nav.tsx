import Link from "next/link";
import { cn } from "@/lib/utils";

export default function MainNav() {
  const items = [
    { href: "/", label: "Home" },
    { href: "/polls", label: "Polls" },
    { href: "/polls/new", label: "Create Poll" },
  ];

  return (
    <nav className={cn("flex items-center gap-6 text-sm font-medium")}> 
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="text-foreground/80 hover:text-foreground transition-colors">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}