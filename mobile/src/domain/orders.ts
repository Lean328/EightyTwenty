import type { OrderStatus } from '@/types';

/** Customer-visible progress stages on the live status screen. */
export const ORDER_STAGES = ['Received', 'Confirmed', 'Preparing', 'Ready'] as const;

const STAGE_INDEX: Record<OrderStatus, number> = {
  received: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  completed: 4,
  declined: -1,
};

/** 0…4 (4 = completed / "Enjoy."), −1 when declined. */
export function stageIndex(status: OrderStatus): number {
  return STAGE_INDEX[status];
}

export function isLiveStatus(status: OrderStatus): boolean {
  return status !== 'completed' && status !== 'declined';
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  declined: 'Not accepted',
};
