# TavernRev Multiplayer Architecture (v2.0 Blueprint)

This document outlines the theoretical architecture for introducing seamless, decentralized multiplayer functionality into TavernRev. It builds upon the Group Chats foundation established in v0.9.0.

## Core Philosophy
TavernRev Multiplayer operates on a **Host-Client (Game Master - Player)** model, avoiding the need for expensive centralized servers. It prioritizes data privacy, bandwidth efficiency, and flexible API cost-sharing.

---

## 1. Network Topology: The "Middle Man"

We avoid traditional heavy backend servers (like Node.js + MongoDB on AWS). Instead, we use lightweight signaling.

*   **Option A: Cloudflare Workers + WebSockets (Recommended for stability)**
    *   A tiny, stateless Cloudflare Worker acts as a router.
    *   The Host creates a "Room" (Durable Object or simple pub/sub channel).
    *   Clients connect via WebSocket using a room code.
    *   The Worker simply broadcasts JSON messages between the Host and Clients. It stores *no* chat history.
*   **Option B: WebRTC (True P2P)**
    *   Requires a public STUN/TURN server for initial handshake, but subsequent communication is directly device-to-device.

## 2. Roles and Authority

*   **The Host (Server):**
    *   Maintains the "Source of Truth" SQLite database.
    *   Runs the **Routing Engine** (decides whose turn it is to speak).
    *   Evaluates **Lorebooks** (World Info).
    *   Manages the room and permissions.
*   **The Client (Player):**
    *   Maintains a read-only, in-memory replica of the current chat session.
    *   Sends user messages to the Host.
    *   (Optionally) executes AI generation tasks when instructed by the Host.

---

## 3. Delegated Generation (The API Cost-Sharing Solution)

To prevent the Host from exhausting their API rate limits or bearing the entire financial cost of a multiplayer session, TavernRev introduces **Delegated Generation**.

### How it works:
1.  **Configuration:** In the lobby, players agree on who generates which bot. (e.g., Host generates Bot A using a local LLM, Client 1 generates Bot B using their personal OpenAI key).
2.  **The Trigger:** The Host's Routing Engine determines it is Bot B's turn to speak.
3.  **The Payload:** Instead of generating the reply, the Host sends a lightweight command payload to Client 1:
    ```json
    {
      "type": "delegate_generate",
      "character_id": "bot_b_uuid",
      "chat_history_hash": "a1b2c3d4", // To ensure Client is synced
      "lore_injections": [
        "The tavern is lit by blue flames." // Pre-evaluated by Host
      ]
    }
    ```
4.  **Client-Side Assembly (Shadow Prompting):** Client 1 receives the payload. Because Client 1 already has a synchronized copy of the chat history and Bot B's character card in memory, it runs the `prompt_engine` *locally*. It injects the provided lore and builds the final prompt.
5.  **Execution & Streaming:** Client 1 uses its *own* API key to contact the LLM. It streams the resulting text back to the Host via the WebSocket/WebRTC channel.
6.  **Confirmation:** The Host receives the stream, saves it to the master SQLite database, and broadcasts the final message to all other clients.

*Note: This feature is entirely optional. The Host can configure the room to be "Host-Only Generation," where the Host's API key/local model processes all requests.*

---

## 4. Lorebook Security (The "Game Master" Pattern)

To prevent players from datamining the Host's entire world-building dictionary, Lorebooks are **never** fully synchronized to Clients.

*   **Evaluation:** Only the Host evaluates keywords against the chat history.
*   **Injection:** When a keyword triggers a lore entry, the Host simply attaches the resulting text string to the `delegate_generate` payload (as seen above).
*   **Result:** Players only "see" the lore that has actively surfaced in the conversation, preserving the mystery of the roleplay.

## 5. Handling Multimodal Data (Bandwidth Optimization)

Sending large image files within the generation payload would cause massive delays.

*   **Upload:** When a user attaches an image, it is uploaded to the Host once.
*   **Sync:** The Host broadcasts the image (Base64 or URL) to all Clients immediately as part of the chat history sync.
*   **Generation:** When a Client is asked to generate a reply, the image is *already* in their local memory cache, ready to be assembled into the prompt without re-downloading it from the Host.