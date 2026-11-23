import { type OverrideThreshold } from './types';

export function formatOverrideTargetLabel(item: OverrideThreshold): string {
  if (item.scope === 'PRODUCT' && item.target.code) {
    return `${item.target.code} — ${item.target.name}`;
  }
  return item.target.name;
}
