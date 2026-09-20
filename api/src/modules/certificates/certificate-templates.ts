/**
 * The certificate layouts a client can choose between. Shared by the branding
 * endpoint's validation and the PDF renderer so the two cannot drift apart.
 */
export const CERTIFICATE_TEMPLATES = ['formal', 'branded', 'record'] as const;

export type CertificateTemplate = (typeof CERTIFICATE_TEMPLATES)[number];

export function isCertificateTemplate(value: string): value is CertificateTemplate {
  return (CERTIFICATE_TEMPLATES as readonly string[]).includes(value);
}
