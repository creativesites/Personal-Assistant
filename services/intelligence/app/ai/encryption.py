"""
AES-256-GCM encryption/decryption helper for BYOK API keys.
Compatible with Node.js crypto (crypto.createCipheriv / createDecipheriv).
"""

import base64
import hashlib
import os
import structlog
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from ..config import settings

log = structlog.get_logger()


def _candidate_keys() -> list[bytes]:
    """BYOK_ENCRYPTION_KEY first (used to encrypt); older rows were encrypted
    with a key derived from INTERNAL_API_SECRET, so decryption tries every
    candidate. Keep in sync with services/api/src/routes/byok.ts."""
    secrets = [
        os.environ.get('BYOK_ENCRYPTION_KEY'),
        os.environ.get('BYOK_LEGACY_ENCRYPTION_SECRET'),
        getattr(settings, 'internal_api_secret', None),
        os.environ.get('JWT_SECRET'),
        'zuri_default_encryption_secret_key_32bytes',
    ]
    seen: list[str] = []
    for s in secrets:
        if s and s not in seen:
            seen.append(s)
    return [hashlib.sha256(s.encode('utf-8')).digest() for s in seen]


def _get_derived_key() -> bytes:
    return _candidate_keys()[0]


def encrypt_api_key(plain_key: str) -> str:
    """
    Encrypt string using AES-256-GCM.
    Returns format: iv_hex:ciphertext_hex:tag_hex
    """
    key = _get_derived_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)  # 96-bit IV
    # cryptography library appends tag (16 bytes) at the end of ciphertext
    ciphertext_and_tag = aesgcm.encrypt(iv, plain_key.encode('utf-8'), None)
    ciphertext = ciphertext_and_tag[:-16]
    tag = ciphertext_and_tag[-16:]

    return f"{iv.hex()}:{ciphertext.hex()}:{tag.hex()}"


def decrypt_api_key(encrypted_str: str) -> str:
    """
    Decrypt AES-256-GCM string (format: iv_hex:ciphertext_hex:tag_hex or base64 fallback).
    """
    if not encrypted_str:
        return ''

    # Direct raw key fallback if user provided unencrypted string or legacy base64
    if not (':' in encrypted_str and len(encrypted_str.split(':')) == 3):
        try:
            # check if base64 fallback
            decoded = base64.b64decode(encrypted_str.encode('utf-8')).decode('utf-8')
            if decoded.startswith(('AIza', 'sk-', 'nvapi-', 'gsk_', 'or-')):
                return decoded
        except Exception:
            pass
        return encrypted_str

    try:
        iv_hex, ciphertext_hex, tag_hex = encrypted_str.split(':')
        iv = bytes.fromhex(iv_hex)
        ciphertext = bytes.fromhex(ciphertext_hex)
        tag = bytes.fromhex(tag_hex)

        for key in _candidate_keys():
            try:
                # cryptography AESGCM expects ciphertext + tag combined
                return AESGCM(key).decrypt(iv, ciphertext + tag, None).decode('utf-8')
            except Exception:
                continue
        raise ValueError('no candidate key decrypts this value')
    except Exception as exc:
        log.error('decrypt_api_key_failed', error=str(exc))
        raise ValueError('Failed to decrypt API key')
