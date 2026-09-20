import Anthropic from '@anthropic-ai/sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider, CompletionRequest } from './ai.interface';

@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';
  private readonly client = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  get available(): boolean {
    return this.client !== null;
  }

  async complete(req: CompletionRequest): Promise<string> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'ANTHROPIC_API_KEY is not set; the AI assistant is unavailable.',
      );
    }
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    return res.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }
}
