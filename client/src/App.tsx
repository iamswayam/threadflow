import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect, useState } from "react";
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
import { Sun, Moon, Bell, CheckCircle2, AlertCircle, Trophy, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Compose from "@/pages/compose";
import MultiPost from "@/pages/MultiPost";
import Engagement from "@/pages/Engagement";
import Settings from "@/pages/settings";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ConnectThreads from "@/pages/connect-threads";
import Analytics from "@/pages/Analytics"; // âœ… NEW
import Dna from "@/pages/Dna";
import MyContent from "@/pages/MyContent"; // NEW
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  THREADFLOW_NOTIFICATION_EVENT,
  clearAll,
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  type NotificationItem,
} from "@/lib/notifications";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISS_KEY = "threadflow_pwa_dismissed";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle" className="text-muted-foreground">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function formatNotificationAge(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationTypeIcon({ type }: { type: NotificationItem["type"] }) {
  switch (type) {
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case "error":
      return <AlertCircle className="w-4 h-4 text-destructive" />;
    case "milestone":
      return <Trophy className="w-4 h-4 text-amber-400" />;
    case "dna":
      return <Sparkles className="w-4 h-4 text-primary" />;
    case "info":
    default:
      return <Bell className="w-4 h-4 text-primary" />;
  }
}

function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => getNotifications());
  const [unreadCount, setUnreadCount] = useState<number>(() => getUnreadCount());

  const refreshNotifications = () => {
    setNotifications(getNotifications());
    setUnreadCount(getUnreadCount());
  };

  useEffect(() => {
    refreshNotifications();
    const handleNotificationUpdate = () => refreshNotifications();
    window.addEventListener(THREADFLOW_NOTIFICATION_EVENT, handleNotificationUpdate as EventListener);
    return () => {
      window.removeEventListener(THREADFLOW_NOTIFICATION_EVENT, handleNotificationUpdate as EventListener);
    };
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" data-testid="button-notifications" className="text-muted-foreground relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                markAllRead();
                refreshNotifications();
              }}
            >
              Mark all read
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="py-6 flex flex-col items-center justify-center text-center">
            <Bell className="w-6 h-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
            <p className="text-xs text-muted-foreground mt-1">Activity from your posts will appear here</p>
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full text-left py-3 px-4 border-b border-border/40 last:border-0 ${
                    item.read ? "bg-background" : "border-l-2 border-primary bg-primary/5 pl-[14px]"
                  }`}
                  onClick={() => {
                    markRead(item.id);
                    refreshNotifications();
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <NotificationTypeIcon type={item.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.message}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">{formatNotificationAge(item.timestamp)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-border px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  clearAll();
                  refreshNotifications();
                }}
              >
                Clear all
              </Button>
            </div>
          </>
        )}
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
        <Route path="/multi" component={() => <AnimatedRoute component={MultiPost} path="/multi" />} />
        <Route path="/bulk" component={() => <Redirect to="/multi" />} />
        <Route path="/chain" component={() => <Redirect to="/multi" />} />
        <Route path="/analytics" component={() => <AnimatedRoute component={Analytics} path="/analytics" />} />
        <Route path="/dna" component={() => <AnimatedRoute component={Dna} path="/dna" />} />
        <Route path="/followup" component={() => <Redirect to="/my-content" />} />
        <Route path="/engagement" component={() => <AnimatedRoute component={Engagement} path="/engagement" />} />
        <Route path="/comments" component={() => <Redirect to="/engagement" />} />
        <Route path="/reply-center" component={() => <Redirect to="/engagement" />} />
        <Route path="/my-content" component={() => <AnimatedRoute component={MyContent} path="/my-content" />} />
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

function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isMobile = window.innerWidth < 768;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isDismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "true";

    if (!isMobile || isStandalone || isDismissed) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, "true");
    setIsVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  if (!isVisible || !deferredPrompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-primary/30 bg-background/95 md:hidden">
      <div className="mx-auto flex max-w-screen-sm items-center gap-3 px-4 py-3">
        <p className="flex-1 text-xs text-muted-foreground">
          Add ThreadFlow to your home screen for the best experience
        </p>
        <Button
          size="sm"
          className="h-7 bg-primary/90 px-3 text-xs text-black hover:bg-primary"
          onClick={() => void handleInstall()}
        >
          Add
        </Button>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          onClick={handleDismiss}
          className="h-7 w-7 text-sm text-muted-foreground hover:text-foreground"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <AuthGuard />
            <InstallPromptBanner />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

