'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { phasesOf } from '@/components/readiness';
import type { Readiness } from '@/components/readiness';
import { Button, Card, Notice } from '@/components/ui';

interface Step {
  /** Console area, as it appears in the navigation. */
  where: string;
  href: string;
  title: string;
  why: string;
  do: string[];
  /** The mistake people actually make here. */
  tip?: string;
  /** Where a free-trial account differs. */
  trial?: string;
}

const STEPS: Step[] = [
  {
    where: 'Security',
    href: '/client/security',
    title: 'Secure the account',
    why: 'This console can send mail that looks like it comes from your company. Lock it down before you populate it.',
    do: [
      'Sign in at the client portal and change the password you were given.',
      'Under Security, set the password policy your team must meet and how long a session lasts.',
      'If your organisation requires it, switch on "Require multi-factor authentication", then turn MFA on for your own account with "Turn on MFA".',
      'Add a colleague as a second admin, or as a viewer if they only need to read reports. The same page manages both.',
    ],
    tip: 'Switching on "Require multi-factor authentication" applies to the console accounts you create from that point on. Anyone who already has an account is asked to enrol the next time they sign in, but is not locked out — so if you need the whole team covered immediately, say so to your Vlumetech contact and they will set it per account.',
  },
  {
    where: 'Branding',
    href: '/client/settings',
    title: 'Brand the programme',
    why: 'Your logo and colour appear on the pages your employees see after they click, and on the certificates they earn.',
    do: [
      'Upload your logo. PNG or JPEG, up to 2 MB.',
      'Set your brand colour, which is used on the landing pages and certificates.',
      'Choose a certificate template: formal, branded, or record.',
    ],
    tip: 'Do this before your first campaign. The teachable-moment page is white-labelled, and a page that does not look like your company teaches the wrong lesson.',
  },
  {
    where: 'People ▸ Domains',
    href: '/client/domains',
    title: 'Prove you own your domain',
    why: 'Simulations are domain-bound: we will only send to addresses on a domain you have proved you own, so a typo in a roster can never mail a stranger. Do this before adding employees.',
    do: [
      'Add your domain, for example acme.com.',
      'Add the TXT record we show you at the host _vlumeaware.acme.com, with the value vlumeaware-verify= followed by the token on screen.',
      'Wait for the record to publish, then verify. The check reads your live DNS.',
    ],
    tip: 'Skipping this is the single most common cause of an empty campaign. Employees on an unverified domain are not rejected loudly — they are skipped row by row, with a reason you will see in the upload result.',
  },
  {
    where: 'People ▸ Employees',
    href: '/client/employees',
    title: 'Add your people',
    why: 'The roster is who gets simulated. Only new people consume a licence seat; re-uploading the same list is safe.',
    do: [
      'Export your staff list as CSV with the columns email, name, department.',
      'Upload it. You will get a count of who was added and, for each row that was skipped, why.',
      'Add anyone who joins later the same way, or one at a time.',
    ],
    tip: 'Upload results speak plainly, and the reasons are worth reading: "invalid email address", "missing name", "acme.com is not a verified domain", "no verified domains yet — verify your domain first", "duplicate within file", or "seat limit reached (25 seats licensed)". Those last two mean your licence or your DNS, not your file.',
  },
  {
    where: 'People ▸ Sending domains',
    href: '/client/sending-domains',
    title: 'Choose how simulations are sent',
    why: 'This decides the address your simulations appear to come from. It must be a domain verified with our mail provider, or the send is rejected.',
    do: [
      'Take the shared Vlumeaware sending domain, which needs no setup from you.',
      'Or add your own, for example acme-security.com, and publish the DNS records the page shows you. Keep it separate from the domain you actually use for mail.',
      'Give each one a sender title, for example "IT Service Desk". That is the name staff see, and it is what makes the simulation realistic.',
    ],
    tip: 'Use a lookalike domain you own, not your real mail domain. Training staff to distrust your genuine address is the opposite of the point. The page also shows whether SPF, DKIM and DMARC are in place.',
  },
  {
    where: 'People ▸ Domains',
    href: '/client/domains',
    title: 'Let the simulations through your mail gateway',
    why: 'Your own filters will quarantine a simulation unless they are told not to. This step needs your IT team, and it has a lead time measured in days — start it now rather than the day you plan to launch.',
    do: [
      'Send the delivery test from the Domains page to an address inside your organisation.',
      'Open the test message from inside your mail system, which confirms the gateway let it through and marks your account as allow-listed.',
      'If it does not arrive, send your IT team the block further down this page. It lists what to allow, and the Microsoft 365 Advanced Delivery steps if you use it.',
    ],
    tip: 'A campaign will not launch until this is confirmed. That is deliberate: a simulation that never reaches the inbox produces a report that measures nothing.',
  },
  {
    where: 'Training ▸ Awareness content',
    href: '/client/content',
    title: 'Add awareness content',
    why: 'This is what plays after someone clicks. It is the difference between a gotcha and a lesson, and it is what the certificate certifies.',
    do: [
      'Upload a video with "Upload a video", or paste a link to one you already host and choose "Preview this link" to check it plays.',
      'Give it a title, a duration in seconds, and a description.',
      'Or browse the shared Vlumeaware library and use "Add to my library" to clone a module into your own.',
    ],
    tip: 'A clone refers to the same stored video, so nothing is duplicated and the share counts against nobody.',
  },
  {
    where: 'Training ▸ Quizzes',
    href: '/client/quizzes',
    title: 'Attach a quiz',
    why: 'Optional, but a quiz is what turns "I read the page" into a recorded pass and a certificate.',
    do: [
      'Author a quiz question by question, or upload one as CSV with the columns prompt, option1..optionN, correct, explanation.',
      'Attach the quiz to the awareness module it belongs to.',
    ],
    tip: 'Answers are never sent to the browser. Questions are served without the correct option, and scoring happens on the server, so the answer cannot be read from the page source.',
  },
  {
    where: 'Phishing ▸ Templates',
    href: '/client/templates',
    title: 'Pick a simulation',
    why: 'The template catalogue is ready-made and already labelled by industry, category and difficulty. It is the fastest way to something realistic.',
    do: [
      'Filter the catalogue to your industry, then use "Preview" to see the mail as a target would.',
      'Choose "Clone to my library" to take a copy. It becomes an ordinary scenario you can edit freely.',
    ],
    tip: 'Nothing you clone affects anyone else, and nothing is sent until you attach it to a campaign.',
  },
  {
    where: 'Phishing ▸ Scenarios',
    href: '/client/scenarios',
    title: 'Or write your own',
    why: 'A simulation built around a process your staff really use — an invoice, a delivery, a payroll notice — lands harder than a generic one.',
    do: [
      'Use "Generate with Vlumeaware AI" to draft one from your industry and a sentence of context, then edit it.',
      'Or build it yourself: "Compose visually" for a rich editor, or "Compose manually" for raw HTML. Use the tracking-link and employee-name placeholders so clicks are recorded.',
      'Check the live preview, then "Save to library".',
    ],
    tip: 'The preview shows exactly what will be stored, because the body is sanitized before it is ever rendered. Scripts, forms and event handlers are stripped — appearance is allowed in, behaviour is not.',
  },
  {
    where: 'Training ▸ Training routing',
    href: '/client/routing',
    title: 'Connect a click to training',
    why: 'Without a routing rule, a click is recorded and nothing else happens. This is the rule that assigns the lesson.',
    do: [
      'Pick the scenario on the left and the awareness module it should lead to.',
      'Save the rule. One rule per scenario.',
    ],
    tip: 'Do this before you launch. Adding it afterwards works, but the people who already clicked will not have been assigned anything.',
  },
  {
    where: 'Phishing ▸ Campaigns',
    href: '/client',
    title: 'Run your first campaign',
    why: 'This is the one that actually trains your people.',
    do: [
      'Create a campaign, attach the scenario, choose the sending domain and the sender title, and pick the landing page your targets will see.',
      'Work through the preflight checklist on the campaign page. It will not let you launch until every line is green: the agreement signed, employees uploaded, at least one scenario attached, a verified sending domain chosen, the tracking domain configured, and your IT allow-list confirmed. Everything except the tracking domain is yours to do — that one is set on the Vlumeaware side, so if it is the only line showing red, tell your Vlumetech contact rather than hunting for a setting.',
      'Choose "Launch", or "Schedule send" to set a date and an optional repeat. A send window spreads deliveries out instead of firing them all at once.',
      'Keep the kill switch in mind: pausing or killing a campaign stops queued mail immediately, not just future mail.',
    ],
    trial: 'On a free trial you can prepare everything, but campaigns are locked until Vlumetech approves the account and the authorization agreement is on file.',
  },
  {
    where: 'Phishing ▸ Campaigns',
    href: '/client',
    title: 'Read the results',
    why: 'The report tells you who is a risk, not just what happened.',
    do: [
      'Open the campaign for delivery, open, click and report rates, the trend over time, and a written summary.',
      'Export the campaign as CSV when someone asks for the detail.',
      'Go to Reporting ▸ Risk for a running risk score per person across every campaign, the repeat clickers, and one-click enrolment into a remediation module.',
      'Reporting ▸ Certificates lists issued certificates. Each has a serial anyone can verify.',
    ],
  },
  {
    where: 'Security',
    href: '/client/security',
    title: 'Then keep it running',
    why: 'One campaign is a test. A programme changes behaviour.',
    do: [
      'Schedule the next campaign to recur, so nobody gets one test and no follow-up.',
      'Opt in to the weekly digest if you would rather the results came to you.',
      'Watch your seat usage against your licence as you hire, under License.',
      'Check the audit log under Security if you need to know who changed what.',
    ],
  },
];

/** Plain text so it can be pasted into an email to an IT team without reflowing. */
const IT_CHECKLIST = `Vlumeaware — what our mail gateway needs to allow

We are running phishing simulations through Vlumeaware to train staff. Our
filters will quarantine these messages unless the sending infrastructure is
allow-listed. Please apply the following.

1. Allow the sending domain
   The domain shown under Sending domains in our Vlumeaware console.
   If we are using the shared Vlumeaware domain it is on the Domains page.

2. Allow the link and tracking domains
   Simulation links and open-tracking pixels are served from separate domains
   from the sending domain. All of them are listed on the Domains page in our
   console, under link / tracking domain and training / landing domain.

3. Allow the sending IP addresses
   Listed on the Domains page under "Sending IPs". Microsoft 365 in particular
   requires the sending domain AND the IP — the domain alone is not enough.

4. Microsoft 365 / Exchange Online only
   Add a phishing simulation override so Defender does not action these:
   Security portal > Email & collaboration > Policies & rules >
   Threat policies > Advanced delivery > Phishing simulation tab.
   Add the sending domain and the sending IPs there, and set the simulation
   URLs to be allowed.

5. Publish SPF, DKIM and DMARC for our sending domain
   The sending domain must be verified with our mail provider first. The
   Vlumeaware console shows whether each record is in place.

6. Confirm
   Once applied, tell us. We will send a test message to an address inside the
   organisation; opening it from inside our mail system confirms the change
   worked end to end.`;

const EMPLOYEE_SUMMARY = [
  'They receive a simulated phishing email. It looks like a plausible internal message, and it comes from a domain we use for training rather than our real one.',
  'If they click, they land on a page that looks like our sign-in. It records only that a submission happened, plus non-reversible details such as how long the fields were. We never see, store or transmit what was typed.',
  'They are then shown plainly that it was a simulation, why it worked, and the warning signs they missed.',
  'They are given the short lesson attached to that scenario, and a quiz if one is attached. Passing marks the training complete.',
  'They get a certificate they can keep. Anyone can verify it by serial.',
];

export default function GettingStartedPage() {
  return (
    <Guard allow={['client_admin', 'client_viewer']}>
      <Guide />
    </Guard>
  );
}

function Guide() {
  const tenantId = useActingTenant();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setReadiness(await api.get<Readiness>(`/tenants/${tenantId}/readiness`));
    } catch {
      // Progress is a convenience here; the guide itself must still render.
      setReadiness(null);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyItChecklist() {
    try {
      await navigator.clipboard.writeText(IT_CHECKLIST);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the text is on screen either way.
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Setting up Vlumeaware
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          Everything needed to get from an empty account to your first simulation, in the order that
          works. Steps 3 and 6 need other people — your DNS administrator and your IT team — so start
          those early.
        </p>
      </div>

      {readiness && !readiness.ready && (readiness.checks?.length ?? 0) > 0 && (
        <Card
          size="roomy"
          title={`Your progress — ${readiness.checks.length - readiness.outstanding} of ${readiness.checks.length} done`}
        >
          <div className="space-y-6">
            {phasesOf(readiness).map((phase) => {
              const outstanding = phase.checks.filter((c) => !c.ok);
              const done = phase.checks.length - outstanding.length;
              const complete = outstanding.length === 0;
              return (
                <div key={phase.key}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-slate-800">{phase.label}</span>
                    {complete ? (
                      <span className="text-sm text-emerald-600">
                        ✓ all {phase.checks.length} done
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">
                        {done} of {phase.checks.length} done
                      </span>
                    )}
                  </div>

                  {!complete && (
                    <>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{phase.blurb}</p>
                      {/* Only what is left. Listing finished items struck through
                          made a nine-line wall out of a two-item job. */}
                      <ul className="mt-4 space-y-4">
                        {outstanding.map((check) => (
                          <li key={check.key} className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-slate-300" aria-hidden>
                              ○
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">{check.label}</p>
                              {check.hint && (
                                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                                  {check.hint}
                                  {check.href && (
                                    <>
                                      {' '}
                                      <Link
                                        href={check.href}
                                        className="whitespace-nowrap font-medium text-brand-700 hover:underline"
                                      >
                                        Open
                                      </Link>
                                    </>
                                  )}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-slate-500">
            This is the same checklist that appears on your dashboard. It disappears once everything
            is green.
          </p>
        </Card>
      )}

      <Card size="roomy" title="On a free trial">
        <p className="text-sm leading-relaxed text-slate-600">
          You can do everything on this page except run a campaign, which unlocks once Vlumetech has
          approved the account and the authorization agreement is on file. Up to 20 employees while
          on trial. After 7 days, if the account is still unapproved, it becomes read-only — you can
          look, but not add or author — until it is approved.
        </p>
      </Card>

      <nav className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-semibold text-slate-700">Contents</p>
        <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <a href={`#step-${i + 1}`} className="text-slate-600 hover:text-brand-700 hover:underline">
                {i + 1}. {step.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <ol className="space-y-5">
        {STEPS.map((step, i) => (
          <li key={step.title} id={`step-${i + 1}`}>
            <Card size="roomy">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <h2 className="text-base font-semibold text-slate-900">{step.title}</h2>
                <Link href={step.href} className="ml-auto shrink-0 text-sm text-brand-700 hover:underline">
                  {step.where} →
                </Link>
              </div>

              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{step.why}</p>

              <ul className="mt-4 space-y-2.5">
                {step.do.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700">
                    <span className="text-slate-300" aria-hidden>
                      •
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              {step.tip && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-amber-900">{step.tip}</p>
                </div>
              )}

              {step.trial && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-slate-600">
                    <span className="font-medium">On a free trial: </span>
                    {step.trial}
                  </p>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ol>

      <Card size="roomy" title="What your employees will see">
        <p className="text-[15px] leading-relaxed text-slate-600">
          Worth sending round before your first campaign, so nobody feels ambushed:
        </p>
        <ul className="mt-4 space-y-2.5">
          {EMPLOYEE_SUMMARY.map((line) => (
            <li key={line} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700">
              <span className="text-slate-300" aria-hidden>
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          One thing to be plain about: we never capture a password. The simulated sign-in reports only
          that something was submitted, plus non-reversible details like field lengths. That is a
          deliberate limit, and it is why no password from a simulation can leak.
        </p>
      </Card>

      <Card size="roomy" title="For your IT team">
        <p className="text-[15px] leading-relaxed text-slate-600">
          The gateway allow-list is the one step that cannot be done from this console. Copy the block
          below and send it on — it is written to stand on its own.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" data-print-hide>
          <Button variant="ghost" onClick={copyItChecklist}>
            {copied ? 'Copied' : 'Copy for your IT team'}
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            Print this page
          </Button>
        </div>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700">
          {IT_CHECKLIST}
        </pre>
      </Card>

      <Notice kind="info">
        Still stuck? Anything that does not behave as this page describes is a bug worth reporting —
        tell your Vlumetech contact which step and what you saw.
      </Notice>
    </div>
  );
}
