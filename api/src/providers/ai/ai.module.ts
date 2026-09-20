import { Module } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { AI_PROVIDER } from './ai.interface';
import type { AiProvider } from './ai.interface';
import { AnthropicProvider } from './anthropic.provider';
import { DeepseekProvider } from './deepseek.provider';
import { UnconfiguredAiProvider } from './unconfigured.provider';

/**
 * AI_PROVIDER names the backend explicitly; with it unset, whichever key is
 * present is used. Neither key means an assistant that fails with a message
 * naming both, rather than one that silently does nothing.
 */
function selectProvider(): AiProvider {
  switch ((process.env.AI_PROVIDER ?? '').toLowerCase()) {
    case 'deepseek':
      return new DeepseekProvider();
    case 'anthropic':
      return new AnthropicProvider();
    default:
      if (process.env.DEEPSEEK_API_KEY) return new DeepseekProvider();
      if (process.env.ANTHROPIC_API_KEY) return new AnthropicProvider();
      return new UnconfiguredAiProvider();
  }
}

@Module({
  providers: [{ provide: AI_PROVIDER, useFactory: selectProvider }, AiAssistantService],
  exports: [AiAssistantService],
})
export class AiModule {}
