import type { BoardState } from "../../src/lib/board-model"

export const boardFixture: BoardState = {
  columns: [
    { id: "column-backlog", name: "Backlog", color: "#a3a3a3", done: false },
    { id: "column-active", name: "En cours", color: "#3B82F6", done: false },
    { id: "column-done", name: "Done", color: "#10B981", done: true },
  ],
  tickets: [
    {
      id: "ticket-projection",
      columnId: "column-backlog",
      position: 0,
      title: "Brancher le snapshot Tableau sur la projection SQLite",
      description: "Exposer une lecture compacte des colonnes et tickets.",
      priority: "urgent",
      dueAt: "2026-08-16T17:00:00.000Z",
    },
    {
      id: "ticket-http",
      columnId: "column-backlog",
      position: 1,
      title: "Définir la frontière RPC du Tableau",
      description: "Ajouter les commandes Ticket et le BoardSnapshot.",
      priority: "high",
    },
    {
      id: "ticket-sheet",
      columnId: "column-backlog",
      position: 2,
      title: "Rendre le Dialog Ticket partageable",
      description: "Conserver le ticket et la recherche dans l’URL.",
      priority: "normal",
      dueAt: "2026-08-20T17:00:00.000Z",
    },
    {
      id: "ticket-board-ui",
      columnId: "column-active",
      position: 0,
      title: "Construire l’interface du Tableau",
      description: "Colonnes stables, interactions rapides et information progressive.",
      priority: "high",
    },
  ],
  ticketDependencies: [{ ticketId: "ticket-projection", dependsOnTicketId: "ticket-http" }],
}
