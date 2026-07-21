import { renderDocumentPdf } from './lib/pdf/render';
import type { DocumentRow, BusinessProfileRow, ContactRow } from './lib/pdf/context';
import * as fs from 'fs/promises';

async function main() {
  console.log('Testing PDF render on backend...');
  const mockDoc: DocumentRow = {
    document_type: 'invoice',
    document_number: 'INV-123456',
    title: 'Test Invoice',
    created_at: new Date(),
    currency: 'USD',
    subtotal_cents: 10000,
    discount_cents: 1000,
    tax_cents: 1600,
    total_cents: 10600,
    structured_data: {
      items: [
        { description: 'Consulting services', quantity: 2, unitPriceCents: 5000, discountPct: 10, lineTotalCents: 9000 }
      ],
      notes: 'Test notes',
      terms: 'Test terms'
    }
  };

  const mockBusiness: BusinessProfileRow = {
    company_name: 'Antigravity Corp',
    address: '123 AI Way',
    phone: '555-0199',
    email: 'info@antigravity.corp',
    website: 'antigravity.corp',
    tax_id: 'TPIN-9999',
    theme_color: '#4F46E5',
    accent_color: '#818CF8',
    footer_text: 'Thank you!',
    payment_instructions: 'Bank transfer',
    bank_details: { bankName: 'AI Bank', accountName: 'Antigravity', accountNumber: '123456789' },
    mobile_money: null,
    logo_storage_path: null,
    signature_storage_path: null,
    stamp_storage_path: null
  };

  const mockContact: ContactRow = {
    custom_name: 'John Doe',
    display_name: 'John Doe',
    phone_number: '555-0000',
    company: 'Doe Enterprises',
    email: 'john@doe.com'
  };

  try {
    const pdfBuffer = await renderDocumentPdf(mockDoc, mockBusiness, mockContact, 'minimal');
    console.log('Render successful. Buffer length:', pdfBuffer.length);
    await fs.writeFile('test-output.pdf', pdfBuffer);
    console.log('Saved to test-output.pdf');
  } catch (err) {
    console.error('Error rendering PDF:', err);
  }
}

main();
