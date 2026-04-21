/* ------------------------------------------------------------------ */
/*  可灵 (Kling) site strategy                                         */
/* ------------------------------------------------------------------ */

import type { SiteStrategy } from './types.js';

export const klingStrategy: SiteStrategy = {
  kind: 'kling',
  providerLabel: '可灵',
  urlMatchers: ['klingai.com', 'klingai.kuaishou.com'],
  hydrationDelayMs: 8_000,

  fileInputSelector: 'input.el-upload__input',
  promptSelectors: [
    'div.tiptap.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"].ProseMirror',
    'div.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
    '[role="textbox"]',
    'textarea[class*="prompt"]',
    'textarea[class*="input"]',
    'textarea',
    'input[type="text"][class*="prompt"]',
    'input[type="text"]',
  ],
  generateButtonSelectors: [
    'button.generic-button.critical.big',
    'button.generic-button.critical',
    'button:has-text("生成")',
    'button[class*="button-pay"]',
    'button[type="submit"]',
  ],
  disabledClassName: 'is-disabled',
  uploadApiHosts: ['klingai.com', 'api.klingai', 'ksyun.com', 'kuaishou.com'],
  generationApiHosts: ['klingai.com', 'kuaishou.com'],

  quotaProviderId: 'kling',

  pagePatterns: {
    notLoggedIn: [
      {
        anyOf: ['登录'],
        allOfAtLeastOne: ['手机号', '验证码', '扫码'],
      },
    ],
    paywall: [
      { anyOf: ['灵感值不足', '开通会员', '升级套餐', '购买灵感值'] },
    ],
    creditExhausted: [
      { anyOf: ['灵感值不足', '灵感值余额', '购买灵感值'] },
    ],
    complianceRejected: [
      {
        anyOf: [
          '内容不合规',
          '不符合社区规范',
          '内容违规',
          '违反社区',
          '审核未通过',
          'content violation',
          'violates our',
        ],
      },
    ],
  },

  loggedOutUrlFragments: ['/login', '/passport'],

  dismissPopovers: true,
  allowComplianceRetry: true,
  extractVideoUrlFromApi: true,
};
