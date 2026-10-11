/**
 * Settings → Connected AI services: each service this account allowed on the
 * approval page (`/connect`), what it may do, and Disconnect, which ends its
 * tokens on the server at once. The server keeps a grant until then, and
 * says so in paulgsc/server `docs/identity.md` ("What is still exposed"):
 * which AI service a person uses is something it did not know before.
 */
import type { JSX } from "react"
import { Label } from "@some-ui/shared"

import { useIntent } from "@/lib/intent"
import { IntentButton, IntentFailure } from "@/lib/intent/render"
import type { ConnectedService } from "@/lib/oauth/client"
import { useConnectedServices, useDisconnectService } from "@/lib/oauth/grants"
import { describeScope } from "@/lib/oauth/scopes"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"

const Service = ({ service }: { service: ConnectedService }): JSX.Element => {
  const disconnect = useIntent(useDisconnectService(), {
    presentation: "interactive",
  })
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{service.clientName}</p>
        <ul className="text-muted-foreground space-y-0.5 text-xs">
          {service.scopes.map((scope) => (
            <li key={scope}>{describeScope(scope)}</li>
          ))}
        </ul>
      </div>
      <IntentButton
        state={disconnect.state}
        onPress={() => disconnect.start(service.id)}
        variant="outline"
        size="sm"
        idleLabel="Disconnect"
        workingLabel="Disconnecting..."
      />
    </li>
  )
}

const ServicesOutcome = (): JSX.Element => {
  const outcome = queryOutcome(useConnectedServices())
  return matchQueryOutcome(outcome, {
    pending: () => <p className="text-muted-foreground text-sm">Loading...</p>,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
    ready: (services) =>
      services.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          None. An AI service connects from its own settings, and asks you here
          first.
        </p>
      ) : (
        <ul className="space-y-3">
          {services.map((service) => (
            <Service key={service.id} service={service} />
          ))}
        </ul>
      ),
  })
}

export const ConnectedServicesSection = (): JSX.Element => (
  <section className="space-y-2" aria-labelledby="connected-services-heading">
    <Label id="connected-services-heading">Connected AI services</Label>
    <ServicesOutcome />
  </section>
)
