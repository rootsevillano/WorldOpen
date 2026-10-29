import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worldStoreConformance } from '@worldopen/store/conformance';
import { FileWorldStore } from '../../src/fileStore';

worldStoreConformance('ficheros', () => new FileWorldStore(join(mkdtempSync(join(tmpdir(), 'worldopen-')), 'worlds')));
