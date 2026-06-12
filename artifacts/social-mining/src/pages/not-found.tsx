import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center animate-in fade-in">
      <div className="text-center space-y-6 max-w-lg border-4 border-foreground p-12 bg-card brutal-shadow mx-4">
        <h1 className="text-8xl font-black uppercase text-primary">404</h1>
        <div className="space-y-2">
          <h2 className="text-3xl font-black uppercase">Page Not Found</h2>
          <p className="font-mono text-muted-foreground">The resource you requested does not exist or has been removed.</p>
        </div>
        <Link href="/" className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-tight transition-transform active:translate-y-1 active:shadow-none brutal-shadow border-4 border-foreground w-full mt-4 h-12 rounded-none">
          Return to Portal
        </Link>
      </div>
    </div>
  );
}
