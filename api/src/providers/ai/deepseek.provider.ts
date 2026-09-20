import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider, CompletionRequest } from './ai.interface';

/**
 * DeepSeek via its OpenAI-compatible chat-completions API — plain fetch, no
 * SDK, matching how ResendMailer talks to Resend.
 *
 * Worth knowing what leaves the country with each call: scenario prompts carry
 * the client's industry and whatever free-text context the admin typed, and
 * report prompts carry the client's name and campaign results. DeepSeek
 * processes these on its own infrastructure. That is a data-residency question
 * for a platform that sells NDPA awareness, and it is the operator's to answer
 * before pointing a client tenant at this provider.
 */
@Injectable()
export class DeepseekProvider implements AiProvider {
  readonly name = 'deepseek';
  readonly model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  private readonly apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  private readonly baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(
    /\/+$/,
    '',
  );

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: CompletionRequest): Promise<string> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'DEEPSEEK_API_KEY is not set; the AI assistant is unavailable.',
      );
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        // DeepSeek's JSON mode requires the word "json" in the prompt, which
        // the scenario prompt already has.
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `DeepSeek rejected the request (${res.status}): ${detail.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new ServiceUnavailableException('DeepSeek returned an empty completion.');
    }
    return text;
  }
}
