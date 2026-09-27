import { redirect } from 'next/navigation';

/**
 * The setup guide now lives at the single, public /docs route (one canonical
 * page shared by the console and the marketing site). Old links land there.
 */
export default function GettingStartedRedirect() {
  redirect('/docs');
}
