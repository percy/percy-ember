interface MochaAssert {
  fullTitle(): string
}

interface SnapshotOptions {
  breakpoints?: string[];
  scope?: string;
  enableJavaScript?: boolean;
  widths?: number[];
  domTransformation?: Function;
  percyCSS?: string;
}

type SnapshotFunction = (
  name: string | Assert | MochaAssert,
  options?: SnapshotOptions
) => Promise<void>;

declare const percySnapshot: SnapshotFunction;
export default percySnapshot;

declare global {
  // If QUnit types are present, the actual contents of its
  // `Assert` interface will merge with this one to ensure
  // type safety. If they're not present, declaring this empty
  // interface gives us a placeholder we can reference.
  interface Assert {}

  const percySnapshot: SnapshotFunction;
}
