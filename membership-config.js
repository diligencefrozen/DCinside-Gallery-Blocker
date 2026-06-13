/*
 * DCinside Gallery Blocker membership configuration.
 *
 * ExtensionPay ID confirmed from dashboard:
 *   const extpay = ExtPay('dcinsidegalleryblocker')
 *
 * MVP policy:
 * - No paid feature is locked yet.
 * - The visible membership flow starts a free trial, not payment.
 * - Paid/admin/trial users only see a welcome message in popup/options.
 */
self.DCB_MEMBERSHIP_CONFIG = {
  extensionPayId: "dcinsidegalleryblocker",

  // Optional admin bypass by ExtensionPay email hash.

  adminEmailSha256: [
    "2147f008c848f0189e557bb1fb006efd9ab60cf197abf18318b2086295a7d261"
  ],

  // Free-trial MVP settings.
  trialDays: 30,
  trialDisplayText: "30-day Pro preview",

  paidWelcomeTitle: "🌟 Pro 멤버십 활성화 완료",
  paidWelcomeMessage: "유료 멤버십이 확인되었습니다. 앞으로 Pro 전용 기능을 이 계정에 먼저 제공할 수 있습니다.",

  trialWelcomeTitle: "🎁 무료체험 등록 완료",
  trialWelcomeMessage: "이메일 등록이 완료되었습니다. 현재 기능들은 계속 무료로 제공됩니다. 향후 Pro 기능 출시 시 이 계정으로 멤버십 상태를 연결할 수 있습니다.",

  adminWelcomeTitle: "🛡️ 관리자 멤버십 활성화 완료",
  adminWelcomeMessage: "관리자 계정으로 확인되었습니다. 결제 없이 Pro/무료체험 전용 안내를 확인할 수 있습니다.",

  freeNoticeTitle: "🎁 Pro 기능 사전 체험 등록",
  freeNoticeMessage: "무료체험을 시작하면 이메일이 ExtensionPay에 등록됩니다. 지금 결제는 받지않으며, 현재 기능들은 계속 무료로 제공됩니다.",

  trialExpiredTitle: "🧩 무료체험 기록 확인됨",
  trialExpiredMessage: "무료체험 기록이 확인되었습니다. 현재 기능들은 계속 무료로 제공되며, 향후 Pro 기능 출시 시 결제 안내를 별도로 표시할 수 있습니다."
};
