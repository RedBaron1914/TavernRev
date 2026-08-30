export type Character = {
  id: number;
  name: string;
  avatar: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  tags: string;
  alternate_greetings: string;
  card_data: string;
  created_at: string;
  uuid: string;
  updated_at: string;
  is_muted?: boolean;
};

export type UserPersona = {
    id: number;
    name: string;
    avatar: string;
        description: string;
        is_default: boolean;
    };
    
    export type RegexScript = {
        id: number;
        script_name: string;
        regex: string;
        replacement: string;
        placement: string;
        run_on_markdown: boolean;
        prompt_only: boolean;
        disabled?: boolean;
        group_id?: string;
        previous_disabled_state?: boolean;
    };
        
        export type QuickReply = {
            id: number;
            label: string;
            content: string;
            icon: string;
            is_global: boolean;
        };
        
        export type Chat = {  
  id: number;
  character_id: number;
  user_persona_id: number | null;
  group_id?: number | null;
  name: string;
  created_at: string;
  uuid: string;
  updated_at: string;
  memory: string;
};

export type MessageExtra = {
  exclude_from_prompt?: boolean;
  exclude_reason?: string | null;
};

export type Message = {
  id: number;
  chat_id: number;
  role: "user" | "char" | "system" | "assistant";
  sender_id?: number | null;
  sender_name?: string | null;
  content: string;
  display_content?: string;
  timestamp: string;
  swipes?: string[];
  swipe_id?: number;
  images?: string[];
  extra?: MessageExtra;
};

export type Group = {
  id: number;
  name: string;
  avatar: string;
  scenario: string;
  activation_strategy: number; // 0=Natural, 1=List, 2=Manual
  generation_mode: number; // 0=Swap, 1=Join
  allow_self_responses: boolean;
  created_at: string;
  uuid: string;
  updated_at: string;
  is_muted?: boolean;
};

export type GroupMember = {
  group_id: number;
  character_id: number;
  sort_order: number;
  is_muted: boolean;
};

export type ChatStats = {
  message_count: number;
  user_tokens: number;
  char_tokens: number;
  total_tokens: number;
};

export type JanitorCardExtension = {
  shadow_enabled?: boolean;
  character_id?: string;
  chat_id?: string | number;
};
