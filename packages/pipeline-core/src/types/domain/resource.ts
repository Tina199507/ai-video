import type {
  Account as SharedAccount,
  AiResource as SharedAiResource,
  AiResourceType as SharedAiResourceType,
} from '@ai-video/shared/types.js';

export type CoreAccount = SharedAccount;
export type CoreAiResource = SharedAiResource;
export type CoreAiResourceType = SharedAiResourceType;

export type Account = CoreAccount;
export type AiResource = CoreAiResource;
export type AiResourceType = CoreAiResourceType;

export function toCoreAccount(x: SharedAccount): CoreAccount {
  return x;
}

export function toSharedAccount(x: CoreAccount): SharedAccount {
  return x;
}

export function toCoreAiResource(x: SharedAiResource): CoreAiResource {
  return x;
}

export function toSharedAiResource(x: CoreAiResource): SharedAiResource {
  return x;
}

export function toCoreAiResourceType(x: SharedAiResourceType): CoreAiResourceType {
  return x;
}

export function toSharedAiResourceType(x: CoreAiResourceType): SharedAiResourceType {
  return x;
}
