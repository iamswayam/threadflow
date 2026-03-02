import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  PenSquare,
  Layers,
  Timer,
  MessageSquare,
  Waves,
  Settings,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Compose", url: "/compose", icon: PenSquare },
  { title: "Bulk Post", url: "/bulk", icon: Layers },
  { title: "Follow-Up", url: "/followup", icon: Timer },
  { title: "Comments", url: "/comments", icon: MessageSquare },
];

export function AppSidebar() {
  const [location] = useLocation();

  const { data: status } = useQuery<{ hasToken: boolean }>({
    queryKey: ["/api/status"],
  });

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary">
            <Waves className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-base leading-tight text-sidebar-foreground">ThreadFlow</p>
            <p className="text-xs text-muted-foreground leading-tight">Threads Manager</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} data-testid={`nav-${item.title.toLowerCase().replace(" ", "-")}`}>
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-4">
        <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-muted/50">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status?.hasToken ? "bg-status-online" : "bg-status-offline"}`} />
          <span className="text-xs text-muted-foreground truncate">
            {status?.hasToken ? "API Connected" : "Token Not Set"}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
