import { SnapshotOptions } from '@percy/core'

// present when qunit types are used
declare global {
  interface Assert {}
}

// present when mocha types are used
declare namespace Mocha {
  class Test {}
}

export default function percySnapshot(
  name: string | Assert | Mocha.Test,
  options?: SnapshotOptions
): Promise<void>;
