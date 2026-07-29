(function () {
  "use strict";

  var htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  var isChinesePage = htmlLang.indexOf("zh") === 0 || /_cn(?:\.html)?(?:$|[?#])/.test(location.pathname);
  if (!isChinesePage) return;

  var OVERRIDES = [
    ["You must notify ShoreVest immediately at privacy@shorevest.com if you become aware of any actual or suspected unauthorized access to your account.", "如您知悉任何实际或疑似的未经授权访问您账户的情况，您必须立即通过 privacy@shorevest.com 通知新岸资本。"],
    ["WHY THIS PERSISTS", "何以持续"],
    ["Many participants in global capital markets have limited experience with China’s regulatory, enforcement and creditor landscape, favoring platforms with local relationships and execution capabilities built over time.", "全球资本市场的许多参与者对中国监管框架、执行环境及债权人格局缺乏深入了解，因而青睐那些经过长期积累、兼具本地关系与执行能力的平台。"],
    ["Outcomes depend on documentation, control rights, asset-level diligence and the ability to execute through local processes.", "投资结果取决于文件记录、控制权、资产层面的尽职调查以及依托本地流程予以执行的能力。"],
    ["When opportunities arise, we look for strong students and early-career professionals with analytical ability, intellectual curiosity, and a genuine interest in how a private credit firm operates. Appointments are made selectively and against a high standard.", "当机会出现时，我们会寻找具备分析能力、求知欲，并对私募信贷公司如何运作感兴趣的优秀在校生及初入职场人士。我们审慎作出录用决定，且遵循高标准。"],
    ["What We Value", "我们的价值观"],
    ["Counterparties need to trust that we understand the problem and will follow through. Within the firm, trust means people can rely on each other’s work instead of checking and rechecking it. Investors need to trust us with their capital and with the decisions we make on their behalf.", "交易对手需要信任我们理解问题所在，并会切实执行。在公司内部，信任意味着大家可以依赖彼此的工作，而无需反复核查。投资者需要信任我们，将资金托付给我们，并信任我们代表他们所作出的决策。"],
    ["That trust takes time to grow. We earn it through sound judgment, consistent execution, and doing what we say we will do.", "这种信任需要时间培养。我们通过稳健的判断、始终如一的执行以及言出必行来赢得信任。"],
    ["We will direct your inquiry to the right team.", "我们将把您的咨询转交至相应团队。"],
    ["We expect people to reach clear judgments, defend them under scrutiny, and stand behind the quality of their work. Responsibility follows demonstrated judgment and execution, not simply time served.", "我们期望员工能做出明确的判断，在审视下捍卫己见，并对工作质量负责。责任源于所展现的判断力与执行力，而非仅仅基于资历。"],
    ["We are building something that should still be growing long after the people who started it are gone.", "我们正在构建的企业，应当在创始者离去很久之后，仍在持续成长。"],
    ["Upcoming events", "即将进行的活动"],
    ["LOAD MORE", "加载更多"],
    ["Three disciplines behind the platform", "平台背后的三大核心能力"],
    ["More than two decades of China credit experience inform ShoreVest’s underwriting, portfolio management and institutional governance.", "逾二十年的中国信贷经验，为新岸资本的承销、投资组合管理及机构化治理提供坚实支撑。"],
    ["ShoreVest works with borrowers and financial institutions to structure asset-backed credit for complex financing, restructuring and resolution situations.", "新岸资本与借款人及金融机构合作，针对复杂的融资、重组及处置情形，构建资产支持型信贷。"],
    ["This website is provided by ShoreVest Partners, Ltd. and relevant affiliates for general informational purposes only. Content is summary in nature, may be incomplete, may change without notice and is not intended to provide the full basis for evaluating ShoreVest, any ShoreVest-managed vehicle or any investment opportunity. This website is not intended for retail investors.", "本网站由新岸资本及其相关关联方提供，仅供一般参考。内容为概括性质，可能不完整，可能随时变更且恕不另行通知，亦不旨在为评估新岸资本、任何 新岸资本管理的载体或任何投资机会提供完整依据。本网站不面向散户投资者。"],
    ["This Cookie Notice explains how ShoreVest Partners, Ltd. and its relevant affiliates (collectively, ShoreVest, we, us or our) use cookies and similar tracking technologies on this website (the Site).", "本 Cookie 通知说明新岸资本及其相关关联公司（统称「新岸资本」、「我们」或「我方」）如何在本网站（下称「网站」）上使用 Cookie 及类似追踪技术。"],
    ["These Terms of Use govern your access to and use of this website (the Site) operated by ShoreVest Partners, Ltd. and its relevant affiliates (collectively, ShoreVest, we, us or our).", "本使用条款规定您对新岸资本及其相关关联公司（统称「新岸资本」、「我们」或「我方」）运营的本网站（下称「网站」）的访问及使用。"],
    ["Themes covered", "覆盖主题"],
    ["The team behind ShoreVest", "新岸资本团队"],
    ["The Site may include forward-looking statements, projections, targets or expectations. These are inherently uncertain. Actual results may differ materially.", "本网站可能包含前瞻性陈述、预测、目标或期望。此等内容本质上具有不确定性。实际结果可能存在重大差异。"],
    ["The Site may contain links to third-party websites or include third-party content for convenience only. ShoreVest does not control, endorse or assume responsibility for any third-party content. Access to third-party websites is entirely at your own risk.", "本网站可能包含指向第三方网站的链接或第三方内容，仅供便捷。新岸资本不控制、不认可任何第三方内容，亦不对其承担任何责任。访问第三方网站的风险完全由您自行承担。"],
    ["The Site is provided for general informational purposes only and is not directed at retail investors.", "本网站仅供一般信息目的而提供，不针对散户投资者。"],
    ["THE OPPORTUNITY", "市场机遇"],
    ["Participation requires familiarity with China’s regulatory framework, creditor landscape, enforcement processes and local resolution mechanisms.", "参与该市场需要熟悉中国的监管框架、债权人格局、执行程序以及本地处置机制。"],
    ["Market figures are approximate, drawn from third-party estimates, and subject to change.", "市场数据为近似值，基于第三方估算，且可能发生变化。"],
    ["The contraction of shadow-bank financing opens private-credit niches for borrowers still backed by real collateral.", "影子银行融资的收缩，为那些仍由实际抵押品支持的借款人开拓了私募信贷的细分领域。"],
    ["That means giving them real responsibility before they have the title, and giving them the experience, guidance, and room to become genuinely good at what they do. Growth takes time, but it should never stop.", "这意味着在他们获得头衔之前，先赋予真正的责任，给予他们历练、指引和空间，让他们真正精通所做之事。成长需要时间，但绝不应停止。"],
    ["A strong firm should not have only one or two tall trees. It should keep producing people who can stand tall in their own right.", "一家强大的公司不应只有一两棵高树，而应持续造就凭自身实力屹立的人才。"],
    ["Submit an inquiry", "提交咨询"],
    ["Provide a brief description of your inquiry. Please do not include confidential deal materials.", "请简要说明您的咨询内容。请勿包含保密交易材料。"],
    ["INQUIRY TYPE", "咨询类型"],
    ["INQUIRY SUMMARY", "咨询摘要"],
    ["SEND INQUIRY", "发送咨询"],
    ["ShoreVest’s work depends on trust developed over time with borrowers, financial institutions, counterparties and institutional investors.", "新岸资本的业务依赖于长期以来与借款人、金融机构、交易对手及机构投资者建立的信任。"],
    ["ShoreVest works with borrowers and financial institutions to structure asset-backed credit around downside protection, enforceability and viable paths to recovery.", "新岸资本与借款人及金融机构合作，围绕下行保护、可执行性及可行的回收路径来构建资产支持型信贷。"],
    ["Asset-backed lending", "资产支持型借贷"],
    ["Disciplined workouts, servicing and exits aligned to institutional underwriting.", "遵循机构化承销标准的纪律性债务重组、资产服务及退出。"],
    ["ShoreVest provides asset-backed credit solutions to borrowers and financial institutions across China.", "新岸资本为中国各地的借款人与金融机构提供资产支持型信贷解决方案。"],
    ["ShoreVest Partners and its affiliates provide investment management services to institutional investors. This website is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any security or investment product, nor investment, legal, or tax advice.", "新岸资本（ShoreVest Partners）及其关联机构向机构投资者提供投资管理服务。本网站仅供信息参考，不构成出售任何证券或投资产品的要约，亦不构成购买任何证券或投资产品的要约邀请，也不构成投资、法律或税务建议。"],
    ["ShoreVest on a conference panel before an audience at FII Priority Asia.", "新岸资本在 FII Priority 亚洲峰会的专题讨论中发言，面向与会观众"],
    ["UPCOMING EVENTS", "即将进行的活动"],
    ["ShoreVest maintains technical and organizational measures designed to protect personal information against unauthorized access, loss, destruction or alteration, commensurate with the nature of the data and the risks involved.", "新岸资本维持技术和组织方面的措施，旨在保护个人信息免遭未经授权的访问、丢失、毁损或篡改，该等措施与数据的性质及所涉风险相适应。"],
    ["ShoreVest is committed to providing equal employment opportunities in accordance with applicable laws and regulations. Employment decisions are based on qualifications, experience, performance, and role requirements, without regard to any characteristic protected by applicable law.", "新岸资本致力于根据适用法律法规提供平等就业机会。所有雇佣决定均基于资质、经验、绩效及岗位要求作出，不因受适用法律保护的任何特征而有差别对待。"],
    ["Select an option", "选择咨询类别"],
    ["Investor inquiry", "投资者咨询"],
    ["Thank you — your inquiry has been received.", "感谢您提交咨询，我们已收悉。"],
    ["References to unrealized investments, indicative valuations, collateral values, estimated recovery values, targeted returns or scenario outcomes are inherently judgmental and subject to change. Actual realized outcomes may differ materially from any indicative, modeled or hypothetical figures due to changes in market conditions, borrower performance, legal outcomes, enforcement timing, tax leakage, foreign exchange and other factors.", "本网站提及的未实现投资、指示性估值、抵押品价值、预计回收价值、目标回报或情景分析结果，本质上均具有主观判断性，且可能发生变更。由于市场状况、借款人表现、法律结果、执行时机、税务漏损、外汇及其他因素的变动，实际实现的结果可能与任何指示性、模型估算或假设性数据存在重大差异。"],
    ["Questions or requests relating to this Privacy Policy or ShoreVest’s processing of personal information should be directed to: privacy@shorevest.com. ShoreVest Partners, Ltd. — offices across China and Hong Kong. General enquiries: Contact Us form on the Site.", "有关本隐私政策或新岸资本个人信息处理的问题或请求，请发送至：privacy@shorevest.com。新岸资本（ShoreVest Partners, Ltd.）——在中国及香港设有办事处。一般咨询请使用网站上的「联系我们」表单。"],
    ["Property measures are positioned as targeted rescue tools rather than a broad reflation of housing demand.", "房地产支持措施被定位为有针对性的救助工具，而非对住房需求的广泛再通胀。"],
    ["PDI APAC Forum", "私募投资债务者亚太论坛"],
    ["SuperReturn Emerging Markets", "超级回归新兴市场会议"],
    ["Bloomberg Invest Hong Kong", "彭博投资香港峰会"],
    ["FII Institute Priority panel on private credit", "FII 研究所举办的私募信贷专题讨论"],
    ["LINKEDIN", "领英"],
    ["OUR OFFICES", "我们的办公室"],
    ["All meetings are by prior arrangement. Please use the form or routes above to ensure your inquiry reaches the right team.", "所有会议均需提前安排。请使用上述表格或咨询途径，以确保您的咨询送达相应的团队。"],
    ["OUR APPROACH", "我们的方法论"],
    ["How We Work", "我们的工作方式"],
    ["MEDIA ARCHIVE", "媒体档案"],
    ["PUBLICATION", "来源"],
    ["FII INSTITUTE", "FII研究院"],
    ["Private credit market discussion", "私募信贷市场探讨"],
    ["PRIVATE DEBT INVESTOR", "私募投资债务者"],
    ["ShoreVest on the case for China", "新岸资本论中国投资机遇"],
    ["THE ECONOMIST", "经济学人"],
    ["The Economist speaks with ShoreVest on China's financial system and distressed debt", "《经济学人》与新岸资本就中国金融体系及问题债务进行对话"],
    ["Money Talks", "《经济学人》播客 “金钱有话说”"],
    ["MBA", "工商管理硕士"],
    ["CalPERS", "加州公务员退休基金"],
    ["Materials made available through the Portal are provided solely to enable eligible persons to conduct diligence on ShoreVest and any ShoreVest-managed vehicle in connection with a potential investment relationship.", "通过门户提供的材料，仅旨在使适格人士能够就新岸资本及新岸资本管理的任何载体开展尽职调查，以建立潜在的投资关系。"],
    ["Materials in the Portal are provided for informational and diligence purposes only.", "门户中的材料仅供参考及尽职调查之目的而提供。"],
    ["You are responsible for conducting your own independent analysis and consulting your own advisors before making any investment decision.", "您有责任在作出任何投资决策之前，自行进行独立分析并咨询您自身的顾问。"],
    ["Louisa Ho", "何瑞青"],
    ["Esther Li", "李泳琪"],
    ["Charlotte Lan", "兰玉芳"],
    ["Rock Mobile Corporation", "滚石移动股份有限公司"],
    ["Lone Star Funds", "孤星基金"],
    ["CarVal Investors", "嘉沃投资"],
    ["Kaili Assets Management", "凯利资产管理公司"],
    ["Lillian Xu", "徐琳玲"],
    ["General Counsel", "法律总顾问"],
    ["James Li", "李宪"],
    ["Director of Capital Solutions", "资本解决方案总监"],
    ["Yao Fu", "傅尧"],
    ["Senior Investment Manager", "高级投资经理"],
    ["Institutional experience.", "机构化经验"],
    ["ShoreVest is a China-focused private credit investment manager with a team active in the market since 2004.", "新岸资本是一家专注于中国的私募信贷投资管理机构，其团队自 2004 年起活跃于市场。"],
    ["The platform covers sourcing, underwriting, legal structuring, asset servicing and portfolio management.", "该平台业务涵盖项目寻源、承销、法律结构设计、资产服务及投资组合管理。"],
    ["INQUIRY ROUTES", "咨询途径"],
    ["Origination, deal referrals, and asset introductions across China credit and distressed debt.", "涵盖中国信贷及问题债务领域的项目获取、交易推荐与资产介绍。"],
    ["For interviews, events, and editorial inquiries, contact media@shorevest.com.", "有关采访、活动及编辑方面的咨询，请联系 media@shorevest.com。"],
    ["Inclusion of a link does not imply endorsement.", "包含任何链接并不意味着予以认可。"],
    ["FII Institute", "FII 研究所"],
    ["Private credit market discussion at the FII Institute Priority panel", "于FII 研究所专题讨论中进行的私募信贷市场探讨"],
    ["FEATURED IN", "曾获报道媒体"],
    ["Bloomberg · Reuters · The Economist · Nikkei Asia · SCMP", "彭博 · 路透社 · 《经济学人》 · 日经亚洲 · 南华早报"],
    ["END OF ARCHIVE", "档案结束"],
    ["Deployment shifts with the opportunity set as market conditions and pricing change.", "随着市场状况与定价的变化，资金部署相应转移至不同的机遇组合。"],
    ["CREDIT SOLUTIONS & SOURCING", "信贷解决方案与项目寻源"],
    ["Banks and asset-management companies work with ShoreVest to finance, restructure and resolve credit, and are a primary source of opportunities across the platform.", "银行和资产管理公司与新岸资本合作开展信贷融资、重组与处置，并构成平台整体业务机会的主要来源。"],
    ["CONTACT", "联系我们"],
    ["Every inquiry is directed to the team best placed to respond. Select the route that fits, or complete the form below.", "每项咨询均将转交至最适宜回复的团队。请选择适合的联络方式，或填写下方表格。"],
    ["ALL INQUIRIES ARE CONFIDENTIAL", "所有咨询均严格保密"],
    ["COMMON UNDERWRITING CONSIDERATIONS", "通用承销考量因素"],
    ["Claim priority, documentation and enforceability are reviewed for each situation.", "针对每种情形，逐一审查债权优先级、文件记录及可执行性。"],
    ["Client Solutions leads ShoreVest’s relationships with institutional investors across Asia-Pacific, the Americas, and EMEA. The team is responsible for fundraising, investor due diligence, communication, reporting, and ongoing institutional coverage.", "客户解决方案团队负责新岸资本与亚太、美洲、欧洲、中东及非洲地区机构投资者的关系。该团队负责资金募集、投资者尽职调查、沟通、报告及持续的机构覆盖。"],
    ["CIMA", "开曼群岛金融管理局"],
    ["By using the Site, you acknowledge those practices.", "通过使用本网站，即表示您确认上述做法。"],
    ["By registering for and accessing the Portal, you acknowledge that processing in accordance with the Privacy Policy will occur.", "通过注册并访问门户，即表明您确认将按照《隐私政策》进行该等处理。"],
    ["By accessing restricted areas, you represent and warrant that: you meet all applicable legal, regulatory and eligibility requirements;", "访问受限区域，即表示您声明并保证：您满足所有适用的法律、监管及资格要求；"],
    ["BNP Paribas Peregrine", "法国巴黎证券"],
    ["Beijing’s measured stimulus response highlights policy constraints and implications for growth-sensitive credit exposures.", "北京有节制的刺激回应，凸显出政策约束及其对增长敏感型信贷敞口的影响。"],
    ["Developer exposure pressures bank earnings and asset quality but may not translate into systemic banking risk.", "对开发商的敞口给银行盈利与资产质量带来压力，但未必会演变为系统性银行风险。"],
    ["Asset-backed private credit in China", "中国资产支持型私募信贷"],
    ["ShoreVest is a private credit firm serving borrowers and financial institutions across China.", "新岸资本是一家专注于中国市场的私募信贷机构，为中国范围内的借款人与金融机构提供服务。"],
    ["Asset-backed lending · Asset restructuring · Debt resolution", "资产支持型借贷 · 资产重组 · 债务处置"],
    ["Asset-backed financing for companies with identifiable collateral and financing needs, including bridge, refinancing and acquisition situations.", "为拥有可识别抵押品及融资需求的企业提供资产支持型融资，涵盖过桥融资、再融资及收购等情形。"],
    ["BRIDGE · REFINANCE · ACQUISITION", "过桥融资 · 再融资 · 收购"],
    ["Capital for situations involving viable assets and challenged balance sheets, including restructurings and deep value acquisitions.", "针对具备存续价值的资产与陷入困境的资产负债表提供资金，涵盖重组及深度价值收购。"],
    ["As Director of Client Solutions, Americas & EMEA, Mr. Jones leads client engagement across the Americas, Europe, the Middle East and Africa.", "John Jones 先生担任客户解决方案总监，负责新岸资本在美洲、欧洲、中东及非洲的客户关系与覆盖。"],
    ["APAC Family Office Investment Summit", "亚太家族办公室投资峰会"],
    ["SuperReturn Asia 2026", "2026年度超级回归亚洲峰会"],
    ["An overview of legal, regulatory, and market mechanisms banks use to transfer or resolve bad assets.", "概述银行用于转让或处置不良资产的法律、监管及市场机制。"],
    ["Access Gate Text", "访问准入声明"],
    ["You are a professional investor, institutional investor, qualified purchaser, accredited investor or equivalent classification under the laws of your jurisdiction.", "您是专业投资者、机构投资者、合格购买人、获认可投资者，或您所在司法管辖区法律承认的同等类别投资者。"],
    ["You are not a retail investor.", "您不是散户投资者。"],
    ["If you do not meet the eligibility criteria above, please click I Do Not Meet These Criteria. You will be returned to the public homepage. Misrepresentation of eligibility status may constitute a breach of applicable law.", "如果您不符合上述资格条件，请点击“我不符合这些条件”。您将被引导返回公共首页。对资格状况的虚假陈述可能构成对适用法律的违反。"],
    ["A forward look at NPL formation, bank disposal pressure, and recovery strategies during a credit downcycle.", "对信贷下行周期中不良贷款形成、银行处置压力及回收策略的前瞻审视。"],
    ["A cross-market comparison of private-credit growth, opacity, risk transfer, and the underwriting lessons visible from China.", "一项跨市场比较研究，审视私募信贷的增长、不透明性、风险转移，以及从中国市场可察的承销教训。"],
    ["A China-focused private credit platform", "一家专注于中国的私募信贷平台"],
    ["The platform has developed through relationships with borrowers, financial institutions, service providers and institutional capital partners, supported by local teams and institutional investment-management processes.", "该平台依托与借款人、金融机构、服务提供商及机构资本合作伙伴的关系得到逐步发展，并得到本地团队与机构化投资管理流程的支持。"],
    ["7. Permitted use and prohibited conduct", "7.获准使用与禁止行为"],
    ["7. No warranty as to materials", "7. 关于材料不提供保证"],
    ["22. Official documents prevail", "22. 以正式文件为准"],
    ["2. No offer, no solicitation", "2. 不构成要约及要约邀请"],
    ["10. No warranties", "10.不提供保证"],
    ["The Site is provided on an as is and as available basis. To the fullest extent permitted by applicable law, ShoreVest disclaims all representations and warranties, express or implied, including as to accuracy, completeness, uninterrupted operation, absence of viruses, and fitness for any particular purpose.", "本网站按「现状」及「可提供」的基础提供。在适用法律允许的最大范围内，新岸资本不作出任何明示或默示的声明和保证，包括但不限于关于准确性、完整性、不间断运行、无病毒或适合特定目的的声明和保证。"],
    ["US$2B+", "逾20亿美元"],
    ["Team active in China credit across market cycles", "团队活跃于中国信贷市场，历经多轮市场周期"],
    ["Claim priority, documentation and enforceability are reviewed under applicable law.", "依据适用法律，审查债权优先级、文件记录及可执行性。"],
    ["Portfolio-level considerations", "投资组合层面考量"],
    ["Concentration, duration and execution risk are considered in portfolio construction.", "在投资组合构建中，考量集中度风险、久期风险及执行风险。"],
    ["Portfolio exposures are reviewed across borrowers, collateral, geography and investment vintage where relevant.", "在相关情况下，按借款人、抵押品、地域及投资年份对投资组合风险敞口进行审查。"],
    ["These Investor Portal Terms (Portal Terms) govern access to and use of the investor-access portal, restricted materials, data room environments and any downloadable documents made available by ShoreVest Partners, Ltd. and its relevant affiliates (collectively, ShoreVest, we, us or our) through this website (the Portal).", "本投资者门户条款（下称“门户条款”）管辖通过本网站（下称“门户”）访问及使用由新岸资本（ShoreVest Partners, Ltd.） 及其相关关联方（统称“ShoreVest”、“我们”或“我们的”）提供的投资者访问门户、受限材料、数据室环境及任何可下载文件的相关事宜。"],
    ["You are solely responsible for ensuring your use complies with all applicable laws.", "您须自行负责确保您对本网站的使用符合所有适用法律。"],
    ["Where ShoreVest acts as a data controller in relation to this Site, ShoreVest Partners, Ltd. is the primary responsible entity.", "在新岸资本就本网站担任数据控制者时，新岸资本（ShoreVest Partners, Ltd. ）为主要责任实体。"],
    ["ShoreVest", "新岸资本"],
    ["(a) you are a professional investor, institutional investor, qualified purchaser, accredited investor or equivalent classification recognized under the laws of your jurisdiction;", "(a) 您是专业投资者、机构投资者、合格购买人、获认可投资者，或您所在司法管辖区法律承认的同等类别投资者；"],
    ["(b) you are not a retail investor;", "(b) 您不是散户投资者；"],
    ["ShoreVest may request evidence of eligibility at any time and reserves the right to deny, suspend or revoke access at its sole discretion and without explanation.", "新岸资本可随时要求提供资格证明，并保留自行决定拒绝、暂停或撤销访问的权利，且无需作出解释。"]
  ];

  var DIRECT_REPLACEMENTS = [
    ["Louisa Ho", "何瑞青女士"],
    ["Louisa", "何女士"],
    ["Esther Li", "李泳琪女士"],
    ["Esther", "李女士"],
    ["Charlotte Lan", "兰玉芳"],
    ["Charlotte", "兰女士"],
    ["Rock Mobile Corporation", "滚石移动股份有限公司"],
    ["Lone Star Funds", "孤星基金"],
    ["CarVal Investors", "嘉沃投资"],
    ["Kaili Assets Management", "凯利资产管理公司"],
    ["BNP Paribas Peregrine", "法国巴黎证券"],
    ["Lillian Xu", "徐琳玲"],
    ["James Li", "李宪"],
    ["Yao Fu", "傅尧"],
    ["General Counsel", "法律总顾问"],
    ["Director of Capital Solutions", "资本解决方案总监"],
    ["Senior Investment Manager", "高级投资经理"],
    ["FII Institute", "FII 研究所"],
    ["Private Debt Investor", "私募投资债务者"],
    ["The Economist", "《经济学人》"],
    ["LinkedIn", "领英"],
    ["CalPERS", "加州公务员退休基金"],
    ["CIMA", "开曼群岛金融管理局"],
    ["MBA", "工商管理硕士"]
  ].sort(function (a, b) { return b[0].length - a[0].length; });

  function normalize(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—‑]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function elementChildren(element) {
    return Array.prototype.slice.call(element.children || []);
  }

  function elementPath(ancestor, descendant) {
    var path = [];
    var current = descendant;
    while (current && current !== ancestor) {
      var parent = current.parentElement;
      if (!parent) return null;
      var siblings = elementChildren(parent);
      var index = siblings.indexOf(current);
      if (index < 0) return null;
      path.push(index);
      current = parent;
    }
    return current === ancestor ? path.reverse() : null;
  }

  function followPath(ancestor, path) {
    var current = ancestor;
    for (var i = 0; i < path.length; i += 1) {
      var children = elementChildren(current);
      if (path[i] >= children.length) return null;
      current = children[path[i]];
    }
    return current;
  }

  function locateCorresponding(sourceElement, sourceDocument) {
    var anchor = sourceElement;
    while (anchor.parentElement && !anchor.id && anchor.tagName !== "BODY") {
      anchor = anchor.parentElement;
    }

    if (anchor.id) {
      var liveAnchor = document.getElementById(anchor.id);
      var relativePath = elementPath(anchor, sourceElement);
      if (liveAnchor && relativePath) {
        var anchoredCandidate = followPath(liveAnchor, relativePath);
        if (anchoredCandidate && anchoredCandidate.tagName === sourceElement.tagName) {
          return anchoredCandidate;
        }
      }
    }

    var bodyPath = elementPath(sourceDocument.body, sourceElement);
    if (!bodyPath) return null;
    var candidate = followPath(document.body, bodyPath);
    return candidate && candidate.tagName === sourceElement.tagName ? candidate : null;
  }

  function hasMatchingChild(element, normalizedText) {
    var children = elementChildren(element);
    for (var i = 0; i < children.length; i += 1) {
      if (normalize(children[i].textContent) === normalizedText) return true;
    }
    return false;
  }

  function setElementText(element, approvedText) {
    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parentTag = node.parentElement && node.parentElement.tagName;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parentTag || "")) {
          return NodeFilter.FILTER_REJECT;
        }
        return normalize(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    if (!nodes.length) return;
    nodes[0].nodeValue = approvedText;
    for (var i = 1; i < nodes.length; i += 1) nodes[i].nodeValue = "";
  }

  function applyDirectReplacements(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var tag = node.parentElement && node.parentElement.tagName;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag || "")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var textNode;
    while ((textNode = walker.nextNode())) {
      var updated = textNode.nodeValue;
      for (var i = 0; i < DIRECT_REPLACEMENTS.length; i += 1) {
        updated = updated.split(DIRECT_REPLACEMENTS[i][0]).join(DIRECT_REPLACEMENTS[i][1]);
      }
      if (updated !== textNode.nodeValue) textNode.nodeValue = updated;
    }
  }

  function scriptBase() {
    var script = document.currentScript;
    if (!script || !script.src) return new URL("./", location.href);
    return new URL(script.src.replace(/assets\/js\/chinese-copy-overrides\.js.*$/, ""));
  }

  function englishPageUrl() {
    var base = scriptBase();
    var alternate = document.querySelector('link[rel="alternate"][hreflang="en"]');
    if (alternate && alternate.href) {
      try {
        var alternateUrl = new URL(alternate.href, location.href);
        return new URL(alternateUrl.pathname.replace(/^\//, "") + alternateUrl.search, base).href;
      } catch (_) {}
    }

    var relativePath = location.pathname;
    var basePath = base.pathname;
    if (relativePath.indexOf(basePath) === 0) relativePath = relativePath.slice(basePath.length);
    relativePath = relativePath.replace(/index_cn\.html$/, "/").replace(/_cn\.html$/, ".html");
    return new URL(relativePath.replace(/^\//, "") + location.search, base).href;
  }

  var englishDocumentPromise;
  function getEnglishDocument() {
    if (!englishDocumentPromise) {
      englishDocumentPromise = fetch(englishPageUrl(), { credentials: "same-origin", cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("Unable to load mirrored English page");
          return response.text();
        })
        .then(function (html) { return new DOMParser().parseFromString(html, "text/html"); });
    }
    return englishDocumentPromise;
  }

  function applyApprovedAttributes() {
    var path = location.pathname.toLowerCase();
    if (/(?:^|\/)cn\/media(?:\/|$)|media_cn\.html$/.test(path)) {
      var mediaHero = document.querySelector('img[src*="media-hero-fii-priority"]');
      if (mediaHero) {
        mediaHero.alt = "新岸资本在 FII Priority 亚洲峰会的专题讨论中发言，面向与会观众";
      }
    }
  }

  function applyApprovedCopy() {
    getEnglishDocument().then(function (englishDocument) {
      var allEnglishElements = Array.prototype.slice.call(englishDocument.body.querySelectorAll("*"));
      var grouped = Object.create(null);

      for (var i = 0; i < OVERRIDES.length; i += 1) {
        grouped[normalize(OVERRIDES[i][0])] = OVERRIDES[i][1];
      }

      for (var j = 0; j < allEnglishElements.length; j += 1) {
        var sourceElement = allEnglishElements[j];
        var normalizedText = normalize(sourceElement.textContent);
        var approvedText = grouped[normalizedText];
        if (!approvedText || hasMatchingChild(sourceElement, normalizedText)) continue;
        var targetElement = locateCorresponding(sourceElement, englishDocument);
        if (targetElement) setElementText(targetElement, approvedText);
      }

      applyDirectReplacements(document.body);
      applyApprovedAttributes();
      document.documentElement.setAttribute("data-sv-cn-copy-corrected", "true");
    }).catch(function () {
      applyDirectReplacements(document.body);
      applyApprovedAttributes();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyApprovedCopy, { once: true });
  } else {
    applyApprovedCopy();
  }

  window.addEventListener("pageshow", applyApprovedCopy);
  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      for (var j = 0; j < mutations[i].addedNodes.length; j += 1) {
        var added = mutations[i].addedNodes[j];
        if (added.nodeType === 1) {
          applyDirectReplacements(added);
          applyApprovedAttributes();
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
