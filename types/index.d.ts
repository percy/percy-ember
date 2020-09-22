import { SnapshotOptions } from '@percy/core';

export default function percySnapshot(
  name: string,
  options?: SnapshotOptions
) => Promise<void>;

declare global {
  const percySnapshot: percySnapshot;
}
