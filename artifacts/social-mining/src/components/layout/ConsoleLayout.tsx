import { Link, useLocation } from "wouter";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { useConsoleAuth } from "@/components/auth/ConsoleAuth";

export function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useConsoleAuth();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar className="border-r-4 border-foreground brutal-shadow z-10">
          <SidebarHeader className="border-b-4 border-foreground p-4 bg-primary text-primary-foreground">
            <Link href="/" className="font-black text-xl uppercase tracking-tighter hover:text-secondary">
              Back to Portal
            </Link>
          </SidebarHeader>
          <SidebarContent className="bg-card">
            <SidebarGroup>
              <SidebarMenu className="gap-2 p-4">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/console"}>
                    <Link href="/console" className="uppercase font-bold tracking-tight text-lg">Dashboard</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/console/blocks"}>
                    <Link href="/console/blocks" className="uppercase font-bold tracking-tight text-lg">Manage Blocks</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/console/review"}>
                    <Link href="/console/review" className="uppercase font-bold tracking-tight text-lg">Review Queue</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/console/projects"}>
                    <Link href="/console/projects" className="uppercase font-bold tracking-tight text-lg">Projects</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/console/abuse"}>
                    <Link href="/console/abuse" className="uppercase font-bold tracking-tight text-lg">Abuse Events</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/console/audit"}>
                    <Link href="/console/audit" className="uppercase font-bold tracking-tight text-lg">Audit Log</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <div className="mt-auto border-t-4 border-foreground p-4">
            <button
              type="button"
              onClick={signOut}
              className="w-full border-4 border-foreground bg-card px-4 py-2 text-left uppercase font-bold tracking-tight hover:bg-destructive hover:text-destructive-foreground transition-colors"
              data-testid="button-admin-signout"
            >
              Sign Out
            </button>
          </div>
        </Sidebar>
        <main className="flex-1 overflow-auto p-8 relative">
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-5 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-foreground to-transparent"></div>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
