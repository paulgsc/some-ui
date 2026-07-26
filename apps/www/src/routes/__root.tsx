import { TanstackDevtools } from "@tanstack/react-devtools"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {/* Vite strips this whole block (and its two devtools deps) from the
          production bundle - without the guard it also renders on the
          deployed GitHub Pages site, which is what happened before. */}
      {import.meta.env.DEV && (
        <TanstackDevtools
          config={{
            position: "bottom-left",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      )}
    </>
  ),
})
