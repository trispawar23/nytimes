import type { Article } from "./types";

export const MOCK_ARTICLES: Article[] = [
  {
    id: "mock-1",
    title: "City planners revisit waterfront transit after ridership surge",
    description:
      "Officials are weighing expanded ferry service and a dedicated bus lane as weekend crowds strain existing routes.",
    content:
      "City transportation officials said weekend ridership along the waterfront corridor has exceeded projections for three consecutive seasons, prompting a review of ferry frequency and the feasibility of a dedicated bus lane on adjacent avenues. The planning department emphasized that any changes would undergo environmental review and community consultation. Advocates cautioned that capital funding remains uncertain and that construction timelines could extend into the next decade if approved.",
    source: "Fox News",
    author: "Alex Rivera",
    url: "https://www.foxnews.com/mock-waterfront-transit",
    imageUrl: null,
    publishedAt: new Date().toISOString(),
    category: "local",
  },
  {
    id: "mock-2",
    title: "Researchers report slower coral recovery in warming hotspots",
    description:
      "A long-term monitoring project found patchy regrowth, with scientists urging tighter emissions targets.",
    content:
      "Marine biologists analyzing two decades of reef surveys reported uneven coral recovery in regions experiencing prolonged marine heat waves. The team stressed that while some reefs showed resilience, others lagged behind historical baselines. Scientists said the findings underscore the limits of local conservation without broader reductions in greenhouse gas emissions, but they avoided predicting outcomes for reefs not included in the study.",
    source: "Fox News",
    author: "Jordan Lee",
    url: "https://www.foxnews.com/mock-coral-recovery",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    category: "science",
  },
  {
    id: "mock-3",
    title: "Small businesses test four-day weeks amid hiring crunch",
    description:
      "Owners describe mixed results: happier staff in some shops, tighter coverage in others.",
    content:
      "A consortium of regional chambers of commerce released interim results from a pilot in which participating retailers trialed shortened workweeks. Owners reported improved morale in several locations, while others struggled to maintain customer service hours. Economists interviewed noted the sample size was small and not nationally representative, and outcomes could shift as seasons change.",
    source: "Fox News",
    author: "Sam Patel",
    url: "https://www.foxnews.com/mock-four-day-week",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 172800000).toISOString(),
    category: "business",
  },
  {
    id: "mock-4",
    title: "Sunday Special: This Summer in Culture",
    description:
      "Critics round up the books, films, and performances shaping the season’s conversation.",
    content:
      "Culture desk editors assembled a wide-ranging guide to notable releases and reopenings, emphasizing works that have drawn sustained audience interest without declaring any single title definitive for the summer. Reviewers noted that festival schedules remain subject to weather and staffing constraints, and that several marquee productions have announced limited runs. The package includes capsule summaries intended to help readers plan weekends, with clear attribution when opinions reflect individual critics rather than institutional consensus.",
    source: "Fox News",
    author: "Riley Chen",
    url: "https://www.foxnews.com/mock-summer-culture",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 2505600000).toISOString(),
    category: "culture",
  },
  {
    id: "mock-5",
    title: "Project 2025’s Other Project",
    description:
      "Analysts track parallel policy drafts circulating beyond the headline regulatory push.",
    content:
      "Policy researchers identified a second bundle of proposals circulating alongside the better-known framework, focusing on procurement timelines and agency reporting requirements. Legal scholars cautioned that the drafts could change substantially during comment periods, and that courts have not weighed in on several assumptions embedded in the text. Congressional aides said scheduling for hearings remains uncertain, while state officials asked for clearer guidance on implementation windows should any provisions advance.",
    source: "Fox News",
    author: "Morgan Ellis",
    url: "https://www.foxnews.com/mock-project-parallel",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 3024000000).toISOString(),
    category: "politics",
  },
  {
    id: "mock-6",
    title: "How America Got Possessed with Protein",
    description:
      "Grocers and gyms both report sustained demand for high-protein packaged foods.",
    content:
      "Retail analysts described a multiyear shift in shelf space toward protein-forward snacks and beverages, driven by consumer surveys that consistently rank macronutrients among top purchase motivators. Nutrition researchers interviewed for this story emphasized that individual needs vary widely, and that marketing claims should be read against ingredient lists and serving sizes. Company representatives declined to share proprietary sales figures but pointed to expanded manufacturing capacity as evidence of durable category interest.",
    source: "Fox News",
    author: "Taylor Brooks",
    url: "https://www.foxnews.com/mock-protein-trend",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 3024000000).toISOString(),
    category: "health",
  },
  {
    id: "mock-7",
    title: "Quiet hours return to regional airports after noise complaints",
    description:
      "New curfews limit late-night freight movements at three mid-size hubs.",
    content:
      "Aviation authorities approved staggered curfews intended to reduce nighttime noise exposure for communities near runways used heavily by cargo carriers. Airlines said they would adjust routing where feasible but warned that rerouted freight could add transit time for time-sensitive goods. Environmental groups welcomed the change while urging continued monitoring of particulate emissions during daytime operations, noting that noise and air quality issues often track different peak periods.",
    source: "Fox News",
    author: "Casey Ng",
    url: "https://www.foxnews.com/mock-airport-curfew",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 388800000).toISOString(),
    category: "business",
  },
  {
    id: "mock-8",
    title: "Museums digitize fragile textiles with cautious new scanners",
    description:
      "Conservators say low-light imaging can reduce handling of delicate garments.",
    content:
      "Conservation scientists at partner museums described pilot programs using low-heat scanning rigs designed to capture thread-level detail without prolonged exposure to bright light. Curators stressed that digitization supplements rather than replaces physical access for researchers, and that some objects will remain viewable only under strict conditions. Funding partners noted that metadata standards are still evolving, which could slow cross-institution search until shared vocabularies stabilize.",
    source: "Fox News",
    author: "Priya Shah",
    url: "https://www.foxnews.com/mock-textile-scan",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 518400000).toISOString(),
    category: "culture",
  },
  {
    id: "mock-9",
    title: "Regional grid operators test winter demand forecasts with new models",
    description:
      "Utilities cite tighter coordination between forecasts and fuel supply lines.",
    content:
      "Grid operators in several regions described updated forecasting workflows that incorporate longer-range temperature scenarios and fuel delivery constraints previously modeled separately. Officials emphasized that exercises remain simulations and that real outages depend on many factors beyond forecast accuracy alone. Consumer advocates asked for clearer public communication when conservation appeals are issued, noting that timing and clarity affect participation rates during peak events.",
    source: "Fox News",
    author: "Noah Kim",
    url: "https://www.foxnews.com/mock-grid-forecast",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 604800000).toISOString(),
    category: "business",
  },
  {
    id: "mock-10",
    title: "High school leagues adopt stricter heat rules for outdoor sports",
    description:
      "New thresholds delay or shorten practices when wet-bulb readings climb.",
    content:
      "Athletic associations published revised heat policies that reference wet-bulb globe readings alongside traditional temperature cutoffs, reflecting guidance from sports medicine groups. Coaches interviewed said implementation varies by field access to shade and hydration stations, and that smaller districts may need additional support to comply without cutting practice time sharply. Medical advisors cautioned that no single metric captures all risk factors for exertional heat illness.",
    source: "Fox News",
    author: "Jamie Ortiz",
    url: "https://www.foxnews.com/mock-heat-rules",
    imageUrl: null,
    publishedAt: new Date(Date.now() - 691200000).toISOString(),
    category: "health",
  },
];
