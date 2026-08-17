import * as signalR from '@microsoft/signalr'

const HUB_URL = import.meta.env.VITE_HUB_URL ?? '/hubs/kanban'

export function createKanbanConnection(token: string) {
  return new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    // React StrictMode's dev-only double-invoke of effects mounts this connection twice in a
    // row; the first one gets torn down mid-negotiation, which the SDK logs unconditionally at
    // Error level even though it's expected and already handled (see the .catch() in
    // KanbanBoard's effect - realtime is a comfort feature, connection failures don't affect
    // the app). Default log level (Information) surfaces that plus routine connect/reconnect
    // chatter on every page load; Critical keeps genuinely actionable SDK failures visible.
    .configureLogging(signalR.LogLevel.Critical)
    .build()
}
