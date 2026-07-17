import type { JSX } from "react"
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { Home, ListVideo, Settings, User } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "some-ui-shared"

import { ThemeSwitcher } from "@/components/theme-switcher"
import { Toaster } from "@/components/toaster"

type NavItem = {
  to: "/" | "/sessions" | "/profile" | "/settings"
  label: string
  icon: typeof Home
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/sessions", label: "Sessions", icon: ListVideo },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
]

function isNavItemActive(itemPath: NavItem["to"], pathname: string): boolean {
  if (itemPath === "/") return pathname === "/"
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

const DashboardLayout = (): JSX.Element => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="text-gradient-accent px-2 py-1.5 text-sm font-semibold">
            Some UI
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavItemActive(item.to, pathname)}
                    >
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <ThemeSwitcher />
        </header>
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
})
