"""
Native Claude path for AIClient, using the official Anthropic Python SDK.

Why not LiteLLM for Claude: the 5.5 models have request rules LiteLLM's
generic OpenAI-shaped translation doesn't know about — sampling params
(`temperature`) are rejected, thinking is adaptive and controlled by
`output_config.effort`, there is no JSON "response_format" mode and no
assistant prefill, refusals come back as HTTP 200 with
`stop_reason == "refusal"`, and Sonnet/Opus support server-side refusal
fallbacks. Calling the SDK directly keeps all of that correct.

The rest of AIClient speaks LiteLLM's OpenAI-shaped messages and reads
`response.choices[0].message.content` / `response.usage.prompt_tokens`,
so this module converts messages in and returns a small adapter object
with that same shape — callers and token logging need no changes.

Model selection (see AIClient._claude_model_for):
  - aliases: 'haiku' | 'sonnet' | 'opus' (or full IDs, optionally
    prefixed 'anthropic/')
  - CLAUDE_FEATURE_MODELS env JSON maps a `feature` tag to a model, e.g.
    {"advisor_chat": "sonnet", "chat_analysis": "opus"} — lets us move a
    single feature to a stronger model while evaluating prompts.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import anthropic
import structlog

from ..config import settings

log = structlog.get_logger()

CLAUDE_ALIASES: dict[str, str] = {
    'haiku': 'claude-haiku-5-5',
    'sonnet': 'claude-sonnet-5-5',
    'opus': 'claude-opus-5-5',
}

# Sonnet/Opus 5.5 support server-side refusal fallbacks ("default" routes
# by refusal category). Haiku 5.5 has no server-side fallback — a refusal
# there falls through to AIClient's own provider failover instead.
_SERVER_FALLBACK_MODELS = {'claude-sonnet-5-5', 'claude-opus-5-5'}
_SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01'

_JSON_INSTRUCTION = (
    'Respond with a single valid JSON object and nothing else — '
    'no prose before or after it, no markdown code fences.'
)


class ClaudeRefusalError(RuntimeError):
    """Claude declined the request (stop_reason == 'refusal')."""


def is_claude_model(model: str | None) -> bool:
    if not model:
        return False
    m = model.removeprefix('anthropic/')
    return m in CLAUDE_ALIASES or m.startswith('claude-')


def resolve_claude_model(model: str) -> str:
    m = model.removeprefix('anthropic/').strip()
    return CLAUDE_ALIASES.get(m, m)


def feature_model_overrides() -> dict[str, str]:
    raw = (settings.claude_feature_models or '').strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        log.warning('claude_feature_models_invalid_json')
        return {}


# ── Response adapter (LiteLLM/OpenAI-shaped) ─────────────────────────────────

@dataclass
class _Msg:
    content: str


@dataclass
class _Choice:
    message: _Msg


@dataclass
class _Usage:
    prompt_tokens: int
    completion_tokens: int

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass
class ClaudeResponse:
    model: str
    choices: list[_Choice]
    usage: _Usage
    stop_reason: str | None = None
    raw_usage: dict = field(default_factory=dict)


# ── Message conversion ───────────────────────────────────────────────────────

_DATA_URL_RE = re.compile(r'^data:(?P<mime>[\w/+.-]+);base64,(?P<data>.+)$', re.DOTALL)


def _convert_part(part) -> dict | None:
    if isinstance(part, str):
        return {'type': 'text', 'text': part} if part else None
    if not isinstance(part, dict):
        return None
    ptype = part.get('type')
    if ptype == 'text':
        text = part.get('text') or ''
        return {'type': 'text', 'text': text} if text else None
    if ptype == 'image_url':
        url = (part.get('image_url') or {}).get('url', '')
        match = _DATA_URL_RE.match(url)
        if match:
            return {
                'type': 'image',
                'source': {'type': 'base64', 'media_type': match['mime'], 'data': match['data']},
            }
        if url:
            return {'type': 'image', 'source': {'type': 'url', 'url': url}}
    return None


def _convert_content(content) -> list[dict]:
    if content is None:
        return []
    if isinstance(content, str):
        return [{'type': 'text', 'text': content}] if content else []
    blocks = [_convert_part(p) for p in content]
    return [b for b in blocks if b]


def convert_messages(messages: list[dict]) -> tuple[str, list[dict]]:
    """OpenAI-style messages → (system text, Anthropic messages).

    System messages anywhere in the list are folded into the top-level
    system prompt (the call sites only use them as the leading persona /
    instruction block). Consecutive same-role turns are merged, and the
    conversation is guaranteed to start with a user turn."""
    system_parts: list[str] = []
    out: list[dict] = []
    for msg in messages:
        role = msg.get('role')
        content = msg.get('content')
        if role == 'system':
            text = content if isinstance(content, str) else ' '.join(
                p.get('text', '') for p in (content or []) if isinstance(p, dict)
            )
            if text:
                system_parts.append(text)
            continue
        if role not in ('user', 'assistant'):
            continue
        blocks = _convert_content(content)
        if not blocks:
            continue
        if out and out[-1]['role'] == role:
            out[-1]['content'].extend(blocks)
        else:
            out.append({'role': role, 'content': blocks})

    if not out:
        # Only a system prompt was given — send it as the user turn.
        out = [{'role': 'user', 'content': [{'type': 'text', 'text': '\n\n'.join(system_parts) or '.'}]}]
        system_parts = []
    elif out[0]['role'] != 'user':
        out.insert(0, {'role': 'user', 'content': [{'type': 'text', 'text': '(conversation start)'}]})
    if out[-1]['role'] != 'user':
        # 5.5 models reject assistant prefill — the request must end on a user turn.
        out.append({'role': 'user', 'content': [{'type': 'text', 'text': 'Continue.'}]})
    return '\n\n'.join(system_parts), out


def extract_json_text(text: str) -> str:
    """Pull the JSON object out of a model reply (tolerates code fences or a
    stray sentence) so complete_json's json.loads() gets clean input."""
    stripped = text.strip()
    fence = re.match(r'^```(?:json)?\s*(.*?)\s*```$', stripped, re.DOTALL)
    if fence:
        stripped = fence.group(1).strip()
    if stripped.startswith(('{', '[')):
        return stripped
    start, end = stripped.find('{'), stripped.rfind('}')
    if start != -1 and end > start:
        return stripped[start:end + 1]
    return stripped


# ── Client ───────────────────────────────────────────────────────────────────

_clients: dict[str, anthropic.AsyncAnthropic] = {}


def _get_client(api_key: str | None = None) -> anthropic.AsyncAnthropic:
    """System key by default; a BYOK key gets its own cached client."""
    key = api_key or settings.anthropic_api_key
    client = _clients.get(key)
    if client is None:
        # One SDK retry for 429/5xx/connection errors; beyond that AIClient
        # falls over to the next provider rather than blocking the caller.
        client = anthropic.AsyncAnthropic(api_key=key, max_retries=1)
        _clients[key] = client
    return client


def claude_available() -> bool:
    return bool(settings.anthropic_api_key)


async def claude_complete(
    messages: list[dict],
    model: str,
    *,
    json_mode: bool,
    max_tokens: int,
    timeout_sec: float,
    effort: str | None = None,
    api_key: str | None = None,
) -> ClaudeResponse:
    model_id = resolve_claude_model(model)
    system_text, claude_messages = convert_messages(messages)
    if json_mode:
        system_text = f'{system_text}\n\n{_JSON_INSTRUCTION}' if system_text else _JSON_INSTRUCTION

    # Thinking is adaptive and on by default on the 5.5 models; it counts
    # toward max_tokens, so leave headroom above the caller's visible-output
    # budget (non-streaming, so stay ≤16k to avoid HTTP timeouts).
    request: dict = {
        'model': model_id,
        'max_tokens': min(max(max_tokens * 4, 4096), 16000),
        'messages': claude_messages,
        'output_config': {'effort': effort or settings.claude_effort},
        'cache_control': {'type': 'ephemeral'},  # auto-cache the stable prefix
        'timeout': timeout_sec,
    }
    if system_text:
        request['system'] = system_text

    client = _get_client(api_key)
    if model_id in _SERVER_FALLBACK_MODELS:
        response = await client.beta.messages.create(
            **request, betas=[_SERVER_FALLBACK_BETA], fallbacks='default',
        )
    else:
        response = await client.messages.create(**request)

    if response.stop_reason == 'refusal':
        category = getattr(getattr(response, 'stop_details', None), 'category', None)
        raise ClaudeRefusalError(f'{model_id} refused (category={category})')

    text = ''.join(block.text for block in response.content if getattr(block, 'type', None) == 'text')
    if response.stop_reason == 'max_tokens':
        log.warning('claude_max_tokens', model=model_id, max_tokens=request['max_tokens'])
    if json_mode:
        text = extract_json_text(text)

    usage = response.usage
    input_tokens = (
        (usage.input_tokens or 0)
        + (getattr(usage, 'cache_creation_input_tokens', 0) or 0)
        + (getattr(usage, 'cache_read_input_tokens', 0) or 0)
    )
    return ClaudeResponse(
        model=getattr(response, 'model', model_id) or model_id,
        choices=[_Choice(message=_Msg(content=text))],
        usage=_Usage(prompt_tokens=input_tokens, completion_tokens=usage.output_tokens or 0),
        stop_reason=response.stop_reason,
        raw_usage={
            'input_tokens': usage.input_tokens,
            'cache_read_input_tokens': getattr(usage, 'cache_read_input_tokens', None),
            'cache_creation_input_tokens': getattr(usage, 'cache_creation_input_tokens', None),
            'output_tokens': usage.output_tokens,
        },
    )
