import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider } from './ai.interface';

/** Stands in when no provider has a key, so the failure names both options. */
@Injectable()
export class UnconfiguredAiProvider implements AiProvider {
  readonly name = 'none';
  readonly model = 'none';
  readonly available = false;

  complete(): Promise<string> {
    throw new ServiceUnavailableException(
      'The AI assistant has no provider configured. Set DEEPSEEK_API_KEY, or ANTHROPIC_API_KEY, ' +
        'and AI_PROVIDER to choose between them when both are present.',
    );
  }
}
