import { NextResponse } from "next/server";

type RequestBody = {
  question?: string;
  fileName?: string;
  columns?: string[];
  rowCount?: number;
  rows?: Record<string, unknown>[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const question = body.question?.trim();
    const fileName = body.fileName || "Uploaded dataset";
    const columns = body.columns || [];
    const rowCount = body.rowCount || 0;
    const rows = body.rows || [];

    if (!question) {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    if (!rows.length) {
      return NextResponse.json(
        { error: "No dataset is available for analysis." },
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
      Keep the payload controlled for large datasets.
      The dashboard itself still works with the complete dataset.
      Ask Aether receives a representative sample plus dataset structure.
    */

    const sampleSize = Math.min(1000, rows.length);

    const sample =
      rows.length <= sampleSize
        ? rows
        : [
            ...rows.slice(0, Math.floor(sampleSize / 2)),
            ...rows.slice(-Math.floor(sampleSize / 2)),
          ];

    const prompt = `
You are Aether Intelligence, an AI business analyst.

A business owner has uploaded a real business dataset and is asking you a question about it.

Your job is to answer the question using ONLY information supported by the supplied dataset.

QUESTION:
${question}

DATASET:
File name: ${fileName}
Total rows: ${rowCount}
Columns: ${columns.join(", ")}

DATA SAMPLE:
${JSON.stringify(sample)}

IMPORTANT RULES:

1. Answer the user's exact question first.
2. Use simple business English.
3. Do not use unnecessary technical or statistical terminology.
4. Do not invent numbers, customers, products, regions, dates, or business facts.
5. Never present an assumption as a fact.
6. If the supplied data is not enough to answer the question confidently, say so clearly.
7. When giving numbers, use only numbers supported by the dataset.
8. Explain WHY the result matters to the business.
9. Give a practical business takeaway when appropriate.
10. Do not mention that you are looking at a "sample" unless the available information genuinely prevents a reliable answer.
11. Do not give generic advice unrelated to the uploaded dataset.
12. Be concise but useful.

Return ONLY valid JSON in exactly this structure:

{
  "answer": "Direct answer to the user's question.",
  "evidence": [
    "Important fact from the dataset supporting the answer.",
    "Another useful fact from the dataset."
  ],
  "business_impact": "Why this matters to the business.",
  "next_action": "The most useful practical action based on the data."
}

Do not include markdown.
Do not include code fences.
Do not add anything outside the JSON.
`;

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
                "You are Aether Intelligence, a precise and practical business intelligence assistant.",
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
              name: "aether_analyst_answer",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  answer: {
                    type: "string",
                  },
                  evidence: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  business_impact: {
                    type: "string",
                  },
                  next_action: {
                    type: "string",
                  },
                },
                required: [
                  "answer",
                  "evidence",
                  "business_impact",
                  "next_action",
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
      console.error("ASK AETHER XAI ERROR:", data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Aether could not answer the question.",
        },
        { status: response.status }
      );
    }

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      return NextResponse.json(
        {
          error: "Aether returned an empty answer.",
        },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error("ASK AETHER JSON ERROR:", error);

      return NextResponse.json(
        {
          error: "Aether returned an invalid answer format.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      answer: {
        answer:
          parsed.answer ||
          "I could not find a reliable answer in the uploaded data.",

        evidence: Array.isArray(parsed.evidence)
          ? parsed.evidence
          : [],

        business_impact:
          parsed.business_impact ||
          "The available data does not provide enough information.",

        next_action:
          parsed.next_action ||
          "Review the relevant data before taking action.",
      },
    });
  } catch (error) {
    console.error("ASK AETHER ERROR:", error);

    return NextResponse.json(
      {
        error:
          "Unable to answer your question right now. Please try again.",
      },
      { status: 500 }
    );
  }
}