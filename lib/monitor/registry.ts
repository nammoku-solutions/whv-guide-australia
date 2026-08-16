/**
 * 公式情報源の allow-list（監視対象）。
 *
 * ここに載っている URL だけを監視・ニュース化する。ブログ・SNS・Reddit・ニュース
 * アグリゲータ・移民エージェントのブログ・任意のサイトは対象外。政府ドメイン全体を
 * クロールせず、意味のある公表ページ単位で対象を絞る。
 *
 * URL はできる限りリポジトリ内の記事（lib/content/articles/*）で実際に引用済みの
 * 公式一次情報を採用している。追加・変更はこのファイルのレビューで管理する。
 * 可変な監視状態（last_checked / content_hash 等）は DB（monitor_source_state）に持つ。
 */

import type { SourceDefinition } from "./types";

export const officialSources: SourceDefinition[] = [
  // ===== Department of Home Affairs（移民・ビザ） =====
  {
    sourceId: "homeaffairs-whv-417",
    organisation: "Department of Home Affairs",
    sourceName: "Working Holiday visa (subclass 417)",
    url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417",
    category: "visa",
    changeGroup: "visa",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["visa", "preparation", "second-visa"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "homeaffairs-whv-462",
    organisation: "Department of Home Affairs",
    sourceName: "Work and Holiday visa (subclass 462)",
    url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-462",
    category: "visa",
    changeGroup: "visa",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["visa", "preparation", "second-visa"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "homeaffairs-specified-work",
    organisation: "Department of Home Affairs",
    sourceName: "Specified work (subclass 417)",
    url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work",
    category: "visa",
    changeGroup: "visa",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["visa", "second-visa", "farm", "area"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "homeaffairs-visa-pricing",
    organisation: "Department of Home Affairs",
    sourceName: "Visa pricing estimator",
    url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing",
    category: "cost",
    changeGroup: "visa",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["visa", "preparation", "money"],
    autoPublishEligibility: true,
  },
  {
    sourceId: "homeaffairs-english-language",
    organisation: "Department of Home Affairs",
    sourceName: "English language visa requirements",
    url: "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language",
    category: "visa",
    changeGroup: "visa",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["visa", "english", "preparation"],
    autoPublishEligibility: false,
  },

  // ===== Australian Taxation Office（税・Super） =====
  {
    sourceId: "ato-whm-tax-rates",
    organisation: "Australian Taxation Office",
    sourceName: "Tax rates – working holiday makers",
    url: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers",
    category: "tax",
    changeGroup: "tax",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["tax-return", "money", "jobs"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "ato-tfn",
    organisation: "Australian Taxation Office",
    sourceName: "Tax file number",
    url: "https://www.ato.gov.au/individuals-and-families/tax-file-number",
    category: "tax",
    changeGroup: "tax",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["tfn", "arrival", "tax-return"],
    autoPublishEligibility: true,
  },
  {
    sourceId: "ato-dasp",
    organisation: "Australian Taxation Office",
    sourceName: "Departing Australia superannuation payment (DASP)",
    url: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/withdrawing-and-using-your-super/departing-australia-superannuation-payment-dasp",
    category: "tax",
    changeGroup: "super",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["super", "return-home", "tax-return"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "ato-gig-economy",
    organisation: "Australian Taxation Office",
    sourceName: "Gig economy and tax",
    url: "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/in-detail/income/gig-economy-and-tax",
    category: "tax",
    changeGroup: "tax",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["gig-work", "abn", "tax-return"],
    autoPublishEligibility: true,
  },

  // ===== Fair Work Ombudsman（労働条件・最低賃金） =====
  {
    sourceId: "fairwork-minimum-wages",
    organisation: "Fair Work Ombudsman",
    sourceName: "Minimum wages",
    url: "https://www.fairwork.gov.au/pay-and-wages/minimum-wages",
    category: "cost",
    changeGroup: "work",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["jobs", "money", "farm", "gig-work"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "fairwork-visa-holders",
    organisation: "Fair Work Ombudsman",
    sourceName: "Visa holders and migrants",
    url: "https://www.fairwork.gov.au/find-help-for/visa-holders-migrants",
    category: "other",
    changeGroup: "work",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["jobs", "community", "farm"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "fairwork-public-holidays",
    organisation: "Fair Work Ombudsman",
    sourceName: "Public holidays",
    url: "https://www.fairwork.gov.au/employment-conditions/public-holidays",
    category: "other",
    changeGroup: "work",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["jobs", "travel"],
    autoPublishEligibility: true,
  },

  // ===== Services Australia（Medicare / 相互医療） =====
  {
    sourceId: "servicesaustralia-rhca",
    organisation: "Services Australia",
    sourceName: "Reciprocal Health Care Agreements",
    url: "https://www.servicesaustralia.gov.au/reciprocal-health-care-agreements",
    category: "other",
    changeGroup: "other",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["health", "arrival"],
    autoPublishEligibility: false,
  },
  {
    sourceId: "servicesaustralia-medicare",
    organisation: "Services Australia",
    sourceName: "Medicare",
    url: "https://www.servicesaustralia.gov.au/medicare",
    category: "other",
    changeGroup: "other",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["health"],
    autoPublishEligibility: true,
  },

  // ===== 州・準州（運転免許 / 登録 / 賃貸 Bond / 車検） =====
  // 代表的な公式ページを対象に含める。数は絞り、必要に応じてレビューで追加する。
  {
    sourceId: "servicensw-licence",
    organisation: "Service NSW",
    sourceName: "Driver licences",
    url: "https://www.service.nsw.gov.au/services/driving-and-transport/driver-licences",
    category: "other",
    changeGroup: "cars",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["license", "cars", "transport"],
    autoPublishEligibility: true,
  },
  {
    sourceId: "vicroads-registration",
    organisation: "VicRoads",
    sourceName: "Register a vehicle",
    url: "https://www.vicroads.vic.gov.au/registration/register-a-vehicle",
    category: "other",
    changeGroup: "cars",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["cars", "transport"],
    autoPublishEligibility: true,
  },
  {
    sourceId: "qld-rta-bonds",
    organisation: "Queensland Residential Tenancies Authority",
    sourceName: "Rental bonds",
    url: "https://www.rta.qld.gov.au/renting/rental-bonds",
    category: "other",
    changeGroup: "housing",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["housing"],
    autoPublishEligibility: true,
  },
  {
    sourceId: "nsw-fairtrading-renting",
    organisation: "NSW Fair Trading",
    sourceName: "Renting and rental bonds",
    url: "https://www.nsw.gov.au/housing-and-construction/renting-a-place-to-live",
    category: "other",
    changeGroup: "housing",
    riskLevel: "medium",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["housing"],
    autoPublishEligibility: true,
  },
];

/** 有効なソースだけを返す。 */
export function getEnabledSources(): SourceDefinition[] {
  return officialSources.filter((s) => s.enabled);
}

/** source_id からソース定義を引く。 */
export function getSourceById(sourceId: string): SourceDefinition | undefined {
  return officialSources.find((s) => s.sourceId === sourceId);
}
