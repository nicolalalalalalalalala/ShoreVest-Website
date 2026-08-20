/* ShoreVest legacy URL recovery for the production GitHub Pages site.
 * Runs from 404.html before GA. Only known legacy URLs are redirected;
 * bot/noise paths and unknown URLs remain genuine 404s.
 */
(function () {
  'use strict';

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (_) { return value; }
  }

  function normalize(pathname) {
    var p = safeDecode(pathname || '/').replace(/\/{2,}/g, '/');
    if (p.charAt(0) !== '/') p = '/' + p;
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return p;
  }

  var exact = {
    '/news-insights': '/insights/',

    '/john-jones': '/team/',
    '/hui-zheng': '/team/',
    '/benjamin-fanger': '/team/',
    '/daoping-yang': '/team/',
    '/mecy-mei': '/team/',
    '/dinny-mcmahon': '/team/',
    '/ada-bi': '/team/',
    '/michael-chang': '/team/',
    '/cathy-chen': '/team/',
    '/joyce-he': '/team/',
    '/xiaoqiang-ji': '/team/',
    '/jim-chang': '/team/',

    '/china-debt-dynamics/beijings-strategy-for-dealing-with-local-government-debt-no-bailouts-but-a-helping-hand': '/insights/china-debt-dynamics/v7i4/',
    '/china-debt-dynamics-v9i4': '/insights/china-debt-dynamics/v9i4/',
    '/china-debt-dynamics-v9i3': '/insights/china-debt-dynamics/v9i3/',
    '/china-debt-dynamics-v9i3.html': '/insights/china-debt-dynamics/v9i3/',
    '/china-debt-dynamics/chinas-property-support-measures-rescue-not-reflation': '/insights/china-debt-dynamics/v6i3/',
    '/china-debt-dynamics/green-finance-sowing-the-seeds-of-chinas-next-wave-of-npls': '/insights/china-debt-dynamics/v9i1/',
    '/china-debt-dynamics/private-credit-in-a-reset-world-order': '/insights/china-debt-dynamics/v8i5/',
    '/china-debt-dynamics/united-states-of-china': '/insights/china-debt-dynamics/v8i6/',
    '/wp-content/uploads/2025/04/China-Debt-Dynamics-China-An-Uncorrelated-Harbor-in-a-Stormy-World.pdf': '/insights/china-debt-dynamics/v9i2/',
    '/wp-content/uploads/2025/07/White-Paper_Into-The-Shadows-of-US-Private-Credit.pdf': '/insights/china-debt-dynamics/v9i3/',
    '/wp-content/uploads/2024/05/37.-China-Debt-Dynamics-China-refocuses-on-financial-risk-–-and-ramps-up-NPL-disposals.pdf': '/insights/china-debt-dynamics/v8i2/',
    '/newsletter/disclose-dispose-stricter-accounting-requirements-to-push-up-npls-further': '/insights/china-debt-dynamics/v2i4/',
    '/stimulus-not-really-more-of-a-fine-tuning-balancing-act': '/insights/china-debt-dynamics/v7i3/',
    '/newsletter/stimulus-not-really-more-of-a-fine-tuning-balancing-act': '/insights/china-debt-dynamics/v7i3/',
    '/china-debt-dynamics/comparative-analysis-of-chinese-private-credit': '/media/',
    '/china-debt-dynamics/bailing-out-the-banks-the-hidden-significance-of-beijing-property-support-measures': '/insights/china-debt-dynamics/v8i3/',
    '/local-government-debt-burden-could-disappear': '/insights/china-debt-dynamics/v7i4/',
    '/newsletter/it-is-now-time-for-china-to-step-in-and-stimulate': '/insights/china-debt-dynamics/v7i3/',
    '/it-is-now-time-for-china-to-step-in-and-stimulate': '/insights/china-debt-dynamics/v7i3/',
    '/newsletter/over-the-last-few-years-china-has-developed-a-diverse-range-of-tools-to-help-banks-dispose-of-their-nonperforming-loans-npls-on-the-face-of-it-most-of-those-tools-asset-management-compani': '/insights/china-debt-dynamics/v3i5/',
    '/2023/12/08': '/insights/china-debt-dynamics/v7i4/',
    '/2024/03/31': '/insights/china-debt-dynamics/v8i2/',
    '/2024/10/01': '/insights/china-debt-dynamics/v8i4/',
    '/2024/11/06': '/insights/china-debt-dynamics/v8i5/',
    '/2025/01/06': '/insights/china-debt-dynamics/v9i1/',

    '/about-shorevest-partners': '/firm/',
    '/apply.html': '/careers/',
    '/careers/legal-assistant': '/careers/',
    '/philosophy': '/firm/',
    '/vision-principles': '/firm/',
    '/shoraccess': '/investor-portal/',
    '/shorevest': '/',
    '/news': '/insights/',
    '/news-insights/ex_shoreline_executives_reform_as_shorevest': '/firm/',

    '/category/news-insights': '/insights/',
    '/category/news-insights/page/5': '/insights/',
    '/category/news-insights/page/6': '/insights/',
    '/category/newsletter': '/insights/',
    '/author/celestrashorevest-com': '/insights/',
    '/author/celestrashorevest-com/page/2': '/insights/',
    '/author/ellieshorevest-com': '/insights/',

    '/china-approaching-lehman-moment': '/media/',
    '/china-crackdown-bad-debt-forces-wave-loans-market': '/media/',
    '/china-debt-prompt-7-7-trillion-asset-sale': '/media/',
    '/news-insights/china-debt-prompt-7-7-trillion-asset-sale': '/media/',
    '/china-npl-investors-call-us-china-trade-deal-positive-development-agreement-unlikely-to-remove-main-hurdles-for-investors': '/media/',
    '/distressed-funds-find-treasure-chinas-mounting-bad-debts': '/media/',
    '/empea-professional-development-webcast-chinese-pe-market-overview': '/media/',
    '/empea-professional-development-webcast-chinese-private-distressed-debt-investing-opportunities-challenges': '/media/',
    '/new-firm-shorevest-launches-to-invest-in-chinese-distressed-debt': '/media/',
    '/news-insights/new-firm-shorevest-launches-to-invest-in-chinese-distressed-debt': '/media/',
    '/news-insights/aim-summits-webinar-unique-market-dynamics-in-private-credit-post-covid-19-europe-asia': '/media/',
    '/news-insights/big-ignore-internationalisation-chinese-balance-sheets': '/media/',
    '/news-insights/cambridge-associates-touts-fleeting-china-real-estate-opportunity': '/media/',
    '/news-insights/china-can-deflate-worlds-largest-credit-bubble-orderly-fashion': '/media/',
    '/news-insights/china-tipped-to-see-more-npl-deal-flow': '/media/',
    '/news-insights/chinas-credit-excess-unlike-anything-world-ever-seen': '/media/',
    '/news-insights/chinas-legal-system-came-long-way-enforcing-creditor-claims-bad-debt': '/media/',
    '/news-insights/debtwires-webinar-the-new-global-npl-markets': '/media/',
    '/news-insights/doing-your-homework-pays-in-chinese-distressed-debt': '/media/',
    '/news-insights/four-reasons-china-opening-bond-market-world': '/media/',
    '/news-insights/industry-qa-benjamin-fanger': '/media/',
    '/industry-qa-benjamin-fanger': '/media/',
    '/news-insights/investors-see-return-of-npl-opportunities-in-2h20-with-potential-price-drop-debtwire-webinar': '/media/',
    '/news-insights/opportunity-of-a-lifetime-for-distress-investors-as-companies-from-hna-to-chinas-lvmh-flounder-and-bad-debts-balloon': '/media/',
    '/wp-content/uploads/2020/04/South-China-Morning-Post-Opportunity-of-a-lifetime-for-distress-investors-as-companies-from-HNA-to-Chinas-LVMH-flounder-and-bad-debts-balloon.pdf': '/media/',
    '/news-insights/playing-doctor': '/media/',
    '/playing-doctor': '/media/',
    '/news-insights/shoreline-founder-launches-new-distressed-debt-firm': '/media/',
    '/news-insights/shorevest-china-aims-orderly-deflating-worlds-largest-credit-excess': '/media/',
    '/shorevest-china-aims-orderly-deflating-worlds-largest-credit-excess': '/media/',
    '/news-insights/shorevest-launches-750m-fund-tap-npl-portfolios-china': '/media/',
    '/wp-content/uploads/2017/06/ShoreVest-launches-750m-fund-to-tap-NPL-portfolios-in-China.pdf': '/media/',
    '/wp-content/uploads/2017/06/ShoreVest-targets-750m-for-China-distress-fund.pdf': '/media/',
    '/shorevest-eyeing-chinas-bad-debt-industry-750m-fund': '/media/',
    '/news-insights/shorevests-benjamin-fanger-on-private-market-solutions-for-npls': '/media/',
    '/news-insights/shorevests-webinar-chinas-credit-environment-in-the-wake-of-covid-19': '/media/',
    '/news-insights/the-case-for-china': '/media/',
    '/news-insights/the-economist-money-talks': '/media/',
    '/wp-content/uploads/2024/02/Economist-Money-Talks-Interview-1.mp3': '/media/',
    '/news-insights/views-from-the-field-reflecting-on-2013-and-the-outlook-for-em-pe-in-2014': '/media/',
    '/views-from-the-field-reflecting-on-2013-and-the-outlook-for-em-pe-in-2014': '/media/',
    '/news-insights/why-lending-in-china-may-be-safer-than-you-think': '/media/',
    '/wp-content/uploads/2020/05/PDI-Why-lending-in-China-may-be-safer-than-you-think.pdf': '/media/',
    '/news-insights/global-investors-return-to-chinas-bad-debt-market': '/media/',
    '/news-insights/investment-magazines-podcast-ben-fanger-special-situations-recovery-rates-and-chinese-distressed-debt': '/media/',
    '/podcast-benjamin-fanger-ballooning-bad-loans-in-china-are-the-next-great-opportunity': '/media/',
    '/benjamin-fanger-ballooning-bad-loans-in-china-are-the-next-great-opportunity-transcript-of-podcast': '/media/',
    '/shoreline-capitals-fanger-on-chinas-coming-debt-crisis': '/media/',
    '/andrew-brown-china-committed-market-based-solution-excess-debt-challenge': '/media/',
    '/as-chinas-debt-soars-the-market-for-buying-bad-loans-revs-up': '/media/',
    '/cbrc-stepping-enforcement-prohibited-accounting-practices': '/media/',
    '/the-beauty-and-the-beast-of-chinas-non-performing-loans': '/media/',
    '/thick-skins-local-savvy-needed-chinas-bad-debt-markets': '/media/',
    '/worlds-biggest-debt-load-lures-distressed-funds-to-china': '/media/',
    '/zombies-hidden-china-debt-swaps-keep-distressed-funds-wary': '/media/',
    '/with-few-big-deals-private-equity-moves-to-be-asias-new-banker': '/media/',
    '/welcome-to-the-1-5-trillion-minefield-of-defaulted-chinese-debt-2': '/media/',
    '/nikkei-asian-review/evergrandes-liquidation-will-not-pay-off-for-foreign-investors-nikkei-asia': '/media/',
    '/uncategorized/webinar-china-private-debt-comparative-risk-return': '/media/',
    '/wp-content/uploads/2018/01/China-Aims-at-Orderly-Deflating-of-the-Worlds-Largest-Credit-Excess.pdf': '/media/',
    '/newsletter/cbrc-crackdown-teeth': '/insights/',
    '/newsletter/now-optimal-time-invest-npls': '/insights/',
    '/newsletter/regulatory-enforcement-is-creating-tighter-onshore-rmb-funding-conditions': '/insights/',
    '/2016/05/07': '/insights/',
    '/2021/05/13': '/insights/',
    '/2021/10/18': '/insights/'
  };

  var path = normalize(window.location.pathname);
  var target = exact[path];
  if (!target) return;

  var suffix = (window.location.search || '') + (window.location.hash || '');
  window.location.replace(target + suffix);
}());
