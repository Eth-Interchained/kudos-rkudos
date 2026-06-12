import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Public Pages
import Landing from "@/pages/public/Landing";
import Blocks from "@/pages/public/Blocks";
import BlockDetail from "@/pages/public/BlockDetail";
import Settlement from "@/pages/public/Settlement";
import Participant from "@/pages/public/Participant";
import Wallet from "@/pages/public/Wallet";
import Payouts from "@/pages/public/Payouts";
import Projects from "@/pages/public/Projects";
import ProjectDetail from "@/pages/public/ProjectDetail";
import ProjectApply from "@/pages/public/ProjectApply";
import Register from "@/pages/public/Register";
import Forum from "@/pages/public/Forum";
import ForumCategory from "@/pages/public/ForumCategory";
import ForumThread from "@/pages/public/ForumThread";
import ForumSearch from "@/pages/public/ForumSearch";

// Console Pages
import Dashboard from "@/pages/console/Dashboard";
import ManageBlocks from "@/pages/console/ManageBlocks";
import ReviewQueue from "@/pages/console/ReviewQueue";
import ProjectApplications from "@/pages/console/ProjectApplications";
import AbuseEvents from "@/pages/console/AbuseEvents";
import AuditLog from "@/pages/console/AuditLog";
import ForumModeration from "@/pages/console/ForumModeration";

import { Layout } from "@/components/layout/Layout";
import { ConsoleLayout } from "@/components/layout/ConsoleLayout";
import { ConsoleAuthProvider } from "@/components/auth/ConsoleAuth";

const queryClient = new QueryClient();

function PublicRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/blocks" component={Blocks} />
        <Route path="/blocks/:seq" component={BlockDetail} />
        <Route path="/blocks/:seq/settlement" component={Settlement} />
        <Route path="/participants/:handle" component={Participant} />
        <Route path="/wallet" component={Wallet} />
        <Route path="/payouts" component={Payouts} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/apply" component={ProjectApply} />
        <Route path="/register" component={Register} />
        <Route path="/forum" component={Forum} />
        <Route path="/forum/search" component={ForumSearch} />
        <Route path="/forum/c/:slug" component={ForumCategory} />
        <Route path="/forum/t/:id" component={ForumThread} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function ConsoleRouter() {
  return (
    <ConsoleAuthProvider>
      <ConsoleLayout>
        <Switch>
          <Route path="/console" component={Dashboard} />
          <Route path="/console/blocks" component={ManageBlocks} />
          <Route path="/console/review" component={ReviewQueue} />
          <Route path="/console/projects" component={ProjectApplications} />
          <Route path="/console/abuse" component={AbuseEvents} />
          <Route path="/console/audit" component={AuditLog} />
          <Route path="/console/forum" component={ForumModeration} />
          <Route component={NotFound} />
        </Switch>
      </ConsoleLayout>
    </ConsoleAuthProvider>
  );
}

function MainRouter() {
  const [location] = useLocation();
  const isConsole = location.startsWith("/console");

  if (isConsole) {
    return <ConsoleRouter />;
  }
  return <PublicRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <MainRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
