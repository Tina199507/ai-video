/* ------------------------------------------------------------------ */
/*  即梦 (Jimeng) site strategy                                        */
/* ------------------------------------------------------------------ */

import type { SiteStrategy } from './types.js';

export const jimengStrategy: SiteStrategy = {
  kind: 'jimeng',
  providerLabel: '即梦',
  urlMatchers: ['jimeng.jianying.com'],
  hydrationDelayMs: 3_000,

  fileInputSelector: 'input[type="file"]',
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
    'button[class*="submit-button"]:not([class*="collapsed"])',
    'button[class*="submit-"]',
    'button[class*="submit"]',
    'button[class*="generate"]',
    'button[type="submit"]',
  ],
  disabledClassName: 'lv-btn-disabled',
  uploadApiHosts: ['jimeng.jianying.com', 'api.jimeng', 'tos-cn-'],
  generationApiHosts: ['jimeng.jianying.com', 'tos-cn-'],

  quotaProviderId: 'seedance',

  pagePatterns: {
    notLoggedIn: [],
    paywall: [
      {
        anyOf: ['订阅即梦', '解锁更多能力', '购买积分'],
        allOfAtLeastOne: ['基础会员', '高级会员', '标准会员'],
      },
    ],
    creditExhausted: [
      { anyOf: ['积分不足', '额度不足', '次数已用完', '获取积分', '购买积分'] },
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

  loggedOutUrlFragments: ['/ai-tool/home'],

  dismissPopovers: false,
  allowComplianceRetry: false,
  extractVideoUrlFromApi: false,
};
