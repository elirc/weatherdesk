import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mapPaystackStatus,
  mapPaystackVerify,
  paystackSignature,
  resendBody,
  termiiBody,
  termiiMessageId,
  termiiNumber,
  verifyPaystackSignature,
} from "@/adapters/real/mappers/messaging";

describe("paystack webhook signature (HMAC-SHA512 of raw body, hex)", () => {
  const secret = "sk_test_abc123";
  const raw = '{"event":"charge.success","data":{"reference":"wd_ref_1","amount":500000}}';
  const good = createHmac("sha512", secret).update(raw).digest("hex");

  it("computes the documented signature", () => {
    expect(paystackSignature(raw, secret)).toBe(good);
    expect(good).toHaveLength(128);
  });

  it("accepts the correct signature (case-insensitive hex)", () => {
    expect(verifyPaystackSignature(raw, good, secret)).toBe(true);
    expect(verifyPaystackSignature(raw, good.toUpperCase(), secret)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets, truncated or empty signatures", () => {
    expect(verifyPaystackSignature(raw.replace("500000", "1"), good, secret)).toBe(false);
    expect(verifyPaystackSignature(raw, createHmac("sha512", "other").update(raw).digest("hex"), secret)).toBe(false);
    expect(verifyPaystackSignature(raw, good.slice(0, 64), secret)).toBe(false);
    expect(verifyPaystackSignature(raw, "", secret)).toBe(false);
    expect(verifyPaystackSignature(raw, good, undefined)).toBe(false);
  });
});

describe("paystack verify mapping", () => {
  it("maps status values", () => {
    expect(mapPaystackStatus("success")).toBe("success");
    expect(mapPaystackStatus("failed")).toBe("failed");
    expect(mapPaystackStatus("abandoned")).toBe("failed");
    expect(mapPaystackStatus("reversed")).toBe("failed");
    expect(mapPaystackStatus("ongoing")).toBe("pending");
    expect(mapPaystackStatus(undefined)).toBe("pending");
  });

  it("maps verify data (doc shape: plan string + plan_object, no subscription code)", () => {
    expect(
      mapPaystackVerify({
        status: "success",
        amount: 250000,
        customer: { customer_code: "CUS_xnxdt6s1zg1f4nx" },
        plan: "PLN_gx2wn530m0i3w3m",
        plan_object: { plan_code: "PLN_gx2wn530m0i3w3m" },
      }),
    ).toEqual({
      status: "success",
      amountKobo: 250000,
      customerCode: "CUS_xnxdt6s1zg1f4nx",
      subscriptionCode: undefined,
      planCode: "PLN_gx2wn530m0i3w3m",
    });
    expect(mapPaystackVerify({ status: "abandoned", amount: 100, plan: null, plan_object: {} })).toMatchObject({
      status: "failed",
      planCode: undefined,
    });
  });
});

describe("termii", () => {
  it("strips + and formatting from E.164", () => {
    expect(termiiNumber("+234 801 234 5678")).toBe("2348012345678");
  });

  it("builds the send body with dnd for sms and whatsapp channel", () => {
    expect(termiiBody({ to: "+2348012345678", body: "hi", channel: "sms" }, "k", "WeatherDesk")).toEqual({
      api_key: "k",
      to: "2348012345678",
      from: "WeatherDesk",
      sms: "hi",
      type: "plain",
      channel: "dnd",
    });
    expect(termiiBody({ to: "+2348012345678", body: "hi", channel: "whatsapp" }, "k", "WD").channel).toBe("whatsapp");
  });

  it("reads message_id from the documented response", () => {
    expect(
      termiiMessageId({ code: "ok", message_id: "3017544054459083819856413", message_id_str: "3017544054459083819856413" }),
    ).toBe("3017544054459083819856413");
    expect(() => termiiMessageId({ code: "error", message: "Insufficient balance" })).toThrow(/Insufficient/);
  });
});

describe("resend", () => {
  it("builds the email body with base64 attachments", () => {
    const body = resendBody(
      {
        to: "a@example.com",
        subject: "Weekly report",
        html: "<p>hi</p>",
        text: "hi",
        attachments: [{ filename: "r.pdf", content: Buffer.from("PDF"), contentType: "application/pdf" }],
      },
      "WeatherDesk <reports@weatherdesk.example>",
    );
    expect(body).toEqual({
      from: "WeatherDesk <reports@weatherdesk.example>",
      to: ["a@example.com"],
      subject: "Weekly report",
      html: "<p>hi</p>",
      text: "hi",
      attachments: [{ filename: "r.pdf", content: "UERG", content_type: "application/pdf" }],
    });
  });

  it("omits optional fields when absent", () => {
    const body = resendBody({ to: "a@example.com", subject: "s", html: "<p/>" }, "f@x");
    expect(body).not.toHaveProperty("attachments");
    expect(body).not.toHaveProperty("text");
  });
});
