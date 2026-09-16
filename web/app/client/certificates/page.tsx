'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Button, Card, Notice, Table } from '@/components/ui';

interface Certificate {
  id: string;
  serial: string;
  moduleTitle: string;
  quizTitle: string | null;
  scorePct: number;
  issuedAt: string;
  employee: { name: string; email: string; department: string | null };
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function CertificatesPage() {
  return (
    <Guard allow={['client_admin', 'client_viewer']}>
      <Certificates />
    </Guard>
  );
}

function Certificates() {
  const tenantId = useActingTenant();
  const [rows, setRows] = useState<Certificate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setRows(await api.get<Certificate[]>(`/tenants/${tenantId}/certificates`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(cert: Certificate) {
    // Authenticated fetch → blob → open, since the PDF route needs the bearer token.
    const token = JSON.parse(localStorage.getItem('vlumeaware.session') ?? '{}').accessToken;
    const res = await fetch(`${BASE}/tenants/${tenantId}/certificates/${cert.id}/pdf`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Certificates</h1>
        <p className="mt-1 text-xs text-slate-500">
          Issued automatically when an employee passes a module quiz. Useful as completion evidence
          for NDPA / ISO audits. Each carries a serial that verifies at /verify/&lt;serial&gt;.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <Card title="Issued certificates">
        <Table head={['Employee', 'Module', 'Score', 'Serial', 'Issued', '']}>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{c.employee.name}</td>
              <td className="px-2 py-2">{c.moduleTitle}</td>
              <td className="px-2 py-2">{c.scorePct}%</td>
              <td className="px-2 py-2 font-mono text-[11px] text-slate-500">{c.serial}</td>
              <td className="px-2 py-2 text-slate-500">{new Date(c.issuedAt).toLocaleDateString()}</td>
              <td className="px-2 py-2 text-right">
                <Button variant="ghost" onClick={() => download(c)}>
                  PDF
                </Button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                No certificates issued yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
