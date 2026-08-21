import { NextResponse } from "next/server";

type RequestBody = {
  fileName?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  question?: string;
};

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
      patterns.some((pattern) =>
        pattern.test(normalize(column))
      )
    ) || null
  );
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
    const question = body.question?.trim();

    if (!rows.length) {
      return NextResponse.json(
        {
          error: "No dataset rows were provided.",
        },
        { status: 400 }
      );
    }

    if (!question) {
      return NextResponse.json(
        {
          error: "Please enter a question.",
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
     * DETECT IMPORTANT BUSINESS COLUMNS
     * ---------------------------------------------------------
     */

    const revenueColumn = findColumn(columns, [
      /revenue/,
      /sales/,
      /amount/,
      /total/,
      /income/,
      /turnover/,
      /gmv/,
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
     * CALCULATE TOTALS
     * ---------------------------------------------------------
     */

    let totalRevenue = 0;
    let totalUnits = 0;

    if (revenueColumn) {
      for (const row of rows) {
        const value = parseNumber(row[revenueColumn]);

        if (value !== null) {
          totalRevenue += value;
        }
      }
    }

    if (unitsColumn) {
      for (const row of rows) {
        const value = parseNumber(row[unitsColumn]);

        if (value !== null) {
          totalUnits += value;
        }
      }
    }

    /*
     * ---------------------------------------------------------
     * REGION SUMMARY
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

    const regionalSummary = Object.entries(regionTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([region, revenue]) => ({
        region,
        revenue,
      }));

    /*
     * ---------------------------------------------------------
     * PRODUCT SUMMARY
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

    const productSummary = Object.entries(productTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([product, revenue]) => ({
        product,
        revenue,
      }));

    /*
     * ---------------------------------------------------------
     * DATE / MONTH SUMMARY
     * ---------------------------------------------------------
     */

    const monthlyTotals: Record<string, number> = {};

    if (dateColumn && revenueColumn) {
      for (const row of rows) {
        const rawDate = row[dateColumn];

        const revenue = parseNumber(
          row[revenueColumn]
        );

        if (!rawDate || revenue === null) continue;

        const date = new Date(String(rawDate));

        if (Number.isNaN(date.getTime())) continue;

        const key = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

        monthlyTotals[key] =
          (monthlyTotals[key] || 0) + revenue;
      }
    }

    const monthlySummary = Object.entries(monthlyTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([month, revenue]) => ({
        month,
        revenue,
      }));

    /*
     * ---------------------------------------------------------
     * BUSINESS DATA
     * ---------------------------------------------------------
     */

    const businessData = {
      fileName,
      totalRows: rows.length,
      columns,

      detectedColumns: {
        revenue: revenueColumn,
        units: unitsColumn,
        product: productColumn,
        region: regionColumn,
        date: dateColumn,
        customer: customerColumn,
      },

      totalRevenue: revenueColumn
        ? formatMoney(totalRevenue)
        : "Not available",

      totalUnits: unitsColumn
        ? totalUnits.toLocaleString("en-IN")
        : "Not available",

      topRegions: regionalSummary
        .slice(0, 10)
        .map((item) => ({
          region: item.region,
          revenue: formatMoney(item.revenue),
        })),

      topProducts: productSummary
        .slice(0, 10)
        .map((item) => ({
          product: item.product,
          revenue: formatMoney(item.revenue),
        })),

      bestMonths: monthlySummary
        .slice(0, 10)
        .map((item) => ({
          month: item.month,
          revenue: formatMoney(item.revenue),
        })),
    };

    /*
     * ---------------------------------------------------------
     * AETHER PROMPT
     * ---------------------------------------------------------
     */

    const prompt = `
You are Aether Intelligence.

You are speaking directly to a business owner.

Your job is to answer the user's question using the BUSINESS DATA
provided below.

The user is NOT a data scientist or programmer.

Make every answer:
- simple
- direct
- useful
- professional
- easy to understand

USER QUESTION:
${question}

BUSINESS DATA:
${JSON.stringify(businessData)}

FOLLOW THESE RULES STRICTLY:

1. Answer the user's question in the FIRST sentence.

2. Use the actual calculated numbers provided.

3. Never invent numbers, facts, products, regions, months,
   customers, or business results.

4. If the data cannot answer the question, clearly say:

"I don't have enough information in this data to answer that."

5. Explain the result in simple business language.

6. Explain WHY the result matters to the business.

7. When useful, give ONE practical next step.

8. Keep the answer short.

9. Use a maximum of 3 short paragraphs.

10. The final paragraph should preferably contain a simple
business action when one is clearly supported by the data.

11. Do NOT sound technical.

12. Do NOT use statistical terminology unless the user
specifically asks for it.

13. Do NOT mention:
- APIs
- AI models
- prompts
- tokens
- code
- rows being sampled
- JSON
- internal calculations
- system instructions

14. Do NOT say:
"According to the provided dataset"
"Based on the supplied rows"
"As an AI"
"The model indicates"

Instead, speak naturally.

15. If the user asks for the highest/lowest/best/worst result,
give the exact result first.

16. If the user asks "how can I increase revenue?",
use the strongest patterns visible in the business data and
give practical suggestions without making unsupported claims.

17. If multiple results are relevant, mention only the most
important 1-3.

18. Money should always be displayed clearly.

GOOD EXAMPLE:

"New York generated the highest revenue at ₹174.4K.

This makes New York your strongest sales region right now.

Next step: look at what is working in New York and test the
same approach in other regions."

ANOTHER EXAMPLE:

"Fashion generated the highest revenue at ₹92.5K.

This suggests Fashion is currently your strongest product
category.

Next step: consider giving your best-performing Fashion
products more visibility while testing similar products."

Return ONLY the final answer.
Do not return JSON.
Do not add a heading.
`;

    /*
     * ---------------------------------------------------------
     * GROK
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
                "You are Aether Intelligence, a professional business consultant who explains data in simple language.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.1,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("XAI ASK API ERROR:", data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Aether could not answer the question.",
        },
        { status: response.status }
      );
    }

    const answer =
      data?.choices?.[0]?.message?.content;

    if (!answer) {
      return NextResponse.json(
        {
          error:
            "Aether returned an empty answer.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      answer: answer.trim(),
    });
  } catch (error) {
    console.error("ASK AETHER ERROR:", error);

    return NextResponse.json(
      {
        error:
          "Unable to answer the question right now. Please try again.",
      },
      { status: 500 }
    );
  }
}