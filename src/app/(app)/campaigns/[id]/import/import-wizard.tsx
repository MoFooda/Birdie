'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Select,
} from '@/components/ui';
import {
  CSV_FIELDS,
  IMPORT_ISSUE_LABELS,
  suggestMapping,
  type CsvMapping,
  type ImportIssue,
  type ImportValidationResult,
} from '@/core/csv-mapping';

type Stage = 'upload' | 'map' | 'review' | 'done';

export function ImportWizard({ campaignId, existingCount }: { campaignId: string; existingCount: number }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(0);

  const missingRequired = useMemo(
    () => CSV_FIELDS.filter((f) => f.required && !mapping[f.key]),
    [mapping],
  );

  function onFile(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        const parsedRows = result.data.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
        if (parsedRows.length === 0) {
          setError('That file has no data rows.');
          return;
        }
        const cols = result.meta.fields ?? Object.keys(parsedRows[0] ?? {});
        setHeaders(cols);
        setRows(parsedRows);
        setMapping(suggestMapping(cols));
        setStage('map');
      },
      error: () => setError('That file could not be parsed as CSV.'),
    });
  }

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows, mapping, commit: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Validation failed.');
        return;
      }
      setValidation(json);
      setStage('review');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows, mapping, commit: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Import failed.');
        return;
      }
      setImported(json.imported);
      setStage('done');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'done') {
    return (
      <Card>
        <CardBody>
          <p className="font-medium">Imported {imported} companies.</p>
          <p className="mt-1 text-sm text-muted">
            Rows with a blocking problem — a missing company name or a duplicate already in this campaign — were
            not imported. Everything else came in, with its issues attached and flagged for review.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => router.push(`/campaigns/${campaignId}`)}>Go to the campaign dashboard</Button>
            <Button variant="secondary" onClick={() => setStage('upload')}>
              Import another file
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {existingCount > 0 && stage === 'upload' && (
        <p className="text-sm text-muted">
          This campaign already holds {existingCount} companies. Rows matching an existing domain will be flagged
          as duplicates and skipped.
        </p>
      )}

      {stage === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>1 · Upload the CSV</CardTitle>
          </CardHeader>
          <CardBody>
            <input
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-fg hover:file:bg-brand-strong"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
              }}
            />
            <p className="hint mt-3">
              A sample export lives at <code>samples/apollo-sample.csv</code> in the repository.
            </p>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </CardBody>
        </Card>
      )}

      {stage === 'map' && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Map the columns</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-muted">
              {rows.length} rows and {headers.length} columns detected. The mapping below was guessed from the
              headers — correct anything that is wrong.
            </p>

            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {CSV_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3 py-1.5">
                  <label className="w-52 shrink-0 text-sm">
                    {field.label}
                    {field.required && <span className="ml-1 text-danger">*</span>}
                  </label>
                  <Select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [field.key]: e.target.value || undefined }))
                    }
                  >
                    <option value="">— not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <p className="mt-4 text-sm text-warning">
                Still to map: {missingRequired.map((f) => f.label).join(', ')}.
              </p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-5 flex gap-2">
              <Button onClick={preview} disabled={busy || missingRequired.length > 0}>
                {busy ? 'Validating…' : 'Validate rows'}
              </Button>
              <Button variant="secondary" onClick={() => setStage('upload')}>
                Choose a different file
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {stage === 'review' && validation && (
        <Card>
          <CardHeader>
            <CardTitle>3 · Review before importing</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Total rows" value={validation.summary.total} />
              <Stat label="Valid" value={validation.summary.valid} tone="success" />
              <Stat label="Needs review" value={validation.summary.needs_review} tone="warning" />
              <Stat label="Blocked" value={validation.summary.errors} tone="danger" />
              <Stat label="Missing website" value={validation.summary.missing_website} />
              <Stat label="Duplicates" value={validation.summary.duplicates} />
              <Stat label="Invalid domains" value={validation.summary.invalid_domains} />
            </div>

            <div className="table-wrap max-h-96 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Domain</th>
                    <th className="px-3 py-2">Sector</th>
                    <th className="px-3 py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.rows.map((row) => (
                    <tr key={row.row_number} className="border-t">
                      <td className="px-3 py-2 text-muted">{row.row_number}</td>
                      <td className="px-3 py-2 font-medium">{row.company_name || <em className="text-danger">missing</em>}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.normalized_domain ?? '—'}</td>
                      <td className="px-3 py-2">{row.sector ?? '—'}</td>
                      <td className="px-3 py-2">
                        {row.issues.length === 0 ? (
                          <Badge tone="success">valid</Badge>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {row.issues.map((i) => (
                              <Badge key={i} tone={row.status === 'error' ? 'danger' : 'warning'}>
                                {IMPORT_ISSUE_LABELS[i as ImportIssue] ?? i}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-sm text-muted">
              Rows marked <strong>blocked</strong> will not be imported. Rows marked <strong>needs review</strong>{' '}
              will be — a company with no website is often the strongest opportunity in the list — and carry their
              issues into the report.
            </p>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-5 flex gap-2">
              <Button onClick={commit} disabled={busy}>
                {busy ? 'Importing…' : `Import ${validation.summary.total - validation.summary.errors} companies`}
              </Button>
              <Button variant="secondary" onClick={() => setStage('map')}>
                Back to mapping
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-fg';
  return (
    <div className="rounded border bg-surface-2/40 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
