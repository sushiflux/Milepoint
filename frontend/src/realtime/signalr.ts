import * as signalR from '@microsoft/signalr'

const HUB_URL = import.meta.env.VITE_HUB_URL ?? '/hubs/kanban'

export function createKanbanConnection(token: string) {
  return new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .build()
}
