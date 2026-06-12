import { useState } from "react";
import { Link } from "wouter";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/blocks", label: "Blocks" },
  { href: "/projects", label: "Projects" },
  { href: "/wallet", label: "Claim" },
  { href: "/payouts", label: "Payouts" },
];

const CTA_LINKS = [
  { href: "/register", label: "Register" },
  { href: "/console", label: "Console" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b-4 border-foreground bg-primary text-primary-foreground p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-black uppercase tracking-tighter hover:text-secondary transition-colors brutal-shadow bg-foreground text-background px-2">
            Kudos
          </Link>
          <nav className="hidden md:flex gap-6 font-bold uppercase tracking-tight">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-secondary hover:underline underline-offset-4">{l.label}</Link>
            ))}
            {CTA_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="bg-foreground text-primary px-3 py-1 brutal-shadow hover:bg-secondary hover:text-foreground">{l.label}</Link>
            ))}
          </nav>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className="md:hidden bg-foreground text-background p-2 border-2 border-background brutal-shadow"
            >
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent side="right" className="border-l-4 border-foreground bg-primary text-primary-foreground w-72">
              <SheetTitle className="text-2xl font-black uppercase tracking-tighter bg-foreground text-background px-2 inline-block">
                Menu
              </SheetTitle>
              <nav className="mt-8 flex flex-col gap-4 font-bold uppercase tracking-tight">
                {NAV_LINKS.map((l) => (
                  <SheetClose asChild key={l.href}>
                    <Link href={l.href} className="text-lg hover:text-secondary hover:underline underline-offset-4">{l.label}</Link>
                  </SheetClose>
                ))}
                {CTA_LINKS.map((l) => (
                  <SheetClose asChild key={l.href}>
                    <Link href={l.href} className="bg-foreground text-primary px-3 py-2 text-center brutal-shadow hover:bg-secondary hover:text-foreground">{l.label}</Link>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className="flex-1 container mx-auto p-4 md:p-8">
        {children}
      </main>
      <footer className="border-t-4 border-foreground p-8 bg-card text-card-foreground">
        <div className="container mx-auto text-sm font-mono uppercase font-bold text-muted-foreground flex justify-between">
          <span>Kudos · Interchained Social Mining</span>
          <span>Inverted Hashpower Model</span>
        </div>
      </footer>
    </div>
  );
}
