"""LLM-powered cross-folder insight synthesis."""

import json
import os
import time
from datetime import datetime

import requests


# ---------------------------------------------------------------------------
# Provider abstraction
# ---------------------------------------------------------------------------

def _call_ollama(endpoint, model, messages, timeout):
    """Call Ollama via native /api/chat endpoint."""
    url = f'{endpoint.rstrip("/")}/api/chat'
    payload = {
        'model': model,
        'messages': messages,
        'stream': False,
        'think': False,
        'options': {
            'temperature': 0.3,
        },
    }
    resp = requests.post(url, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data['message']['content']


def _call_anthropic(api_key, model, messages, timeout):
    """Call Anthropic Messages API."""
    url = 'https://api.anthropic.com/v1/messages'
    # Separate system message from user messages
    system_text = ''
    user_messages = []
    for m in messages:
        if m['role'] == 'system':
            system_text = m['content']
        else:
            user_messages.append(m)

    payload = {
        'model': model,
        'max_tokens': 4096,
        'messages': user_messages,
    }
    if system_text:
        payload['system'] = system_text

    headers = {
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data['content'][0]['text']


def _call_openai(api_key, model, messages, timeout):
    """Call OpenAI chat completions API."""
    url = 'https://api.openai.com/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    payload = {
        'model': model,
        'messages': messages,
        'temperature': 0.3,
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data['choices'][0]['message']['content']


def call_llm(settings, messages):
    """Dispatch to the configured LLM provider."""
    llm = settings.get('llm', {})
    provider = llm.get('provider', 'ollama')
    timeout = llm.get('timeout', 180)

    if provider == 'ollama':
        return _call_ollama(
            llm.get('ollama_endpoint', 'http://localhost:11434'),
            llm.get('ollama_model', 'qwen3.5:35b'),
            messages, timeout
        )
    elif provider == 'anthropic':
        return _call_anthropic(
            llm.get('anthropic_api_key', ''),
            llm.get('anthropic_model', 'claude-sonnet-4-20250514'),
            messages, timeout
        )
    elif provider == 'openai':
        return _call_openai(
            llm.get('openai_api_key', ''),
            llm.get('openai_model', 'gpt-4o'),
            messages, timeout
        )
    else:
        raise ValueError(f'Unknown LLM provider: {provider}')


def test_connection(settings):
    """Quick ping to verify the LLM endpoint is reachable."""
    llm = settings.get('llm', {})
    provider = llm.get('provider', 'ollama')

    try:
        if provider == 'ollama':
            endpoint = llm.get('ollama_endpoint', 'http://localhost:11434')
            resp = requests.get(f'{endpoint.rstrip("/")}/api/tags', timeout=10)
            resp.raise_for_status()
            models = [m['name'] for m in resp.json().get('models', [])]
            target = llm.get('ollama_model', '')
            available = any(target in m for m in models)
            return {
                'ok': True,
                'provider': 'ollama',
                'endpoint': endpoint,
                'models': models[:10],
                'model_available': available,
            }
        elif provider == 'anthropic':
            # Simple test: send a minimal message
            result = _call_anthropic(
                llm.get('anthropic_api_key', ''),
                llm.get('anthropic_model', 'claude-sonnet-4-20250514'),
                [{'role': 'user', 'content': 'Say "ok"'}],
                timeout=15,
            )
            return {'ok': True, 'provider': 'anthropic', 'response': result[:50]}
        elif provider == 'openai':
            result = _call_openai(
                llm.get('openai_api_key', ''),
                llm.get('openai_model', 'gpt-4o'),
                [{'role': 'user', 'content': 'Say "ok"'}],
                timeout=15,
            )
            return {'ok': True, 'provider': 'openai', 'response': result[:50]}
        else:
            return {'ok': False, 'error': f'Unknown provider: {provider}'}
    except Exception as e:
        return {'ok': False, 'provider': provider, 'error': str(e)}


# ---------------------------------------------------------------------------
# Synthesis logic
# ---------------------------------------------------------------------------

def build_synthesis_prompt(insights):
    """Create messages for the synthesis LLM call."""
    system = (
        'You are a knowledge analyst. Your task is to find cross-cutting patterns '
        'across a collection of insights from different projects and contexts. '
        'Identify recurring themes, emerging trends, and meta-level observations. '
        'Respond in the same language as the input data. '
        'Output valid JSON with this structure: '
        '{"patterns": [{"title": "...", "description": "...", "supporting_insights": [<ids>], "tags": [...]}], '
        '"trends": ["..."], "meta_analysis": "..."}'
    )

    insight_data = []
    for i in insights:
        entry = {
            'id': i.get('id'),
            'type': i.get('type'),
            'summary': i.get('summary'),
            'rationale': i.get('rationale', ''),
            'tags': i.get('tags', []),
            'context': i.get('context', i.get('project', '')),
            'date': i.get('date', ''),
        }
        insight_data.append(entry)

    user = (
        f'Analyze these {len(insight_data)} insights and find cross-cutting patterns:\n\n'
        + json.dumps(insight_data, ensure_ascii=False, indent=2)
    )

    return [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': user},
    ]


def _extract_json(text):
    """Extract JSON from LLM response (may be wrapped in markdown code blocks)."""
    # Try direct parse first
    text = text.strip()
    if text.startswith('{'):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Try extracting from code block
    import re
    m = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try finding first { to last }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    return None


def run_synthesis(settings, insights, filters=None):
    """Run a synthesis on the given insights. Returns structured result."""
    if not insights:
        raise ValueError('No insights to analyze')

    messages = build_synthesis_prompt(insights)
    llm = settings.get('llm', {})

    start = time.time()
    raw_response = call_llm(settings, messages)
    duration = time.time() - start

    parsed = _extract_json(raw_response)
    if parsed is None:
        parsed = {
            'patterns': [],
            'trends': [],
            'meta_analysis': raw_response,
        }

    now = datetime.now()
    result = {
        'id': now.strftime('%y%m%d-%H%M%S'),
        'timestamp': now.isoformat(timespec='seconds'),
        'provider': llm.get('provider', 'ollama'),
        'model': _get_model_name(llm),
        'filters': filters or {},
        'input_count': len(insights),
        'patterns': parsed.get('patterns', []),
        'trends': parsed.get('trends', []),
        'meta_analysis': parsed.get('meta_analysis', ''),
        'duration_seconds': round(duration, 1),
        'raw_response': raw_response,
    }

    return result


def _get_model_name(llm):
    """Get the active model name from LLM config."""
    provider = llm.get('provider', 'ollama')
    if provider == 'ollama':
        return llm.get('ollama_model', 'unknown')
    elif provider == 'anthropic':
        return llm.get('anthropic_model', 'unknown')
    elif provider == 'openai':
        return llm.get('openai_model', 'unknown')
    return 'unknown'


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def save_synthesis(result, data_dir):
    """Save synthesis result as JSON file."""
    os.makedirs(data_dir, exist_ok=True)
    filename = f'{result["id"]}.json'
    filepath = os.path.join(data_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return filepath


def load_syntheses(data_dir):
    """List all saved syntheses, newest first."""
    if not os.path.isdir(data_dir):
        return []

    results = []
    for fname in os.listdir(data_dir):
        if not fname.endswith('.json'):
            continue
        filepath = os.path.join(data_dir, fname)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            results.append({
                'id': data.get('id', fname[:-5]),
                'timestamp': data.get('timestamp', ''),
                'provider': data.get('provider', ''),
                'model': data.get('model', ''),
                'input_count': data.get('input_count', 0),
                'pattern_count': len(data.get('patterns', [])),
                'duration_seconds': data.get('duration_seconds', 0),
                'filters': data.get('filters', {}),
            })
        except (json.JSONDecodeError, OSError):
            continue

    results.sort(key=lambda r: r['timestamp'], reverse=True)
    return results


def load_synthesis(synthesis_id, data_dir):
    """Load a single synthesis by ID."""
    filepath = os.path.join(data_dir, f'{synthesis_id}.json')
    if not os.path.isfile(filepath):
        return None
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)
