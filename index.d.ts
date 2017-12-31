
interface QUnitAssert {
  test: {
    testName: string;
    module: {
      name: string;
    }
  }
}

interface MochaAssert {
  fullTitle(): string
}

interface SnapshotOptions {
  breakpoints?: string[];
  scope?: string;
  enableJavaScript?: boolean;
  widths?: string[];
}

type SnapshotFunction = (
  name: string | QUnitAssert | MochaAssert,
  options?: SnapshotOptions
) => Promise<void>;

export const percySnapshot: SnapshotFunction;

declare global {
  const percySnapshot: SnapshotFunction;
}
