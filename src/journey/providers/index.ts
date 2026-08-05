import type { TransitProvider } from './types';
import { kmbProvider } from './kmb';
import { ctbProvider } from './ctb';
import { gmbProvider } from './gmb';
import { mtrProvider } from './mtr';

export * from './types';

export const ALL_PROVIDERS: TransitProvider[] = [
  kmbProvider,
  ctbProvider,
  gmbProvider,
  mtrProvider,
];
