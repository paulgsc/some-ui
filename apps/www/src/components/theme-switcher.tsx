import type { JSX } from "react"
import { useTheme } from "@/providers/theme"
import { APP_THEMES, SYSTEM_PREFERENCE } from "@some-ui/styles/theme"
import type { AppTheme, ThemePreference } from "@some-ui/styles/theme"
import { Check, Monitor, Palette } from "lucide-react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@some-ui/shared"

const Swatch = ({ theme }: { theme: AppTheme }): JSX.Element => (
  <span
    aria-hidden
    className="size-4 shrink-0 rounded-full border"
    style={{
      background: `linear-gradient(135deg, ${theme.swatch.bg} 0 50%, ${theme.swatch.accent} 50% 100%)`,
      borderColor: theme.swatch.fg,
    }}
  />
)

const OptionRow = ({
  active,
  children,
}: {
  active: boolean
  children: JSX.Element | Array<JSX.Element>
}): JSX.Element => (
  <span className="flex w-full items-center gap-2">
    {children}
    <Check
      className={`ml-auto size-4 ${active ? "opacity-100" : "opacity-0"}`}
    />
  </span>
)

export const ThemeSwitcher = (): JSX.Element => {
  const { preference, setPreference } = useTheme()

  const select = (next: ThemePreference): void => setPreference(next)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Palette className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => select(SYSTEM_PREFERENCE)}>
          <OptionRow active={preference === SYSTEM_PREFERENCE}>
            <Monitor className="size-4 shrink-0" />
            <span>System</span>
          </OptionRow>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {APP_THEMES.map((theme) => (
          <DropdownMenuItem key={theme.id} onSelect={() => select(theme.id)}>
            <OptionRow active={preference === theme.id}>
              <Swatch theme={theme} />
              <span>{theme.label}</span>
            </OptionRow>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
