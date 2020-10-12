import { expectType, expectError } from 'tsd';
import * as QUnit from 'qunit';
import * as Mocha from 'mocha';
import percySnapshot from '.';

expectError(percySnapshot());

expectType<Promise<void>>(percySnapshot(QUnit.assert));
expectType<Promise<void>>(percySnapshot(typeof Mocha.Test));
expectType<Promise<void>>(percySnapshot('Snapshot name'));
expectType<Promise<void>>(percySnapshot('Snapshot name', { widths: [1000] }));

expectError(percySnapshot('Snapshot name', { foo: 'bar' }));
