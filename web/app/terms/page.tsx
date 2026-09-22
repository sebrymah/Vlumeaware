import Link from 'next/link';
import { LogoMark } from '@/components/logo';
import { AGREEMENT_VERSION } from '@/lib/agreement';

/**
 * The wording a client accepts at signup. The version lives in lib/agreement
 * so a page file exports only what Next allows.
 *
 * DRAFT: the operative clauses are here, but this has NOT been through legal
 * review. It must be before the product takes a paying client.
 */

export const metadata = {
  title: 'Authorization agreement and terms of use — Vlumeaware',
};

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold text-slate-900">
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-3 text-[13px] leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-[15px] font-extrabold tracking-tight text-slate-900">
        <LogoMark size={18} className="mr-1.5 inline-block align-[-3px]" />
        Vlume<span className="text-brand-600">aware</span>
      </Link>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900">
        Authorization agreement and terms of use
      </h1>
      <p className="mt-2 text-xs text-slate-500">
        Version {AGREEMENT_VERSION} · Vlumetech LTD
      </p>

      <p className="mt-6 text-[13px] leading-relaxed text-slate-600">
        This agreement governs your use of Vlumeaware and, specifically, authorises Vlumetech to
        send simulated phishing messages to your employees on your behalf. Accepting it online has
        the same effect as signing it. If your organisation requires a countersigned document
        instead, contact Vlumetech before starting a trial.
      </p>

      <Clause n="1" title="Who may accept">
        <p>
          You confirm you are authorised to bind the organisation named at signup. If you are not,
          do not accept. Authority to run security testing against staff normally sits with a
          director, or with the head of IT, security or human resources.
        </p>
      </Clause>

      <Clause n="2" title="What you are authorising">
        <p>
          You instruct Vlumetech to send simulated phishing messages to email addresses on domains
          your organisation has verified through the platform, to record how recipients respond,
          and to present training to those who interact with a simulation.
        </p>
        <p>
          Simulations are sent only to addresses on a verified domain. The platform refuses to send
          to any address outside one, so you cannot use it to target people outside your
          organisation.
        </p>
      </Clause>

      <Clause n="3" title="What is recorded, and what is not">
        <p>
          For each employee on your roster the platform holds a name, an email address and an
          optional department, together with what they did with each simulation: whether it was
          delivered, opened, clicked, reported, or a credential submission occurred.
        </p>
        <p>
          <strong>Passwords are never captured.</strong> Where a simulation presents a sign-in page,
          the platform records only that a submission event happened. The characters entered are
          discarded and are never written to storage or logs, in plain text or any other form.
        </p>
      </Clause>

      <Clause n="4" title="Your responsibilities">
        <p>
          You are the data controller for your employee data; Vlumetech processes it on your
          instruction. You are responsible for having a lawful basis for that processing under the
          data protection law that applies to you, and for telling your staff that security
          awareness testing forms part of your normal practice.
        </p>
        <p>
          You are responsible for keeping your roster accurate, for removing people who leave, and
          for arranging any mail gateway changes needed for simulations to be delivered.
        </p>
      </Clause>

      <Clause n="5" title="How results should be used">
        <p>
          Results measure an organisation, not an individual. Vlumetech provides them so you can
          direct training, and asks that you do not use an individual&rsquo;s result as grounds for
          disciplinary action. Programmes run that way suppress reporting, which is the behaviour
          the product exists to build.
        </p>
      </Clause>

      <Clause n="6" title="Approval, trials and limits">
        <p>
          A self-serve trial runs for seven days and is limited to twenty employees. You may
          configure your workspace during a trial, but live campaigns are not enabled until
          Vlumetech has reviewed and approved the account. Every phishing scenario is reviewed by
          Vlumetech before it can be sent.
        </p>
      </Clause>

      <Clause n="7" title="Withdrawal and suspension">
        <p>
          You may withdraw this authorization at any time by notifying Vlumetech, which stops
          further simulations. Vlumetech may suspend an account where it reasonably believes the
          platform is being used against people outside your organisation, or otherwise unlawfully.
        </p>
      </Clause>

      <Clause n="8" title="Record of acceptance">
        <p>
          When you accept, Vlumetech records the version of this agreement, the email address of
          the person accepting, the date and time, and the originating IP address. That record is
          visible to you in your account and is retained for the life of the account.
        </p>
      </Clause>

      <Clause n="9" title="Changes">
        <p>
          Material changes are published as a new version. Continued use after a new version is
          published does not, by itself, constitute acceptance of it; Vlumetech will ask you to
          accept a new version where one materially changes your obligations.
        </p>
      </Clause>

      <p className="mt-10 border-t border-slate-200 pt-4 text-[11px] text-slate-500">
        Questions about this agreement: IT@vlumetech.com.ng
      </p>
    </main>
  );
}
