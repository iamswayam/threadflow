import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sun, Moon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Compose from "@/pages/compose";
import BulkPost from "@/pages/bulk";
import FollowUp from "@/pages/followup";
import Comments from "@/pages/comments";
import Settings from "@/pages/settings";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ConnectThreads from "@/pages/connect-threads";
import ThreadChain from "@/pages/ThreadChain"; // ✅ NEW
import Analytics from "@/pages/Analytics"; // ✅ NEW
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle" className="text-muted-foreground">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function NotificationBell() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" data-testid="button-notifications" className="text-muted-foreground relative">
          <Bell className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
        </div>
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <Bell className="w-6 h-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
          <p className="text-xs text-muted-foreground mt-1">Activity from your posts will appear here</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function AnimatedRoute({ component: Component, ...props }: { component: React.ComponentType<any>; [key: string]: any }) {
  return (
    <motion.div
      key={props.path}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="h-full"
    >
      <Component {...props} />
    </motion.div>
  );
}

function ProtectedRouter() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Switch location={location}>
        <Route path="/" component={() => <AnimatedRoute component={Dashboard} path="/" />} />
        <Route path="/compose" component={() => <AnimatedRoute component={Compose} path="/compose" />} />
        <Route path="/bulk" component={() => <AnimatedRoute component={BulkPost} path="/bulk" />} />
        <Route path="/chain" component={() => <AnimatedRoute component={ThreadChain} path="/chain" />} />
        <Route path="/analytics" component={() => <AnimatedRoute component={Analytics} path="/analytics" />} />
        <Route path="/followup" component={() => <AnimatedRoute component={FollowUp} path="/followup" />} />
        <Route path="/comments" component={() => <AnimatedRoute component={Comments} path="/comments" />} />
        <Route path="/settings" component={() => <AnimatedRoute component={Settings} path="/settings" />} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function AppLayout() {
  const { user } = useAuth();
  const sidebarStyle = { "--sidebar-width": "15rem", "--sidebar-width-icon": "3.5rem" };
  const userInitial = user?.email?.[0]?.toUpperCase() || "U";

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0 h-[52px]">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
              <Avatar className="w-8 h-8 cursor-pointer" data-testid="avatar-user">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <ProtectedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAuthPage = location === "/login" || location === "/signup" || location === "/connect";

  if (!isAuthenticated && !isAuthPage) {
    return <Redirect to="/login" />;
  }

  if (isAuthenticated && (location === "/login" || location === "/signup")) {
    return <Redirect to="/" />;
  }

  if (isAuthPage) {
    return (
      <Switch>
        <Route path="/login" component={() => {
          const params = new URLSearchParams(window.location.search);
          return <Login successMessage={params.get("success") ? "Account created! Sign in to continue." : undefined} />;
        }} />
        <Route path="/signup" component={Signup} />
        <Route path="/connect" component={ConnectThreads} />
      </Switch>
    );
  }

  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <AuthGuard />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
