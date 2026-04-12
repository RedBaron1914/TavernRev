export type Lorebook = {
  id: number; name: string; description: string;
  is_global: boolean; excluded_from_global: boolean; global_enabled: boolean;
};
export type LoreEntry = {
  id: number; book_id: number; keys: string; content: string;
  enabled: boolean; constant: boolean; priority: number;
  probability: number; position: string; depth: number;
};
export type LorebookLink = { book_id: number; enabled: boolean };
export type LoreTab = "global" | "card" | "chat";
export interface PinModalState { bookId: number; bookName: string }
