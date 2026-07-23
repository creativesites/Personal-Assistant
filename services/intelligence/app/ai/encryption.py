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


def _get_derived_key() -> bytes:
    """Derive 32-byte key from internal secret or fallback to JWT secret."""
    secret = (
        getattr(settings, 'internal_api_secret', None)
        or getattr(settings, 'jwt_secret', None)
        or 'zuri_default_encryption_secret_key_32bytes'
    )
    return hashlib.sha256(secret.encode('utf-8')).digest()


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

        key = _get_derived_key()
        aesgcm = AESGCM(key)
        
        # cryptography AESGCM expects ciphertext + tag combined
        data = aesgcm.decrypt(iv, ciphertext + tag, None)
        return data.decode('utf-8')
    except Exception as exc:
        log.error('decrypt_api_key_failed', error=str(exc))
        raise ValueError('Failed to decrypt API key')
