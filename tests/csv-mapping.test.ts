import { describe, expect, it } from 'vitest';
import { missingRequiredMappings, suggestMapping, validateImport } from '@/core/csv-mapping';
import { DEMO_CSV_HEADERS, demoCsvRows } from '@/demo/seed';

describe('suggestMapping', () => {
  it('maps a real Apollo export header set', () => {
    const mapping = suggestMapping(DEMO_CSV_HEADERS);
    expect(mapping.company_name).toBe('Company');
    expect(mapping.website).toBe('Website');
    expect(mapping.sector).toBe('Industry');
    expect(mapping.email).toBe('Email');
    expect(mapping.employee_count).toBe('# Employees');
    expect(missingRequiredMappings(mapping)).toHaveLength(0);
  });

  it('handles alternative header spellings', () => {
    const mapping = suggestMapping(['Account Name', 'Company Domain', 'Industries', 'Work Email']);
    expect(mapping.company_name).toBe('Account Name');
    expect(mapping.website).toBe('Company Domain');
    expect(mapping.sector).toBe('Industries');
  });

  it('never assigns one column to two fields', () => {
    const mapping = suggestMapping(DEMO_CSV_HEADERS);
    const used = Object.values(mapping).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it('reports which required columns are still unmapped', () => {
    const mapping = suggestMapping(['Company', 'Notes']);
    const missing = missingRequiredMappings(mapping).map((f) => f.key);
    expect(missing).toContain('website');
    expect(missing).toContain('sector');
  });
});

describe('validateImport', () => {
  const mapping = suggestMapping(DEMO_CSV_HEADERS);

  it('accepts the demo export and normalises its domains', () => {
    const result = validateImport(demoCsvRows(), mapping);
    expect(result.summary.total).toBe(demoCsvRows().length);
    expect(result.summary.errors).toBe(0);
    const marina = result.rows.find((r) => r.company_name === 'Marina Aesthetics Clinic');
    expect(marina?.normalized_domain).toBe('marinaaesthetics.ae');
    const gulf = result.rows.find((r) => r.company_name === 'Gulf Legal Partners');
    expect(gulf?.normalized_domain).toBe('gulflegalpartners.com');
  });

  it('flags a missing website but still imports the row', () => {
    const result = validateImport(
      [{ Company: 'No Site Co', Website: '', Industry: 'Retail' }],
      mapping,
    );
    expect(result.rows[0]!.issues).toContain('missing_website');
    expect(result.rows[0]!.status).toBe('needs_review');
    expect(result.summary.missing_website).toBe(1);
  });

  it('flags an invalid domain', () => {
    const result = validateImport([{ Company: 'Bad', Website: 'not a domain', Industry: 'Retail' }], mapping);
    expect(result.rows[0]!.issues).toContain('invalid_domain');
    expect(result.summary.invalid_domains).toBe(1);
  });

  it('flags a social profile used in place of a website', () => {
    const result = validateImport(
      [{ Company: 'Social', Website: 'https://facebook.com/socialco', Industry: 'Retail' }],
      mapping,
    );
    expect(result.rows[0]!.issues).toContain('social_profile_instead_of_website');
  });

  it('flags a missing sector', () => {
    const result = validateImport([{ Company: 'X', Website: 'x.com', Industry: '' }], mapping);
    expect(result.rows[0]!.issues).toContain('missing_sector');
    expect(result.summary.missing_sector).toBe(1);
  });

  it('blocks a row with no company name', () => {
    const result = validateImport([{ Company: '', Website: 'x.com', Industry: 'Retail' }], mapping);
    expect(result.rows[0]!.status).toBe('error');
    expect(result.summary.errors).toBe(1);
  });

  it('detects duplicate domains within the file, keeping the first', () => {
    const result = validateImport(
      [
        { Company: 'Acme', Website: 'https://www.acme.com/', Industry: 'Retail' },
        { Company: 'Acme Trading LLC', Website: 'acme.com', Industry: 'Retail' },
      ],
      mapping,
    );
    expect(result.rows[0]!.issues).not.toContain('duplicate_domain');
    expect(result.rows[1]!.issues).toContain('duplicate_domain');
    expect(result.rows[1]!.status).toBe('error');
    expect(result.summary.duplicates).toBe(1);
  });

  it('detects duplicates against companies already in the campaign', () => {
    const result = validateImport(
      [{ Company: 'Acme', Website: 'acme.com', Industry: 'Retail' }],
      mapping,
      ['acme.com'],
      [],
    );
    expect(result.rows[0]!.issues).toContain('duplicate_domain');
  });

  it('falls back to a name key for duplicates when no domain is present', () => {
    const result = validateImport(
      [
        { Company: 'Meridian Consulting Group', Website: '', Industry: 'Consulting' },
        { Company: 'Meridian Consulting Group Ltd', Website: '', Industry: 'Consulting' },
      ],
      mapping,
    );
    expect(result.rows[1]!.issues).toContain('duplicate_company_name');
  });

  it('flags a malformed email without blocking the row', () => {
    const result = validateImport(
      [{ Company: 'X', Website: 'x.com', Industry: 'Retail', Email: 'not-an-email' }],
      mapping,
    );
    expect(result.rows[0]!.issues).toContain('invalid_email');
    expect(result.rows[0]!.status).toBe('needs_review');
  });

  it('reads WhatsApp consent as an explicit opt-in only', () => {
    const rows: Record<string, string>[] = [
      { Company: 'A', Website: 'a.com', Industry: 'Retail', 'WhatsApp Consent': 'yes' },
      { Company: 'B', Website: 'b.com', Industry: 'Retail', 'WhatsApp Consent': 'no' },
      { Company: 'C', Website: 'c.com', Industry: 'Retail' },
    ];
    const result = validateImport(rows, mapping);
    expect(result.rows[0]!.contact.whatsapp_consent).toBe(true);
    expect(result.rows[1]!.contact.whatsapp_consent).toBe(false);
    expect(result.rows[2]!.contact.whatsapp_consent).toBe(false);
  });

  it('parses employee counts with separators and ignores junk', () => {
    const result = validateImport(
      [
        { Company: 'A', Website: 'a.com', Industry: 'Retail', '# Employees': '1,250' },
        { Company: 'B', Website: 'b.com', Industry: 'Retail', '# Employees': 'unknown' },
      ],
      mapping,
    );
    expect(result.rows[0]!.employee_count).toBe(1250);
    expect(result.rows[1]!.employee_count).toBeNull();
  });

  it('keeps row numbers stable so the UI can point at the source row', () => {
    const result = validateImport(demoCsvRows(), mapping);
    expect(result.rows.map((r) => r.row_number)).toEqual(result.rows.map((_, i) => i + 1));
  });
});
