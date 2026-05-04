import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { SiteShell } from "@/components/layout/SiteShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

import Explore from "./pages/Explore";
import EventDetail from "./pages/EventDetail";
import HostPublic from "./pages/HostPublic";
import SignIn from "./pages/auth/SignIn";
import SignUp from "./pages/auth/SignUp";
import HostOnboarding from "./pages/onboarding/HostOnboarding";
import Dashboard from "./pages/dashboard/Dashboard";
import EventNew from "./pages/dashboard/EventNew";
import EventEdit from "./pages/dashboard/EventEdit";
import CheckIn from "./pages/dashboard/CheckIn";
import GalleryReview from "./pages/dashboard/GalleryReview";
import Members from "./pages/dashboard/Members";
import Reports from "./pages/dashboard/Reports";
import MyTickets from "./pages/my/MyTickets";
import MyEvents from "./pages/my/MyEvents";
import InviteAccept from "./pages/InviteAccept";
import Report from "./pages/Report";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <SiteShell>
              <Routes>
                {/* Public surface */}
                <Route path="/" element={<Explore />} />
                <Route path="/events/:id" element={<EventDetail />} />
                <Route path="/hosts/:slug" element={<HostPublic />} />

                {/* Auth */}
                <Route path="/auth/sign-in" element={<SignIn />} />
                <Route path="/auth/sign-up" element={<SignUp />} />

                {/* Onboarding */}
                <Route path="/onboarding/host" element={<RequireAuth><HostOnboarding /></RequireAuth>} />

                {/* Host dashboard (auth required; per-resource role enforcement happens inside via RLS + UI checks in later phases) */}
                <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/dashboard/events/new" element={<RequireAuth><EventNew /></RequireAuth>} />
                <Route path="/dashboard/events/:id/edit" element={<RequireAuth><EventEdit /></RequireAuth>} />
                <Route path="/dashboard/events/:id/checkin" element={<RequireAuth><CheckIn /></RequireAuth>} />
                <Route path="/dashboard/events/:id/gallery-review" element={<RequireAuth><GalleryReview /></RequireAuth>} />
                <Route path="/dashboard/members" element={<RequireAuth><Members /></RequireAuth>} />
                <Route path="/dashboard/reports" element={<RequireAuth><Reports /></RequireAuth>} />

                {/* Personal */}
                <Route path="/my/tickets" element={<RequireAuth><MyTickets /></RequireAuth>} />
                <Route path="/my/events" element={<RequireAuth><MyEvents /></RequireAuth>} />

                {/* Invitation + report (open to anon for report) */}
                <Route path="/invite/:token" element={<InviteAccept />} />
                <Route path="/report/:type/:id" element={<Report />} />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </SiteShell>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
