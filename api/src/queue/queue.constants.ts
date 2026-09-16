export const SEND_QUEUE = 'vlumeaware-send';
export const SCHEDULER_QUEUE = 'vlumeaware-scheduler';
export const DIGEST_QUEUE = 'vlumeaware-digest';

export interface SendJob {
  sendId: string;
  tenantId: string;
  campaignId: string;
}
