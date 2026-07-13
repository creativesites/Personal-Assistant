import base64
import mimetypes
import os
from pathlib import Path

import structlog
from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.async_api import async_playwright

from ..config import settings

log = structlog.get_logger()

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / 'templates' / 'documents'

_jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(['html']),
)

CURRENCY_SYMBOLS = {'ZMW': 'K', 'USD': '$', 'GBP': '£', 'EUR': '€', 'KES': 'KSh', 'BWP': 'P', 'NAD': 'N$'}


def format_money(cents: int, currency: str) -> str:
    symbol = CURRENCY_SYMBOLS.get(currency, currency + ' ')
    return f'{symbol}{cents / 100:,.2f}'


def _file_to_data_uri(storage_path: str | None) -> str | None:
    if not storage_path or not os.path.isfile(storage_path):
        return None
    mime_type = mimetypes.guess_type(storage_path)[0] or 'image/png'
    with open(storage_path, 'rb') as f:
        encoded = base64.b64encode(f.read()).decode('ascii')
    return f'data:{mime_type};base64,{encoded}'


def build_business_context(business_profile: dict) -> dict:
    """Maps a business_profiles DB row into the template context shape."""
    bank = business_profile.get('bank_details') or {}
    mobile_money = business_profile.get('mobile_money') or {}
    bank_line = ', '.join(
        v for v in (bank.get('bankName'), bank.get('accountName'), bank.get('accountNumber')) if v
    )
    mobile_money_line = ', '.join(v for v in (mobile_money.get('provider'), mobile_money.get('number')) if v)
    return {
        'companyName': business_profile.get('company_name'),
        'address': business_profile.get('address'),
        'phone': business_profile.get('phone'),
        'email': business_profile.get('email'),
        'website': business_profile.get('website'),
        'taxId': business_profile.get('tax_id'),
        'themeColor': business_profile.get('theme_color') or '#4F46E5',
        'accentColor': business_profile.get('accent_color') or '#818CF8',
        'footerText': business_profile.get('footer_text'),
        'paymentInstructions': business_profile.get('payment_instructions'),
        'bankDetails': bank_line or None,
        'mobileMoney': mobile_money_line or None,
        'logoDataUri': _file_to_data_uri(business_profile.get('logo_storage_path')),
        'signatureDataUri': _file_to_data_uri(business_profile.get('signature_storage_path')),
        'stampDataUri': _file_to_data_uri(business_profile.get('stamp_storage_path')),
    }


def build_document_context(document: dict, contact: dict | None) -> tuple[dict, dict]:
    """Maps a documents DB row (+ optional contact row) into template context."""
    currency = document['currency']
    structured = document.get('structured_data') or {}
    items = structured.get('items') or []

    has_discounts = any((item.get('discountPct') or 0) > 0 for item in items)
    rendered_items = []
    for item in items:
        discount_pct = item.get('discountPct') or 0
        rendered_items.append({
            'description': item.get('description', ''),
            'quantity': item.get('quantity', 1),
            'unitPrice': format_money(item.get('unitPriceCents', 0), currency),
            'discountLabel': f'{discount_pct:.0f}%' if discount_pct else '—',
            'lineTotal': format_money(item.get('lineTotalCents', 0), currency),
        })

    document_context = {
        'documentType': document['document_type'],
        'documentNumber': document['document_number'],
        'title': document['title'],
        'issueDate': document['created_at'].strftime('%d %b %Y'),
        'validUntil': structured.get('validUntil'),
        'dueDate': structured.get('dueDate'),
        'items': rendered_items,
        'hasDiscounts': has_discounts,
        'subtotal': format_money(document['subtotal_cents'], currency),
        'discount': format_money(document['discount_cents'], currency) if document['discount_cents'] else None,
        'tax': format_money(document['tax_cents'], currency) if document['tax_cents'] else None,
        'total': format_money(document['total_cents'], currency),
        'notes': structured.get('notes'),
        'terms': structured.get('terms'),
    }

    contact_name = 'Contact'
    contact_context = {'name': contact_name, 'company': None, 'email': None, 'phone': None}
    if contact:
        contact_context = {
            'name': contact.get('custom_name') or contact.get('display_name') or contact.get('phone_number') or 'Contact',
            'company': contact.get('company'),
            'email': contact.get('email'),
            'phone': contact.get('phone_number'),
        }

    return document_context, contact_context


async def render_document_pdf(document: dict, business_profile: dict, contact: dict | None, layout_key: str) -> bytes:
    """Renders a documents row to PDF bytes via Jinja2 + headless Chromium.

    AI/business logic never touches layout — everything visual lives in the
    Jinja2 template named by layout_key. See docs/BUSINESS_WORKSPACE_PLAN.md §4.
    """
    template_name = f'{layout_key}.html'
    if not (TEMPLATES_DIR / template_name).is_file():
        log.warning('document_template_missing', layout_key=layout_key)
        template_name = 'minimal.html'

    document_context, contact_context = build_document_context(document, contact)
    business_context = build_business_context(business_profile)

    template = _jinja_env.get_template(template_name)
    html = template.render(document=document_context, business=business_context, contact=contact_context)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until='load')
            pdf_bytes = await page.pdf(format='A4', print_background=True)
        finally:
            await browser.close()

    return pdf_bytes


def storage_path_for(user_id: str, document_id: str) -> str:
    directory = os.path.join(settings.doc_storage_dir, user_id)
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f'{document_id}.pdf')
