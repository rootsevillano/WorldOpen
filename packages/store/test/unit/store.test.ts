import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { IndexedDbWorldStore, MemoryWorldStore } from '../../src';
import { worldStoreConformance } from '../conformance';

worldStoreConformance('memoria', () => new MemoryWorldStore());
// Una base de datos nueva por test.
worldStoreConformance('IndexedDB', () => new IndexedDbWorldStore('worldopen-test', new IDBFactory()));
