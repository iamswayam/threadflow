import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { LayoutDashboard, PenSquare, Layers, Timer, MessageSquare, Inbox, Settings, LogOut, Bookmark } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ThreadFlowLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Compose", url: "/compose", icon: PenSquare },
  { title: "Bulk Post", url: "/bulk", icon: Layers },
  { title: "Follow-Up", url: "/followup", icon: Timer },
  { title: "Comments", url: "/comments", icon: MessageSquare },
  { title: "Reply Center", url: "/reply-center", icon: Inbox },
  { title: "My Content", url: "/my-content", icon: Bookmark },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, signout, hasThreadsConnected } = useAuth();

  const userInitial = user?.email?.[0]?.toUpperCase() || "U";

  return (
    <Sidebar className="border-r border-sidebar-border">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, hsl(187 30% 6%) 0%, hsl(200 25% 5%) 50%, hsl(0 0% 4%) 100%)",
        }}
      />

      <SidebarHeader className="px-4 py-5 relative z-10">
        <div className="flex items-center gap-2.5">
          <ThreadFlowLogo className="w-8 h-8" />
          <div>
            <p className="font-bold text-base leading-tight text-sidebar-foreground tracking-tight">ThreadFlow</p>
            <p className="text-xs text-muted-foreground leading-tight">Threads Manager</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="relative z-10">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      className={isActive ? "relative" : ""}
                    >
                      <Link href={item.url}>
                        {isActive && (
                          <span
                            className="absolute inset-0 rounded-md pointer-events-none"
                            style={{ boxShadow: "inset 0 0 0 1px hsl(187 75% 48% / 0.25), 0 0 8px hsl(187 75% 48% / 0.12)" }}
                          />
                        )}
                        <item.icon className={`w-4 h-4 ${isActive ? "text-sidebar-primary" : ""}`} />
                        <span className={isActive ? "text-sidebar-primary font-medium" : ""}>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 relative z-10 space-y-2">
        <div className="flex items-center gap-2.5 px-2 py-2.5 rounded-md bg-sidebar-accent/60">
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={user?.threadsProfilePicUrl || undefined} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {userInitial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {user?.threadsUsername ? `@${user.threadsUsername}` : user?.email}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasThreadsConnected ? "bg-status-online" : "bg-status-offline"}`} />
              <span className="text-[10px] text-muted-foreground">
                {hasThreadsConnected ? "Connected" : "Not connected"}
              </span>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={signout}
            className="w-7 h-7 flex-shrink-0 text-muted-foreground"
            data-testid="button-signout"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
