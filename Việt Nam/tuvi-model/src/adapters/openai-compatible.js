'use strict';

const { ModelLayerError, buildResponseJsonSchema } = require('../schema');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Checks whether a baseUrl points exclusively to the local loopback interface.
 * @param {string} baseUrl
 * @returns {boolean}
 */
function isLoopbackUrl(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Extracts `<think>...</think>` reasoning blocks and parses the JSON payload returned by an LLM.
 * @param {string} rawText
 */
function extractJsonResponse(rawText) {
  let working = String(rawText || '').trim();
  /** @type {string[]} */
  const extractedThink = [];
  working = working.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    const cleaned = String(inner).trim();
    if (cleaned) extractedThink.push(cleaned);
    return '';
  }).trim();

  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(working);
  if (fenceMatch) working = fenceMatch[1].trim();

  const firstBrace = working.indexOf('{');
  const lastBrace = working.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    working = working.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(working);
  if (
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && (!Array.isArray(parsed.reasoningSteps) || parsed.reasoningSteps.length === 0)
    && extractedThink.length > 0
  ) {
    parsed.reasoningSteps = extractedThink;
  }
  return parsed;
}

/**
 * Probes an OpenAI-compatible local endpoint (`/models`) with a short timeout to report
 * online status and loaded model IDs for the web UI without leaking data off loopback.
 *
 * @param {{
 *   baseUrl?: string,
 *   model?: string,
 *   apiKey?: string,
 *   allowRemote?: boolean,
 *   timeoutMs?: number,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
async function probeModelEndpoint(options = {}) {
  const baseUrl = (options.baseUrl || process.env.TUVI_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
  const configuredModel = options.model || process.env.TUVI_LLM_MODEL || 'qwen2.5:14b-instruct';
  const apiKey = options.apiKey ?? process.env.TUVI_LLM_API_KEY ?? '';
  const allowRemote = options.allowRemote ?? (process.env.TUVI_LLM_ALLOW_REMOTE === '1');
  const timeoutMs = options.timeoutMs ?? 1500;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  const loopback = isLoopbackUrl(baseUrl);
  if (!loopback && !allowRemote) {
    return {
      reachable: false,
      loopback: false,
      blockedRemote: true,
      baseUrl,
      configuredModel,
      availableModels: [],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/models`, {
      method: 'GET',
      redirect: 'error',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        reachable: false,
        loopback,
        baseUrl,
        configuredModel,
        httpStatus: res.status,
        availableModels: [],
      };
    }
    const body = await res.json().catch(() => ({}));
    const availableModels = Array.isArray(body?.data)
      ? body.data.map(item => item?.id).filter(id => typeof id === 'string')
      : [];
    return {
      reachable: true,
      loopback,
      baseUrl,
      configuredModel,
      modelLoaded: availableModels.length === 0 || availableModels.includes(configuredModel),
      availableModels,
    };
  } catch {
    return {
      reachable: false,
      loopback,
      baseUrl,
      configuredModel,
      availableModels: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Creates a real OpenAI-compatible chat completions adapter.
 * Defaults to local Ollama (`http://127.0.0.1:11434/v1`) and REFUSES non-loopback
 * endpoints unless `allowRemote: true` is explicitly configured.
 * Supports optional constrained decoding (`structuredOutputs: true`) via dynamic per-chart
 * `json_schema` with automatic fallback to `json_object`, and catches JSON syntax errors
 * cleanly (`parseError`) so the pipeline retry loop can self-correct!
 *
 * @param {{
 *   baseUrl?: string,
 *   model?: string,
 *   apiKey?: string,
 *   allowRemote?: boolean,
 *   timeoutMs?: number,
 *   temperature?: number,
 *   numCtx?: number,
 *   structuredOutputs?: boolean,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
function createOpenAICompatibleAdapter(options = {}) {
  const baseUrl = (options.baseUrl || process.env.TUVI_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
  const model = options.model || process.env.TUVI_LLM_MODEL || 'qwen2.5:14b-instruct';
  const apiKey = options.apiKey ?? process.env.TUVI_LLM_API_KEY ?? '';
  const allowRemote = options.allowRemote ?? (process.env.TUVI_LLM_ALLOW_REMOTE === '1');
  const timeoutMs = options.timeoutMs ?? 60_000;
  const temperature = options.temperature ?? 0.2;
  const numCtx = options.numCtx ?? (Number(process.env.TUVI_LLM_NUM_CTX) || 8192);
  const structuredOutputs = options.structuredOutputs ?? (process.env.TUVI_LLM_STRUCTURED === '1');
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  const loopback = isLoopbackUrl(baseUrl);
  if (!loopback && !allowRemote) {
    throw new ModelLayerError(
      'REMOTE_ENDPOINT_BLOCKED',
      `Chặn kết nối model từ xa (${baseUrl}) vì mặc định chỉ cho phép endpoint cục bộ (localhost/127.0.0.1). Đặt allowRemote: true hoặc TUVI_LLM_ALLOW_REMOTE=1 để bật tường minh.`,
      { baseUrl },
    );
  }

  return {
    id: `${loopback ? 'local' : 'remote'}:${model}`,
    kind: /** @type {'local' | 'remote'} */ (loopback ? 'local' : 'remote'),
    /**
     * @param {{
     *   context: any,
     *   systemPrompt: string,
     *   userPrompt: string,
     *   retryFeedback?: Array<{ code: string, path: string, message: string }>,
     *   previousRawOutput?: string,
     * }} input
     */
    async generate({ context, systemPrompt, userPrompt, retryFeedback, previousRawOutput }) {
      /** @type {Array<{ role: string, content: string }>} */
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      if (retryFeedback && retryFeedback.length > 0) {
        if (previousRawOutput) {
          messages.push({ role: 'assistant', content: previousRawOutput });
        }
        const errorLines = retryFeedback
          .map((e, i) => `${i + 1}. [${e.code}] (${e.path}): ${e.message}`)
          .join('\n');
        messages.push({
          role: 'user',
          content: [
            'Bộ kiểm định sự thật (Fact-Checking Validator) phát hiện các lỗi sau trong phản hồi trước đó:',
            errorLines,
            'Hãy sửa toàn bộ lỗi trên, khai báo đầy đủ `assertions` và `factIds` khớp chính xác ngữ cảnh, và trả lại DUY NHẤT một JSON object hợp lệ theo chuẩn `tuvi.interpretation.v0`.',
          ].join('\n'),
        });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        };
        const sendChatRequest = async responseFormat => fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          headers,
          body: JSON.stringify({
            model,
            temperature,
            response_format: responseFormat,
            ...(loopback && numCtx > 0 ? { options: { num_ctx: numCtx } } : {}),
            messages,
          }),
          signal: controller.signal,
        });

        try {
          const primaryFormat = structuredOutputs && context
            ? { type: 'json_schema', json_schema: buildResponseJsonSchema(context, context.retrievedQuotes) }
            : { type: 'json_object' };
          res = await sendChatRequest(primaryFormat);
          // Graceful fallback if the local server only supports json_object and rejects json_schema with HTTP 400
          if (!res.ok && res.status === 400 && primaryFormat.type === 'json_schema') {
            res = await sendChatRequest({ type: 'json_object' });
          }
        } catch (netErr) {
          const msg = netErr instanceof Error ? netErr.message : String(netErr);
          throw new ModelLayerError(
            'ENDPOINT_UNREACHABLE',
            `Không kết nối được tới model endpoint (${baseUrl}): ${msg}`,
            { baseUrl },
          );
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new ModelLayerError(
            'ENDPOINT_HTTP_ERROR',
            `Model endpoint trả HTTP ${res.status}: ${text.slice(0, 300)}`,
            { httpStatus: res.status },
          );
        }

        let payload;
        try {
          payload = await res.json();
        } catch (error) {
          if (!(error instanceof SyntaxError)) {
            throw new ModelLayerError('ENDPOINT_UNREACHABLE', 'Không đọc được phản hồi từ model endpoint.', { baseUrl });
          }
          return {
            response: null,
            rawOutput: '',
            parseError: 'Model endpoint trả về phản hồi HTTP không phải JSON hợp lệ.',
          };
        }
        const rawOutput = payload?.choices?.[0]?.message?.content;
        if (typeof rawOutput !== 'string' || !rawOutput.trim()) {
          return {
            response: null,
            rawOutput: String(rawOutput ?? ''),
            parseError: 'Model trả nội dung rỗng trong choices[0].message.content.',
          };
        }

        try {
          const response = extractJsonResponse(rawOutput);
          return { response, rawOutput };
        } catch (syntaxErr) {
          const msg = syntaxErr instanceof Error ? syntaxErr.message : String(syntaxErr);
          return {
            response: null,
            rawOutput,
            parseError: msg,
          };
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

module.exports = {
  isLoopbackUrl,
  extractJsonResponse,
  probeModelEndpoint,
  createOpenAICompatibleAdapter,
};
