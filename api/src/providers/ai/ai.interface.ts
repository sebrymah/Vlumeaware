export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens: number;
  /** Ask for a JSON object. Providers that can enforce it do; the caller parses defensively regardless. */
  json?: boolean;
}

/**
 * A text-completion backend for the Vlumeaware AI assistant. Kept to one
 * method so a provider is a transport detail: the prompts, the parsing and
 * the approval gate around them live in AiAssistantService and do not change
 * when the backend does.
 */
export interface AiProvider {
  /** Diagnostics only — never shown to a client. */
  readonly name: string;
  readonly model: string;
  readonly available: boolean;
  complete(req: CompletionRequest): Promise<string>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
