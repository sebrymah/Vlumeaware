import Link from 'next/link';
import { ReportButton } from './report-button';
import { Quiz } from './quiz';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface TeachableMoment {
  tenant: { name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null };
  employeeName: string;
  scenario: { title: string; subjectLine: string; senderSpoofName: string; redFlags: string[] };
  assignedModule: {
    id: string;
    title: string;
    videoUrl: string;
  } | null;
  alreadyClicked: boolean;
  reportedFirst: boolean;
}

async function getMoment(token: string): Promise<TeachableMoment | null> {
  const res = await fetch(`${BASE}/track/moment/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as TeachableMoment;
}

/**
 * Public, employee-facing page reached by clicking the tracked link. It is
 * white-labeled to the client and never asks the employee for anything —
 * no login, no credentials, no data entry.
 */
export default async function TeachableMomentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const moment = await getMoment(token);

  if (!moment) {
    return (
      <Shell accent="#475569" org="Vlumeaware">
        <h1 className="text-xl font-semibold text-slate-900">This link is no longer valid</h1>
        <p className="mt-3 text-sm text-slate-600">
          If you received an email asking you to open this link, treat it as suspicious and report
          it to your IT team.
        </p>
      </Shell>
    );
  }

  const accent = moment.tenant.brandPrimaryColor ?? '#1F6F43';
  const first = moment.employeeName.split(' ')[0];

  // Someone who reported the email before clicking gets acknowledgement, not
  // a lecture.
  if (moment.reportedFirst) {
    return (
      <Shell accent={accent} org={moment.tenant.name} logo={moment.tenant.brandLogoUrl}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
          Well spotted
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          You reported this one before clicking, {first}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          This was an authorized security awareness simulation run for {moment.tenant.name}. You
          reported it correctly, which is exactly the behaviour we are trying to build. No training
          has been assigned.
        </p>
        <RedFlags flags={moment.scenario.redFlags} accent={accent} subject={moment.scenario.subjectLine} sender={moment.scenario.senderSpoofName} />
      </Shell>
    );
  }

  return (
    <Shell accent={accent} org={moment.tenant.name} logo={moment.tenant.brandLogoUrl}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
        Security awareness simulation
      </p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">
        {first}, this was a simulated phishing email
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        The message you just clicked was not real. It was sent as part of an authorized security
        awareness exercise run for {moment.tenant.name}. Nothing has been installed, no account has
        been compromised, and nothing you did has been reported to your manager as a disciplinary
        matter.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Had this been a genuine attack, clicking the link is the point at which an attacker would
        have started collecting your credentials or your company&rsquo;s payment details.
      </p>

      <RedFlags
        flags={moment.scenario.redFlags}
        accent={accent}
        subject={moment.scenario.subjectLine}
        sender={moment.scenario.senderSpoofName}
      />

      {moment.assignedModule && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Your training module</h2>
          <p className="mt-1 text-sm text-slate-600">
            You have been assigned <strong>{moment.assignedModule.title}</strong>, which covers this
            specific kind of attack. Watch it below.
          </p>
          <div className="mt-3 overflow-hidden rounded border border-slate-200 bg-black">
            <video
              controls
              preload="metadata"
              className="w-full"
              src={moment.assignedModule.videoUrl}
            >
              <a href={moment.assignedModule.videoUrl}>Open the training video</a>
            </video>
          </div>
        </div>
      )}

      <Quiz token={token} accent={accent} />

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-semibold text-slate-900">Next time you see something like this</h2>
        <p className="mt-1 text-sm text-slate-600">
          Report it without clicking. If the message asks you to change payment details, confirm by
          calling a number you already have — never one supplied in the email.
        </p>
        <div className="mt-3">
          <ReportButton token={token} accent={accent} />
        </div>
      </div>
    </Shell>
  );
}

function RedFlags({
  flags,
  accent,
  subject,
  sender,
}: {
  flags: string[];
  accent: string;
  subject: string;
  sender: string;
}) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">The email you received</h2>
      <dl className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-slate-500">From</dt>
          <dd className="text-slate-800">{sender}</dd>
        </div>
        <div className="mt-1 flex gap-2">
          <dt className="w-16 shrink-0 text-slate-500">Subject</dt>
          <dd className="text-slate-800">{subject}</dd>
        </div>
      </dl>

      {flags.length > 0 && (
        <>
          <h2 className="mt-5 text-sm font-semibold text-slate-900">What gave it away</h2>
          <ul className="mt-2 space-y-2">
            {flags.map((flag) => (
              <li key={flag} className="flex gap-2 text-sm text-slate-600">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                {flag}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Shell({
  children,
  accent,
  org,
  logo,
}: {
  children: React.ReactNode;
  accent: string;
  org: string;
  logo?: string | null;
}) {
  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto max-w-2xl px-6">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4" style={{ background: accent }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={org} className="h-7 w-auto" />
            ) : (
              <span className="text-sm font-semibold text-white">{org}</span>
            )}
          </div>
          <div className="px-6 py-7">{children}</div>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-500">
          Authorized security awareness exercise delivered by Vlumetech LTD on behalf of {org}.
        </p>
        <p className="mt-1 text-center text-[11px] text-slate-400">
          <Link href="/" className="hover:underline">
            Vlumeaware
          </Link>
        </p>
      </div>
    </div>
  );
}
