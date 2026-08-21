import { NextResponse } from "next/server";

type RequestBody = {
  fileName?: string;
  columns?: string[];
  rowCount?: number;
  rows?: Record<string, unknown>[];
};

type DataRow = Record<string, unknown>;

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const cleaned = String(value)
    .replace(/₹/g, "")
    .replace(/\$/g, "")
    .replace(/€/g, "")
    .replace(/£/g, "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function findColumn(
  columns: string[],
  patterns: RegExp[]
): string | null {
  return (
    columns.find((column) =>
      patterns.some((pattern) => pattern.test(normalize(column)))
    ) || null
  );
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `₹${(value / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `₹${(value / 1_000).toFixed(1)}K`;
  }

  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const fileName = body.fileName || "Uploaded dataset";
    const columns = body.columns || [];
    const rows = body.rows || [];

    const rowCount = rows.length || body.rowCount || 0;

    if (!rows.length) {
      return NextResponse.json(
        {
          error: "No dataset rows were provided.",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.XAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "XAI_API_KEY is missing. Add it to your environment variables.",
        },
        { status: 500 }
      );
    }

    /*
     * ---------------------------------------------------------
     * 1. DETECT IMPORTANT BUSINESS COLUMNS
     * ---------------------------------------------------------
     */

    const revenueColumn = findColumn(columns, [
      /revenue/,
      /sales/,
      /amount/,
      /total/,
      /income/,
      /turnover/,
    ]);

    const unitsColumn = findColumn(columns, [
      /units?/,
      /quantity/,
      /qty/,
      /volume/,
    ]);

    const productColumn = findColumn(columns, [
      /product/,
      /item/,
      /sku/,
      /service/,
    ]);

    const regionColumn = findColumn(columns, [
      /region/,
      /area/,
      /location/,
      /territory/,
      /state/,
      /city/,
    ]);

    const dateColumn = findColumn(columns, [
      /date/,
      /month/,
      /time/,
      /period/,
    ]);

    const customerColumn = findColumn(columns, [
      /customer/,
      /client/,
      /buyer/,
      /account/,
    ]);

    /*
     * ---------------------------------------------------------
     * 2. CALCULATE REAL BUSINESS NUMBERS
     * ---------------------------------------------------------
     */

    let totalRevenue = 0;
    let totalUnits = 0;
    let revenueRows = 0;
    let unitsRows = 0;

    for (const row of rows) {
      if (revenueColumn) {
        const revenue = parseNumber(row[revenueColumn]);

        if (revenue !== null) {
          totalRevenue += revenue;
          revenueRows++;
        }
      }

      if (unitsColumn) {
        const units = parseNumber(row[unitsColumn]);

        if (units !== null) {
          totalUnits += units;
          unitsRows++;
        }
      }
    }

    const averageOrderValue =
      revenueRows > 0
        ? totalRevenue / revenueRows
        : null;

    /*
     * ---------------------------------------------------------
     * 3. REVENUE TREND
     * ---------------------------------------------------------
     */

    const revenueByPeriod: Record<string, number> = {};

    if (dateColumn && revenueColumn) {
      for (const row of rows) {
        const date = parseDate(row[dateColumn]);
        const revenue = parseNumber(row[revenueColumn]);

        if (!date || revenue === null) continue;

        const key = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

        revenueByPeriod[key] =
          (revenueByPeriod[key] || 0) + revenue;
      }
    }

    const revenueTrend = Object.entries(revenueByPeriod)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, revenue]) => ({
        period,
        revenue: Math.round(revenue * 100) / 100,
      }));

    let growthPercent: number | null = null;

    if (revenueTrend.length >= 2) {
      const first = revenueTrend[0].revenue;
      const last =
        revenueTrend[revenueTrend.length - 1].revenue;

      if (first !== 0) {
        growthPercent =
          ((last - first) / Math.abs(first)) * 100;
      }
    }

    /*
     * ---------------------------------------------------------
     * 4. PRODUCT PERFORMANCE
     * ---------------------------------------------------------
     */

    const productTotals: Record<string, number> = {};

    if (productColumn && revenueColumn) {
      for (const row of rows) {
        const product = String(
          row[productColumn] ?? ""
        ).trim();

        const revenue = parseNumber(
          row[revenueColumn]
        );

        if (!product || revenue === null) continue;

        productTotals[product] =
          (productTotals[product] || 0) + revenue;
      }
    }

    const productPerformance = Object.entries(productTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([product, revenue]) => ({
        product,
        revenue: Math.round(revenue * 100) / 100,
      }));

    /*
     * ---------------------------------------------------------
     * 5. REGIONAL PERFORMANCE
     * ---------------------------------------------------------
     */

    const regionTotals: Record<string, number> = {};

    if (regionColumn && revenueColumn) {
      for (const row of rows) {
        const region = String(
          row[regionColumn] ?? ""
        ).trim();

        const revenue = parseNumber(
          row[revenueColumn]
        );

        if (!region || revenue === null) continue;

        regionTotals[region] =
          (regionTotals[region] || 0) + revenue;
      }
    }

    const regionalPerformance = Object.entries(regionTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([region, revenue]) => ({
        region,
        revenue: Math.round(revenue * 100) / 100,
      }));

    /*
     * ---------------------------------------------------------
     * 6. DATA AVAILABILITY
     * ---------------------------------------------------------
     */

    const availableMetrics = {
      revenue: Boolean(revenueColumn),
      units: Boolean(unitsColumn),
      product: Boolean(productColumn),
      region: Boolean(regionColumn),
      date: Boolean(dateColumn),
      customer: Boolean(customerColumn),
    };

    /*
     * ---------------------------------------------------------
     * 7. SEND A REASONABLE SAMPLE TO GROK
     * ---------------------------------------------------------
     */

    const datasetSample = rows.slice(0, 300);

    const prompt = `
You are Aether Intelligence, a professional business analyst.

Analyze the uploaded business dataset and explain the results in SIMPLE BUSINESS LANGUAGE.

The person reading the result may not understand statistics,
data science, technical terminology, AI terminology, or complex
business jargon.

Speak like a smart business consultant speaking directly to a
business owner.

DATASET:

File name:
${fileName}

Total rows:
${rowCount}

Columns:
${columns.join(", ")}

Detected business fields:
Revenue: ${revenueColumn || "Not available"}
Units: ${unitsColumn || "Not available"}
Product: ${productColumn || "Not available"}
Region: ${regionColumn || "Not available"}
Date: ${dateColumn || "Not available"}
Customer: ${customerColumn || "Not available"}

Calculated business numbers:
Total Revenue:
${formatMoney(totalRevenue)}

Total Units:
${unitsColumn ? totalUnits.toLocaleString("en-IN") : "Not available"}

Average transaction:
${
  averageOrderValue !== null
    ? formatMoney(averageOrderValue)
    : "Not available"
}

Revenue growth:
${
  growthPercent !== null
    ? `${growthPercent.toFixed(1)}%`
    : "Not available"
}

Top products:
${JSON.stringify(productPerformance.slice(0, 5))}

Regional performance:
${JSON.stringify(regionalPerformance.slice(0, 10))}

Revenue trend:
${JSON.stringify(revenueTrend)}

Dataset sample:
${JSON.stringify(datasetSample)}

Analyze ONLY information supported by the dataset.

Look for:
- Sales and revenue performance
- Growth or decline
- Best and worst performing products
- Customer behavior
- Regional performance
- Important changes
- Unusual results
- Business risks
- Business opportunities
- What the business owner should do next

IMPORTANT RULES:

1. Do NOT invent information.
2. Do NOT make claims that cannot be supported by the dataset.
3. Do NOT use complicated technical language.
4. Always explain WHY something matters to the business.
5. Give practical advice.
6. Keep the writing short and clear.
7. Use simple English.
8. If information is unavailable, clearly say so.
9. Never pretend an assumption is a fact.
10. Use the calculated business numbers above when discussing them.

Return ONLY valid JSON using exactly this structure:

{
  "summary": "2-4 simple sentences explaining what is happening in the business.",
  "trends": [
    "Simple explanation of an important trend and why it matters."
  ],
  "anomalies": [
    "Something unusual in the data and why the business owner should notice it."
  ],
  "opportunities": [
    "A practical opportunity supported by the data."
  ],
  "recommendation": "The single most important action the business should consider next."
}

Do not include markdown.
Do not include code fences.
Do not add anything outside the JSON.
`;

    /*
     * ---------------------------------------------------------
     * 8. GROK ANALYSIS
     * ---------------------------------------------------------
     */

    const response = await fetch(
      "https://api.x.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          messages: [
            {
              role: "system",
              content:
                "You are Aether Intelligence, a clear and practical business intelligence assistant.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "aether_business_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                  },
                  trends: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  anomalies: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  opportunities: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  recommendation: {
                    type: "string",
                  },
                },
                required: [
                  "summary",
                  "trends",
                  "anomalies",
                  "opportunities",
                  "recommendation",
                ],
                additionalProperties: false,
              },
            },
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("XAI API ERROR:", data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Grok could not analyze the dataset.",
        },
        { status: response.status }
      );
    }

    const text =
      data?.choices?.[0]?.message?.content;

    if (!text) {
      return NextResponse.json(
        {
          error: "Grok returned an empty analysis.",
        },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error("GROK JSON ERROR:", error);

      return NextResponse.json(
        {
          error: "Grok returned an invalid analysis format.",
        },
        { status: 500 }
      );
    }

    /*
     * ---------------------------------------------------------
     * 9. FINAL RESPONSE
     * ---------------------------------------------------------
     */

    return NextResponse.json({
      analysis: {
        summary:
          parsed.summary ||
          "No summary was generated.",

        trends: Array.isArray(parsed.trends)
          ? parsed.trends
          : [],

        anomalies: Array.isArray(parsed.anomalies)
          ? parsed.anomalies
          : [],

        opportunities: Array.isArray(parsed.opportunities)
          ? parsed.opportunities
          : [],

        recommendation:
          parsed.recommendation ||
          "No recommendation was generated.",
      },

      analytics: {
        kpis: {
          totalRevenue: totalRevenue,
          totalUnits: unitsColumn
            ? totalUnits
            : null,
          records: rowCount,
          averageOrderValue,
          growthPercent,
        },

        revenueTrend,

        productPerformance,

        regionalPerformance,

        availableMetrics,
      },
    });
  } catch (error) {
    console.error("AI DATA ANALYSIS ERROR:", error);

    return NextResponse.json(
      {
        error:
          "Unable to analyze the dataset right now. Please try again.",
      },
      { status: 500 }
    );
  }
}