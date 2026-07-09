"""
One-off smoke test for the dashscope/ LiteLLM provider — run manually with a
real DASHSCOPE_API_KEY before trusting the Qwen router in production.
There's an open LiteLLM issue (BerriAI/litellm#12505) about this provider
resolution failing on some versions, so don't assume it works untested.

Usage:
    DASHSCOPE_API_KEY=sk-... python -m scripts.smoke_test_dashscope
"""

import asyncio
import os
import sys

import litellm

from app.ai.model_router import POOLS


async def _test_model(model: str) -> None:
    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{'role': 'user', 'content': 'Reply with the single word: ok'}],
            max_tokens=10,
        )
        text = response.choices[0].message.content
        print(f'OK    {model}  ->  {text!r}')
    except Exception as exc:
        print(f'FAIL  {model}  ->  {exc}')


async def main() -> None:
    if not os.environ.get('DASHSCOPE_API_KEY'):
        print('Set DASHSCOPE_API_KEY before running this script.')
        sys.exit(1)

    # Test one model per pool — enough to confirm the dashscope/ provider
    # resolves correctly, not an exhaustive check of every model.
    for pool, models in POOLS.items():
        await _test_model(models[0])


if __name__ == '__main__':
    asyncio.run(main())
